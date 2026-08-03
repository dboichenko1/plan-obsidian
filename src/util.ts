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

/** Прибавить n дней к дате-строке 'YYYY-MM-DD'; работает над UTC, часового пояса не появляется. */
export function addDays(date: string, n: number): string {
	const [y, m, d] = date.split("-").map(Number);
	const t = new Date(Date.UTC(y, m - 1, d + n));
	const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
	const dd = String(t.getUTCDate()).padStart(2, "0");
	return `${t.getUTCFullYear()}-${mm}-${dd}`;
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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** «Aug 3» из 'YYYY-MM-DD'. */
export function shortDate(date: string): string {
	const [, m, d] = date.split("-").map(Number);
	return `${MONTHS[m - 1]} ${d}`;
}

/** «Mon, Aug 3» из 'YYYY-MM-DD'. */
export function longDate(date: string): string {
	const [y, m, d] = date.split("-").map(Number);
	const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
	return `${wd}, ${MONTHS[m - 1]} ${d}`;
}

export const IMPORTANCE_LABELS = ["", "Small", "Normal", "Big", "Key"];
export const URGENCY_LABELS = ["", "Someday", "This week", "Soon", "Burning"];

/** Вторая строка задачи: срок/время/категория, либо «N days late» для просроченного. */
export function taskSubtitle(task: Task, today: string, categoryName: string | null): string {
	const parts: string[] = [];
	if (task.scheduled_on !== null && task.scheduled_on < today && task.status === "open") {
		const late = daysUntil(task.scheduled_on, today);
		return `${late} ${late === 1 ? "day" : "days"} late`;
	}
	if (task.due_on) {
		const diff = daysUntil(today, task.due_on);
		let when: string;
		if (diff === 0) when = "today";
		else if (diff === 1) when = "tomorrow";
		else if (diff === -1) when = "yesterday";
		else when = shortDate(task.due_on);
		if (task.due_time) when += " " + task.due_time.slice(0, 5);
		parts.push(when);
	}
	if (categoryName) parts.push(categoryName.toLowerCase());
	return parts.join(" · ");
}

/** Человекочитаемое сообщение из любой ошибки (Error, PostgrestError и т.п.). */
export function errorMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (err && typeof err === "object" && "message" in err) {
		return String((err as { message: unknown }).message);
	}
	return String(err);
}
