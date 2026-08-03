/** Строка таблицы tasks в Supabase. Даты due_on/scheduled_on/occurrence_on — строки 'YYYY-MM-DD'. */
export interface Task {
	id: string;
	user_id: string;
	title: string;
	note: string | null;
	importance: number;
	urgency_manual: number;
	due_on: string | null;
	due_time: string | null;
	scheduled_on: string | null;
	category_id: string | null;
	template_id: string | null;
	occurrence_on: string | null;
	order_index: number;
	status: "open" | "done";
	completed_at: string | null;
	urgency_at_completion: number | null;
	created_at: string;
	updated_at: string;
	deleted_at: string | null;
}

/** Строка таблицы categories. */
export interface Category {
	id: string;
	user_id: string;
	name: string;
	icon: string;
	sort_order: number;
	archived_at: string | null;
}
