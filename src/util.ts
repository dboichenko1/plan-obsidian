import { Task } from "./types";

/** Сегодняшняя дата в локальном часовом поясе, строкой 'YYYY-MM-DD'. */
export function localToday(): string {
	const d = new Date();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}

/** Разница в днях между двумя датами-строками 'YYYY-MM-DD' (to - from). */
export function daysUntil(from: string, to: string): number {
	const [fy, fm, fd] = from.split("-").map(Number);
	const [ty, tm, td] = to.split("-").map(Number);
	return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Срочность задачи 1..4.
 * Если due_on задан: сегодня/просрочено → 4, ≤3 дней → 3, ≤7 дней → 2, иначе 1.
 * Без due_on — urgency_manual.
 */
export function computeUrgency(task: Pick<Task, "due_on" | "urgency_manual">, today: string): number {
	if (!task.due_on) return task.urgency_manual;
	const diff = daysUntil(today, task.due_on);
	if (diff <= 0) return 4;
	if (diff <= 3) return 3;
	if (diff <= 7) return 2;
	return 1;
}

/** Человекочитаемое сообщение из любой ошибки (Error, PostgrestError и т.п.). */
export function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (err && typeof err === "object" && "message" in err) {
		return String((err as { message: unknown }).message);
	}
	return String(err);
}
