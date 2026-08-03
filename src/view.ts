import { ItemView, Notice, WorkspaceLeaf, setIcon } from "obsidian";
import type PlannerPlugin from "./main";
import { NOT_CONFIGURED_MESSAGE } from "./main";
import { Task } from "./types";
import { localToday, computeUrgency, errorMessage } from "./util";

export const VIEW_TYPE_PLANNER = "tile-day-planner-view";

export class PlannerView extends ItemView {
	plugin: PlannerPlugin;
	private contentDiv: HTMLElement | null = null;
	private overdueOpen = false;
	private noDateOpen = false;

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
		input.addEventListener("keydown", async (evt) => {
			if (evt.key !== "Enter") return;
			const title = input.value.trim();
			if (!title) return;
			input.disabled = true;
			try {
				await this.plugin.addTask(title);
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
			el.createDiv({
				cls: "planner-empty",
				text: "Sign in in the Tile Day Planner settings.",
			});
			return;
		}

		el.createDiv({ cls: "planner-empty", text: "Loading…" });
		let tasks: Task[];
		try {
			tasks = await this.plugin.fetchOpenTasks();
		} catch (err) {
			el.empty();
			el.createDiv({ cls: "planner-error", text: "Failed to load tasks: " + errorMessage(err) });
			return;
		}
		el.empty();

		const today = localToday();
		const todayTasks = tasks.filter((t) => t.scheduled_on === today);
		const overdue = tasks.filter((t) => t.scheduled_on !== null && t.scheduled_on < today);
		const noDate = tasks.filter((t) => t.scheduled_on === null);

		const todaySection = el.createDiv({ cls: "planner-section" });
		todaySection.createDiv({ cls: "planner-section-title", text: `Today · ${todayTasks.length}` });
		this.renderTaskList(todaySection, todayTasks, today, "No tasks for today");

		this.renderCollapsible(el, `Overdue · ${overdue.length}`, overdue, today, this.overdueOpen, (v) => {
			this.overdueOpen = v;
		});
		this.renderCollapsible(el, `No date · ${noDate.length}`, noDate, today, this.noDateOpen, (v) => {
			this.noDateOpen = v;
		});
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
			const row = list.createDiv({ cls: "planner-task" });

			const checkbox = row.createEl("input", { cls: "planner-check", type: "checkbox" });
			checkbox.addEventListener("change", async () => {
				if (!checkbox.checked) return;
				checkbox.disabled = true;
				try {
					await this.plugin.completeTask(task);
					await this.refresh();
				} catch (err) {
					checkbox.checked = false;
					checkbox.disabled = false;
					new Notice("Failed to complete task: " + errorMessage(err));
				}
			});

			const urgency = computeUrgency(task, today);
			row.createSpan({
				cls: `planner-dot planner-urgency-${urgency}`,
				attr: { "aria-label": `Urgency ${urgency}` },
			});
			row.createSpan({ cls: "planner-title", text: task.title });
		}
	}
}
