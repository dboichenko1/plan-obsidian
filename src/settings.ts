import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type PlannerPlugin from "./main";
import { errorMessage } from "./util";

export class PlannerSettingTab extends PluginSettingTab {
	plugin: PlannerPlugin;
	private email = "";
	private code = "";
	private applyTimer: number | null = null;
	/** Состояние «настройки заполнены» на момент последнего рендера. */
	private renderedConfigured = false;

	constructor(app: App, plugin: PlannerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Пересоздание клиента с задержкой, чтобы не дёргать Supabase на каждый
	 * введённый символ. Перерисовываем вкладку только когда меняется само
	 * состояние «заполнено/не заполнено» — иначе поле теряло бы фокус.
	 */
	private scheduleApply(): void {
		if (this.applyTimer !== null) window.clearTimeout(this.applyTimer);
		this.applyTimer = window.setTimeout(() => {
			this.applyTimer = null;
			void this.plugin.applyConnectionSettings().then(() => {
				if (this.plugin.isConfigured() !== this.renderedConfigured) this.display();
			});
		}, 600);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		this.renderedConfigured = this.plugin.isConfigured();

		new Setting(containerEl)
			.setName("Supabase URL")
			.setDesc("URL of your Supabase project, e.g. https://abcdefgh.supabase.co.")
			.addText((text) =>
				text
					.setPlaceholder("https://…supabase.co")
					.setValue(this.plugin.settings.supabaseUrl)
					.onChange((value) => {
						this.plugin.settings.supabaseUrl = value.trim();
						this.scheduleApply();
					})
			);

		new Setting(containerEl)
			.setName("Supabase anon key")
			.setDesc("Public anon key of the project. Data access is protected by row level security.")
			.addText((text) =>
				text
					.setPlaceholder("eyJhbGciOi…")
					.setValue(this.plugin.settings.supabaseAnonKey)
					.onChange((value) => {
						this.plugin.settings.supabaseAnonKey = value.trim();
						this.scheduleApply();
					})
			);

		new Setting(containerEl).setName("Account").setHeading();

		if (!this.plugin.isConfigured()) {
			new Setting(containerEl).setDesc("Fill in the Supabase URL and anon key above to sign in.");
			return;
		}

		if (this.plugin.isLoggedIn()) {
			const email = this.plugin.settings.session?.email ?? "(unknown email)";
			new Setting(containerEl)
				.setName(`Signed in as ${email}`)
				.setDesc("The session is saved and restored when Obsidian starts.")
				.addButton((btn) =>
					btn
						.setButtonText("Sign out")
						.setWarning()
						.onClick(async () => {
							await this.plugin.signOut();
							new Notice("Signed out");
							this.display();
						})
				);
			return;
		}

		new Setting(containerEl)
			.setName("Email")
			.setDesc("A one-time sign-in code will be sent to this address.")
			.addText((text) =>
				text
					.setPlaceholder("you@example.com")
					.setValue(this.email)
					.onChange((value) => {
						this.email = value.trim();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Send code")
					.setCta()
					.onClick(async () => {
						if (!this.email) {
							new Notice("Enter your email");
							return;
						}
						const supabase = this.plugin.supabase;
						if (!supabase) return;
						btn.setDisabled(true);
						try {
							const { error } = await supabase.auth.signInWithOtp({
								email: this.email,
							});
							if (error) throw error;
							new Notice(`Code sent to ${this.email}`);
						} catch (err) {
							new Notice("Failed to send code: " + errorMessage(err));
						} finally {
							btn.setDisabled(false);
						}
					})
			);

		new Setting(containerEl)
			.setName("Code from email")
			.setDesc("Enter the code you received and press Sign in.")
			.addText((text) =>
				text
					.setPlaceholder("123456")
					.setValue(this.code)
					.onChange((value) => {
						this.code = value.trim();
					})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Sign in")
					.setCta()
					.onClick(async () => {
						if (!this.email || !this.code) {
							new Notice("Enter your email and the code");
							return;
						}
						const supabase = this.plugin.supabase;
						if (!supabase) return;
						btn.setDisabled(true);
						try {
							const { data, error } = await supabase.auth.verifyOtp({
								email: this.email,
								token: this.code,
								type: "email",
							});
							if (error) throw error;
							if (data.session) {
								await this.plugin.storeSession(data.session);
							}
							new Notice("Signed in");
							this.code = "";
							this.display();
						} catch (err) {
							new Notice("Failed to sign in: " + errorMessage(err));
						} finally {
							btn.setDisabled(false);
						}
					})
			);
	}

	hide(): void {
		if (this.applyTimer !== null) {
			window.clearTimeout(this.applyTimer);
			this.applyTimer = null;
			void this.plugin.applyConnectionSettings();
		}
	}
}
