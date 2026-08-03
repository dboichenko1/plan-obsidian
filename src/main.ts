import { Plugin, WorkspaceLeaf } from "obsidian";
import { createClient, SupabaseClient, Session } from "@supabase/supabase-js";
import { PlannerSettingTab } from "./settings";
import { PlannerView, VIEW_TYPE_PLANNER } from "./view";
import { registerPlannerCodeBlock } from "./codeblock";
import { Task } from "./types";
import { localToday, computeUrgency } from "./util";

const SUPABASE_URL = "https://qlanlvhxiixdhozpsbwr.supabase.co";
// Публичный anon-ключ: безопасность обеспечивается RLS на стороне Supabase.
const SUPABASE_ANON_KEY =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsYW5sdmh4aWl4ZGhvenBzYndyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2Mzg5NDksImV4cCI6MjEwMTIxNDk0OX0.BC-Z5eliOdb2TkLjgcvUCP_ooHqe7pwO8HG4xAxzg_A";

export interface StoredSession {
	access_token: string;
	refresh_token: string;
	email: string | null;
}

export interface PlannerData {
	session: StoredSession | null;
}

const DEFAULT_DATA: PlannerData = {
	session: null,
};

export default class PlannerPlugin extends Plugin {
	settings: PlannerData = { ...DEFAULT_DATA };
	supabase!: SupabaseClient;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_DATA, await this.loadData());

		// Клиент без встроенного localStorage: сессию храним сами в данных плагина.
		this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
			auth: {
				persistSession: false,
				autoRefreshToken: true,
				detectSessionInUrl: false,
			},
		});

		const { data: authSub } = this.supabase.auth.onAuthStateChange((event, session) => {
			if (event === "SIGNED_OUT") {
				this.settings.session = null;
				void this.saveSettings();
			} else if (session) {
				void this.storeSession(session);
			}
		});
		this.register(() => authSub.subscription.unsubscribe());

		await this.restoreSession();

		this.registerView(VIEW_TYPE_PLANNER, (leaf) => new PlannerView(leaf, this));

		this.addRibbonIcon("calendar-check", "Планировщик: открыть панель", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-panel",
			name: "Открыть панель задач",
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new PlannerSettingTab(this.app, this));
		registerPlannerCodeBlock(this);
	}

	// ---------- Сессия ----------

	isLoggedIn(): boolean {
		return this.settings.session !== null;
	}

	async storeSession(session: Session): Promise<void> {
		this.settings.session = {
			access_token: session.access_token,
			refresh_token: session.refresh_token,
			email: session.user?.email ?? null,
		};
		await this.saveSettings();
	}

	private async restoreSession(): Promise<void> {
		const stored = this.settings.session;
		if (!stored) return;
		try {
			const { error } = await this.supabase.auth.setSession({
				access_token: stored.access_token,
				refresh_token: stored.refresh_token,
			});
			if (error) {
				console.error("Планировщик: не удалось восстановить сессию", error);
				this.settings.session = null;
				await this.saveSettings();
			}
		} catch (err) {
			// Например, нет сети: сохранённую сессию не трогаем, попробуем в следующий раз.
			console.error("Планировщик: ошибка восстановления сессии", err);
		}
	}

	async signOut(): Promise<void> {
		try {
			await this.supabase.auth.signOut();
		} catch (err) {
			console.error("Планировщик: ошибка при выходе", err);
		}
		this.settings.session = null;
		await this.saveSettings();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ---------- Данные ----------

	private async currentUserId(): Promise<string | null> {
		const { data } = await this.supabase.auth.getSession();
		return data.session?.user?.id ?? null;
	}

	/** Все открытые неудалённые задачи пользователя. */
	async fetchOpenTasks(): Promise<Task[]> {
		const { data, error } = await this.supabase
			.from("tasks")
			.select("*")
			.eq("status", "open")
			.is("deleted_at", null)
			.order("order_index", { ascending: true });
		if (error) throw error;
		return (data ?? []) as Task[];
	}

	/** Открытые неудалённые задачи на конкретный день (scheduled_on = day). */
	async fetchOpenTasksForDay(day: string): Promise<Task[]> {
		const { data, error } = await this.supabase
			.from("tasks")
			.select("*")
			.eq("status", "open")
			.is("deleted_at", null)
			.eq("scheduled_on", day)
			.order("order_index", { ascending: true });
		if (error) throw error;
		return (data ?? []) as Task[];
	}

	/** Быстрое добавление: задача на сегодня, importance 2, urgency_manual 1, order_index 999. */
	async addTask(title: string): Promise<void> {
		const userId = await this.currentUserId();
		if (!userId) throw new Error("нет активной сессии, войдите в настройках");
		const { error } = await this.supabase.from("tasks").insert({
			user_id: userId,
			title,
			scheduled_on: localToday(),
			importance: 2,
			urgency_manual: 1,
			order_index: 999,
		});
		if (error) throw error;
	}

	/** Выполнить задачу: status done + completed_at + urgency_at_completion. */
	async completeTask(task: Task): Promise<void> {
		const urgency = computeUrgency(task, localToday());
		const { error } = await this.supabase
			.from("tasks")
			.update({
				status: "done",
				completed_at: new Date().toISOString(),
				urgency_at_completion: urgency,
			})
			.eq("id", task.id);
		if (error) throw error;
	}

	// ---------- Панель ----------

	async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(VIEW_TYPE_PLANNER)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) return;
			await leaf.setViewState({ type: VIEW_TYPE_PLANNER, active: true });
		}
		void workspace.revealLeaf(leaf);
	}
}
