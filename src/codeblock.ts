import type PlannerPlugin from "./main";
import { NOT_CONFIGURED_MESSAGE } from "./main";
import { localToday, computeUrgency, errorMessage } from "./util";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Код-блок:
 * ```planner
 * YYYY-MM-DD
 * ```
 * Пустое тело — сегодняшний день. Рендерит открытые задачи дня.
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
		el.createDiv({
			cls: "planner-block-title",
			text: day === today ? `Today · ${day}` : day,
		});

		try {
			const tasks = await plugin.fetchOpenTasksForDay(day);
			if (tasks.length === 0) {
				el.createDiv({ cls: "planner-empty", text: "No open tasks." });
				return;
			}
			const list = el.createDiv({ cls: "planner-list" });
			for (const task of tasks) {
				const row = list.createDiv({ cls: "planner-task" });
				const urgency = computeUrgency(task, today);
				row.createSpan({
					cls: `planner-dot planner-urgency-${urgency}`,
					attr: { "aria-label": `Urgency ${urgency}` },
				});
				row.createSpan({ cls: "planner-title", text: task.title });
			}
		} catch (err) {
			el.createDiv({ cls: "planner-error", text: "Failed to load tasks: " + errorMessage(err) });
		}
	});
}
