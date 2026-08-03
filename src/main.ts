import { Plugin, WorkspaceLeaf } from "obsidian";
import { createClient, SupabaseClient, Session } from "@supabase/supabase-js";
import { PlannerSettingTab } from "./settings";
import { PlannerView, VIEW_TYPE_PLANNER } from "./view";
import { registerPlannerCodeBlock } from "./codeblock";
import { Task } from "./types";
import { localToday, computeUrgency } from "./util";

/** Показывается панелью и код-блоком, пока не заполнены URL и ключ. */
export const NOT_CONFIGURED_MESSAGE = "Set Supabase URL and key in settings";

export interface StoredSession {
	access_token: string;
	refresh_token: string;
	email: string | null;
}

export interface PlannerData {
	supabaseUrl: string;
	supabaseAnonKey: string;
	session: StoredSession | null;
}

const DEFAULT_DATA: PlannerData = {
	supabaseUrl: "",
	supabaseAnonKey: "",
	session: null,
};

export default class PlannerPlugin extends Plugin {
	settings: PlannerData = { ...DEFAULT_DATA };
	supabase: SupabaseClient | null = null;
	private authUnsubscribe: (() => void) | null = null;

	async onload() {
		this.settings = Object.assign({}, DEFAULT_DATA, await this.loadData());

		this.initSupabaseClient();
		this.register(() => this.teardownClient());
		await this.restoreSession();

		this.registerView(VIEW_TYPE_PLANNER, (leaf) => new PlannerView(leaf, this));

		this.addRibbonIcon("calendar-check", "Open Tile Day Planner", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-panel",
			name: "Open task panel",
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new PlannerSettingTab(this.app, this));
		registerPlannerCodeBlock(this);
	}

	// ---------- Клиент Supabase ----------

	/** URL и anon-ключ заполнены в настройках. */
	isConfigured(): boolean {
		return this.settings.supabaseUrl.trim() !== "" && this.settings.supabaseAnonKey.trim() !== "";
	}

	/**
	 * Пересоздаёт клиент из текущих настроек. Старый клиент останавливается
	 * (отписка от auth-событий, остановка автообновления токена).
	 */
	initSupabaseClient(): void {
		this.teardownClient();
		if (!this.isConfigured()) return;

		try {
			// Клиент без встроенного localStorage: сессию храним сами в данных плагина.
			this.supabase = createClient(this.settings.supabaseUrl.trim(), this.settings.supabaseAnonKey.trim(), {
				auth: {
					persistSession: false,
					autoRefreshToken: true,
					detectSessionInUrl: false,
				},
			});
		} catch (err) {
			// Например, недописанный URL — просто остаёмся без клиента.
			console.error("Tile Day Planner: cannot create Supabase client", err);
			this.supabase = null;
			return;
		}

		const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
			if (event === "SIGNED_OUT") {
				this.settings.session = null;
				void this.saveSettings();
			} else if (session) {
				void this.storeSession(session);
			}
		});
		this.authUnsubscribe = () => data.subscription.unsubscribe();
	}

	private teardownClient(): void {
		this.authUnsubscribe?.();
		this.authUnsubscribe = null;
		void this.supabase?.auth.stopAutoRefresh();
		this.supabase = null;
	}

	/** Вызывается настройками после изменения URL/ключа. */
	async applyConnectionSettings(): Promise<void> {
		await this.saveSettings();
		this.initSupabaseClient();
		await this.restoreSession();
	}

	/** Клиент для запросов; бросает понятную ошибку, если настройки не заполнены. */
	private client(): SupabaseClient {
		if (!this.supabase) throw new Error(NOT_CONFIGURED_MESSAGE);
		return this.supabase;
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
		if (!stored || !this.supabase) return;
		try {
			const { error } = await this.supabase.auth.setSession({
				access_token: stored.access_token,
				refresh_token: stored.refresh_token,
			});
			if (error) {
				console.error("Tile Day Planner: cannot restore session", error);
				this.settings.session = null;
				await this.saveSettings();
			}
		} catch (err) {
			// Например, нет сети: сохранённую сессию не трогаем, попробуем в следующий раз.
			console.error("Tile Day Planner: session restore failed", err);
		}
	}

	async signOut(): Promise<void> {
		try {
			await this.supabase?.auth.signOut();
		} catch (err) {
			console.error("Tile Day Planner: sign out failed", err);
		}
		this.settings.session = null;
		await this.saveSettings();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	// ---------- Данные ----------

	private async currentUserId(): Promise<string | null> {
		const { data } = await this.client().auth.getSession();
		return data.session?.user?.id ?? null;
	}

	/** Все открытые неудалённые задачи пользователя. */
	async fetchOpenTasks(): Promise<Task[]> {
		const { data, error } = await this.client()
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
		const { data, error } = await this.client()
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
		if (!userId) throw new Error("no active session, sign in in the plugin settings");
		const { error } = await this.client().from("tasks").insert({
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
		const { error } = await this.client()
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
