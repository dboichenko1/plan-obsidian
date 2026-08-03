import { ItemView, Menu, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type PlannerPlugin from "./main";
import { NOT_CONFIGURED_MESSAGE } from "./main";
import { Task, Category } from "./types";
import {
	localToday,
	addDays,
	longDate,
	computeUrgency,
	taskSubtitle,
	errorMessage,
} from "./util";
import { TaskCardModal, DatePromptModal } from "./card";

export const VIEW_TYPE_PLANNER = "tile-day-planner-view";

export class PlannerView extends ItemView {
	plugin: PlannerPlugin;
	private contentDiv: HTMLElement | null = null;
	private overdueOpen = false;
	private noDateOpen = false;
	private doneOpen = false;
	private selectedDay: string = localToday();
	private categories: Category[] = [];
	private catById = new Map<string, Category>();
	private quickInput: HTMLInputElement | null = null;

	constructor(leaf: WorkspaceLeaf, plugin: PlannerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_PLANNER;
	}

	getDisplayText(): string {
		return "Tile Day Planner";
	}

	getIcon(): string {
		return "calendar-check";
	}

	async onOpen(): Promise<void> {
		const root = this.contentEl;
		root.empty();
		root.addClass("planner-view");

		const toolbar = root.createDiv({ cls: "planner-toolbar" });

		const input = toolbar.createEl("input", {
			cls: "planner-quick-add",
			type: "text",
			placeholder: "New task — press Enter",
		});
		this.quickInput = input;
		input.addEventListener("keydown", async (evt) => {
			if (evt.key !== "Enter") return;
			const title = input.value.trim();
			if (!title) return;
			input.disabled = true;
			try {
				await this.plugin.addTask(title, this.selectedDay);
				input.value = "";
				await this.refresh();
			} catch (err) {
				new Notice("Failed to add task: " + errorMessage(err));
			} finally {
				input.disabled = false;
				input.focus();
			}
		});

		const refreshBtn = toolbar.createEl("button", {
			cls: "planner-refresh clickable-icon",
			attr: { "aria-label": "Refresh" },
		});
		setIcon(refreshBtn, "refresh-cw");
		refreshBtn.addEventListener("click", () => void this.refresh());

		this.contentDiv = root.createDiv({ cls: "planner-content" });
		await this.refresh();
	}

	async onClose(): Promise<void> {
		this.contentDiv = null;
		this.quickInput = null;
	}

	async refresh(): Promise<void> {
		const el = this.contentDiv;
		if (!el) return;
		el.empty();

		if (!this.plugin.isConfigured()) {
			el.createDiv({ cls: "planner-empty", text: NOT_CONFIGURED_MESSAGE });
			return;
		}
		if (!this.plugin.isLoggedIn()) {
			el.createDiv({ cls: "planner-empty", text: "Sign in in the Tile Day Planner settings." });
			return;
		}

		el.createDiv({ cls: "planner-empty", text: "Loading…" });

		let tasks: Task[];
		let doneToday: Task[];
		try {
			if (this.categories.length === 0) {
				this.categories = await this.plugin.fetchCategories();
				this.catById = new Map(this.categories.map((c) => [c.id, c]));
			}
			tasks = await this.plugin.fetchOpenTasks();
			doneToday = await this.plugin.fetchDoneTasksForDay(this.selectedDay);
		} catch (err) {
			el.empty();
			el.createDiv({ cls: "planner-error", text: "Failed to load tasks: " + errorMessage(err) });
			return;
		}
		el.empty();

		const today = localToday();
		const dayTasks = tasks.filter((t) => t.scheduled_on === this.selectedDay);
		const overdue = tasks.filter((t) => t.scheduled_on !== null && t.scheduled_on < today);
		const noDate = tasks.filter((t) => t.scheduled_on === null);

		this.renderDayNav(el);

		const daySection = el.createDiv({ cls: "planner-section" });
		const dayLabel = this.selectedDay === today ? "Today" : longDate(this.selectedDay);
		daySection.createDiv({ cls: "planner-section-title", text: `${dayLabel} · ${dayTasks.length}` });
		this.renderTaskList(daySection, dayTasks, today, "No tasks for this day");

		if (doneToday.length > 0) {
			this.renderCollapsible(el, `Done · ${doneToday.length}`, doneToday, today, this.doneOpen, (v) => {
				this.doneOpen = v;
			});
		}

		this.renderCollapsible(el, `Overdue · ${overdue.length}`, overdue, today, this.overdueOpen, (v) => {
			this.overdueOpen = v;
		});
		this.renderCollapsible(el, `No date · ${noDate.length}`, noDate, today, this.noDateOpen, (v) => {
			this.noDateOpen = v;
		});
	}

	private renderDayNav(parent: HTMLElement): void {
		const nav = parent.createDiv({ cls: "planner-daynav" });
		const prev = nav.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Previous day" } });
		setIcon(prev, "chevron-left");
		prev.onclick = () => {
			this.selectedDay = addDays(this.selectedDay, -1);
			void this.refresh();
		};

		const label = nav.createEl("button", { cls: "planner-daynav-label" });
		label.setText(this.selectedDay === localToday() ? "Today" : longDate(this.selectedDay));
		label.onclick = () => {
			this.selectedDay = localToday();
			void this.refresh();
		};

		const next = nav.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "Next day" } });
		setIcon(next, "chevron-right");
		next.onclick = () => {
			this.selectedDay = addDays(this.selectedDay, 1);
			void this.refresh();
		};
	}

	private renderCollapsible(
		parent: HTMLElement,
		title: string,
		tasks: Task[],
		today: string,
		open: boolean,
		setOpen: (v: boolean) => void
	): void {
		const details = parent.createEl("details", { cls: "planner-section" });
		details.open = open;
		details.addEventListener("toggle", () => setOpen(details.open));
		details.createEl("summary", { cls: "planner-section-title", text: title });
		this.renderTaskList(details, tasks, today, "Nothing here");
	}

	private renderTaskList(parent: HTMLElement, tasks: Task[], today: string, emptyText: string): void {
		const list = parent.createDiv({ cls: "planner-list" });
		if (tasks.length === 0) {
			list.createDiv({ cls: "planner-empty", text: emptyText });
			return;
		}
		for (const task of tasks) {
			this.renderTaskRow(list, task, today);
		}
	}

	private renderTaskRow(list: HTMLElement, task: Task, today: string): void {
		const row = list.createDiv({ cls: "planner-task" });

		const checkbox = row.createEl("input", { cls: "planner-check", type: "checkbox" });
		checkbox.checked = task.status === "done";
		checkbox.addEventListener("change", async () => {
			checkbox.disabled = true;
			try {
				if (checkbox.checked) await this.plugin.completeTask(task);
				else await this.plugin.reopenTask(task);
				await this.refresh();
			} catch (err) {
				checkbox.checked = task.status === "done";
				checkbox.disabled = false;
				new Notice("Failed: " + errorMessage(err));
			}
		});

		const urgency = computeUrgency(task, today);
		row.createSpan({
			cls: `planner-dot planner-urgency-${urgency}`,
			attr: { "aria-label": `Urgency ${urgency}` },
		});

		const body = row.createDiv({ cls: "planner-task-body" });
		const titleEl = body.createSpan({ cls: "planner-title", text: task.title });
		if (task.status === "done") titleEl.addClass("planner-title-done");
		titleEl.onclick = () => this.openCard(task);

		const catName = task.category_id ? this.catById.get(task.category_id)?.name ?? null : null;
		const subtitle = taskSubtitle(task, today, catName);
		if (subtitle) body.createDiv({ cls: "planner-subtitle", text: subtitle });

		row.addEventListener("contextmenu", (e) => {
			e.preventDefault();
			this.showContextMenu(e, task, today);
		});
	}

	private openCard(task: Task): void {
		new TaskCardModal(this.app, this.plugin, task, this.categories, () => void this.refresh()).open();
	}

	private showContextMenu(e: MouseEvent, task: Task, today: string): void {
		const menu = new Menu();
		const act = (fn: () => Promise<unknown>) => async () => {
			try {
				await fn();
				await this.refresh();
			} catch (err) {
				new Notice("Failed: " + errorMessage(err));
			}
		};

		menu.addItem((i) => i.setTitle("Open").setIcon("edit").onClick(() => this.openCard(task)));
		if (task.status === "open") {
			menu.addItem((i) => i.setTitle("Complete").setIcon("check").onClick(act(() => this.plugin.completeTask(task))));
		} else {
			menu.addItem((i) => i.setTitle("Reopen").setIcon("rotate-ccw").onClick(act(() => this.plugin.reopenTask(task))));
		}
		menu.addItem((i) => i.setTitle("Today").setIcon("calendar").onClick(act(() => this.plugin.moveToDay(task, localToday()))));
		menu.addItem((i) => i.setTitle("Tomorrow").setIcon("calendar-plus").onClick(act(() => this.plugin.moveToDay(task, addDays(localToday(), 1)))));
		menu.addItem((i) =>
			i.setTitle("Pick date…").setIcon("calendar-search").onClick(() => {
				new DatePromptModal(this.app, task.scheduled_on ?? today, (date) => {
					void act(() => this.plugin.moveToDay(task, date))();
				}).open();
			}),
		);
		menu.addItem((i) => i.setTitle("Remove from plan").setIcon("inbox").onClick(act(() => this.plugin.moveToDay(task, null))));
		menu.addSeparator();
		menu.addItem((i) => i.setTitle("Delete").setIcon("trash").onClick(act(() => this.plugin.deleteTask(task))));

		const isOverdue = task.scheduled_on !== null && task.scheduled_on < today && task.status === "open";
		if (isOverdue) {
			menu.addItem((i) =>
				i
					.setTitle("Delete all with this title")
					.setIcon("trash-2")
					.onClick(
						act(async () => {
							const n = await this.plugin.deleteAllWithTitle(task.title);
							new Notice(`Deleted ${n}`);
						}),
					),
			);
		}

		menu.showAtMouseEvent(e);
	}
}
