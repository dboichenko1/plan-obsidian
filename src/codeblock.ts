import type PlannerPlugin from "./main";
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
				text: "Планировщик: укажите дату в формате YYYY-MM-DD или оставьте блок пустым.",
			});
			return;
		}

		if (!plugin.isLoggedIn()) {
			el.createDiv({ cls: "planner-empty", text: "Планировщик: войдите в настройках плагина." });
			return;
		}

		const today = localToday();
		el.createDiv({
			cls: "planner-block-title",
			text: day === today ? `Сегодня · ${day}` : day,
		});

		try {
			const tasks = await plugin.fetchOpenTasksForDay(day);
			if (tasks.length === 0) {
				el.createDiv({ cls: "planner-empty", text: "Нет открытых задач." });
				return;
			}
			const list = el.createDiv({ cls: "planner-list" });
			for (const task of tasks) {
				const row = list.createDiv({ cls: "planner-task" });
				const urgency = computeUrgency(task, today);
				row.createSpan({
					cls: `planner-dot planner-urgency-${urgency}`,
					attr: { "aria-label": `Срочность ${urgency}` },
				});
				row.createSpan({ cls: "planner-title", text: task.title });
			}
		} catch (err) {
			el.createDiv({ cls: "planner-error", text: "Ошибка загрузки: " + errorMessage(err) });
		}
	});
}
