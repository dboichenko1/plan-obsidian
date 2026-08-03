import { App, Modal, Notice, Setting } from "obsidian";
import type PlannerPlugin from "./main";
import { Task, Category } from "./types";
import {
	localToday,
	addDays,
	computeUrgency,
	errorMessage,
	IMPORTANCE_LABELS,
	URGENCY_LABELS,
} from "./util";

/** Карточка задачи: правка полей и действия. onDone вызывается после любого изменения. */
export class TaskCardModal extends Modal {
	private plugin: PlannerPlugin;
	private task: Task;
	private categories: Category[];
	private onDone: () => void;

	private title: string;
	private note: string;
	private importance: number;
	private urgencyManual: number;
	private dueOn: string;
	private dueTime: string;
	private scheduledOn: string;
	private categoryId: string;
	private deleteArmed = false;

	constructor(app: App, plugin: PlannerPlugin, task: Task, categories: Category[], onDone: () => void) {
		super(app);
		this.plugin = plugin;
		this.task = task;
		this.categories = categories;
		this.onDone = onDone;
		this.title = task.title;
		this.note = task.note ?? "";
		this.importance = task.importance;
		this.urgencyManual = task.urgency_manual;
		this.dueOn = task.due_on ?? "";
		this.dueTime = task.due_time ? task.due_time.slice(0, 5) : "";
		this.scheduledOn = task.scheduled_on ?? "";
		this.categoryId = task.category_id ?? "";
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("planner-card");
		contentEl.createEl("h3", { text: "Task" });

		new Setting(contentEl).setName("Title").addText((t) =>
			t.setValue(this.title).onChange((v) => (this.title = v)),
		);

		new Setting(contentEl).setName("Note").addTextArea((t) =>
			t.setValue(this.note).onChange((v) => (this.note = v)),
		);

		new Setting(contentEl).setName("Importance").addDropdown((d) => {
			for (let i = 1; i <= 4; i++) d.addOption(String(i), IMPORTANCE_LABELS[i]);
			d.setValue(String(this.importance)).onChange((v) => (this.importance = Number(v)));
		});

		const urgencySetting = new Setting(contentEl).setName("Urgency").addDropdown((d) => {
			for (let i = 1; i <= 4; i++) d.addOption(String(i), URGENCY_LABELS[i]);
			d.setValue(String(this.urgencyManual)).onChange((v) => (this.urgencyManual = Number(v)));
		});
		if (this.dueOn) {
			const computed = computeUrgency({ due_on: this.dueOn, urgency_manual: this.urgencyManual }, localToday());
			urgencySetting.setDesc(`Colour comes from the due date (now: ${URGENCY_LABELS[computed]}).`);
		}

		new Setting(contentEl).setName("Due date (YYYY-MM-DD)").addText((t) =>
			t.setPlaceholder("empty = none").setValue(this.dueOn).onChange((v) => (this.dueOn = v.trim())),
		);
		new Setting(contentEl).setName("Due time (HH:MM)").addText((t) =>
			t.setPlaceholder("empty = none").setValue(this.dueTime).onChange((v) => (this.dueTime = v.trim())),
		);
		new Setting(contentEl).setName("Scheduled day (YYYY-MM-DD)").addText((t) =>
			t.setPlaceholder("empty = no day").setValue(this.scheduledOn).onChange((v) => (this.scheduledOn = v.trim())),
		);

		new Setting(contentEl).setName("Category").addDropdown((d) => {
			d.addOption("", "—");
			for (const c of this.categories) d.addOption(c.id, c.name);
			d.setValue(this.categoryId).onChange((v) => (this.categoryId = v));
		});

		// --- Действия ---
		const actions = contentEl.createDiv({ cls: "planner-card-actions" });

		const save = actions.createEl("button", { cls: "mod-cta", text: "Save" });
		save.onclick = () => void this.save();

		if (this.task.status === "open") {
			const done = actions.createEl("button", { text: "Complete" });
			done.onclick = () => void this.run(() => this.plugin.completeTask(this.task));
		} else {
			const reopen = actions.createEl("button", { text: "Reopen" });
			reopen.onclick = () => void this.run(() => this.plugin.reopenTask(this.task));
		}

		const today = actions.createEl("button", { text: "Today" });
		today.onclick = () => void this.run(() => this.plugin.moveToDay(this.task, localToday()));

		const tomorrow = actions.createEl("button", { text: "Tomorrow" });
		tomorrow.onclick = () => void this.run(() => this.plugin.moveToDay(this.task, addDays(localToday(), 1)));

		const unplan = actions.createEl("button", { text: "Remove from plan" });
		unplan.onclick = () => void this.run(() => this.plugin.moveToDay(this.task, null));

		const del = actions.createEl("button", { cls: "mod-warning", text: "Delete" });
		del.onclick = () => {
			if (!this.deleteArmed) {
				this.deleteArmed = true;
				del.setText("Sure?");
				setTimeout(() => {
					this.deleteArmed = false;
					del.setText("Delete");
				}, 3000);
				return;
			}
			void this.run(() => this.plugin.deleteTask(this.task));
		};
	}

	private async save(): Promise<void> {
		await this.run(() =>
			this.plugin.updateTask(this.task.id, {
				title: this.title.trim() || this.task.title,
				note: this.note.trim() ? this.note.trim() : null,
				importance: this.importance,
				urgency_manual: this.urgencyManual,
				due_on: this.dueOn || null,
				due_time: this.dueOn && this.dueTime ? this.dueTime : null,
				scheduled_on: this.scheduledOn || null,
				category_id: this.categoryId || null,
			}),
		);
	}

	private async run(fn: () => Promise<unknown>): Promise<void> {
		try {
			await fn();
			this.onDone();
			this.close();
		} catch (err) {
			new Notice("Failed: " + errorMessage(err));
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/** Маленькая модалка ввода даты 'YYYY-MM-DD'. */
export class DatePromptModal extends Modal {
	private value: string;
	private onSubmit: (date: string) => void;

	constructor(app: App, initial: string, onSubmit: (date: string) => void) {
		super(app);
		this.value = initial;
		this.onSubmit = onSubmit;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Pick a date" });
		let value = this.value;
		new Setting(contentEl).setName("Date (YYYY-MM-DD)").addText((t) => {
			t.setValue(value).onChange((v) => (value = v.trim()));
			t.inputEl.addEventListener("keydown", (e) => {
				if (e.key === "Enter") submit();
			});
		});
		const submit = () => {
			if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
				this.onSubmit(value);
				this.close();
			} else {
				new Notice("Use YYYY-MM-DD");
			}
		};
		const actions = contentEl.createDiv({ cls: "planner-card-actions" });
		const ok = actions.createEl("button", { cls: "mod-cta", text: "Move" });
		ok.onclick = submit;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
