import { Notice } from "obsidian";
import type PlannerPlugin from "./main";
import { NOT_CONFIGURED_MESSAGE } from "./main";
import { localToday, computeUrgency, taskSubtitle, errorMessage } from "./util";
import { TaskCardModal } from "./card";
import { Category } from "./types";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Код-блок:
 * ```planner
 * YYYY-MM-DD
 * ```
 * Пустое тело — сегодняшний день. Рендерит открытые задачи дня; чекбоксы и
 * названия кликабельны.
 */
export function registerPlannerCodeBlock(plugin: PlannerPlugin): void {
	plugin.registerMarkdownCodeBlockProcessor("planner", async (source, el) => {
		el.addClass("planner-block");
		const raw = source.trim();
		const day = raw === "" ? localToday() : raw;

		if (!DATE_RE.test(day)) {
			el.createDiv({
				cls: "planner-error",
				text: "Use a date in YYYY-MM-DD format or leave the block empty.",
			});
			return;
		}
		if (!plugin.isConfigured()) {
			el.createDiv({ cls: "planner-empty", text: NOT_CONFIGURED_MESSAGE });
			return;
		}
		if (!plugin.isLoggedIn()) {
			el.createDiv({ cls: "planner-empty", text: "Sign in in the Tile Day Planner settings." });
			return;
		}

		const today = localToday();
		el.createDiv({ cls: "planner-block-title", text: day === today ? `Today · ${day}` : day });
		const container = el.createDiv();

		const render = async () => {
			container.empty();
			try {
				let categories: Category[] = [];
				try {
					categories = await plugin.fetchCategories();
				} catch {
					categories = [];
				}
				const catById = new Map(categories.map((c) => [c.id, c]));
				const tasks = await plugin.fetchOpenTasksForDay(day);
				if (tasks.length === 0) {
					container.createDiv({ cls: "planner-empty", text: "No open tasks." });
					return;
				}
				const list = container.createDiv({ cls: "planner-list" });
				for (const task of tasks) {
					const row = list.createDiv({ cls: "planner-task" });
					const checkbox = row.createEl("input", { cls: "planner-check", type: "checkbox" });
					checkbox.addEventListener("change", async () => {
						if (!checkbox.checked) return;
						checkbox.disabled = true;
						try {
							await plugin.completeTask(task);
							await render();
						} catch (err) {
							checkbox.checked = false;
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
					titleEl.onclick = () =>
						new TaskCardModal(plugin.app, plugin, task, categories, () => void render()).open();
					const catName = task.category_id ? catById.get(task.category_id)?.name ?? null : null;
					const subtitle = taskSubtitle(task, today, catName);
					if (subtitle) body.createDiv({ cls: "planner-subtitle", text: subtitle });
				}
			} catch (err) {
				container.createDiv({ cls: "planner-error", text: "Failed to load tasks: " + errorMessage(err) });
			}
		};

		await render();
	});
}
