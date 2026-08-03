import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type PlannerPlugin from "./main";
import { errorMessage } from "./util";

export class PlannerSettingTab extends PluginSettingTab {
	plugin: PlannerPlugin;
	private email = "";
	private code = "";

	constructor(app: App, plugin: PlannerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		if (this.plugin.isLoggedIn()) {
			const email = this.plugin.settings.session?.email ?? "(почта неизвестна)";
			new Setting(containerEl)
				.setName(`Вы вошли как ${email}`)
				.setDesc("Сессия сохранена и восстанавливается при запуске Obsidian.")
				.addButton((btn) =>
					btn
						.setButtonText("Выйти")
						.setWarning()
						.onClick(async () => {
							await this.plugin.signOut();
							new Notice("Вы вышли из планировщика");
							this.display();
						})
				);
			return;
		}

		new Setting(containerEl)
			.setName("Почта")
			.setDesc("На этот адрес придёт одноразовый код для входа.")
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
					.setButtonText("Прислать код")
					.setCta()
					.onClick(async () => {
						if (!this.email) {
							new Notice("Введите почту");
							return;
						}
						btn.setDisabled(true);
						try {
							const { error } = await this.plugin.supabase.auth.signInWithOtp({
								email: this.email,
							});
							if (error) throw error;
							new Notice(`Код отправлен на ${this.email}`);
						} catch (err) {
							new Notice("Не удалось отправить код: " + errorMessage(err));
						} finally {
							btn.setDisabled(false);
						}
					})
			);

		new Setting(containerEl)
			.setName("Код из письма")
			.setDesc("Введите присланный код и нажмите «Войти».")
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
					.setButtonText("Войти")
					.setCta()
					.onClick(async () => {
						if (!this.email || !this.code) {
							new Notice("Введите почту и код");
							return;
						}
						btn.setDisabled(true);
						try {
							const { data, error } = await this.plugin.supabase.auth.verifyOtp({
								email: this.email,
								token: this.code,
								type: "email",
							});
							if (error) throw error;
							if (data.session) {
								await this.plugin.storeSession(data.session);
							}
							new Notice("Вход выполнен");
							this.code = "";
							this.display();
						} catch (err) {
							new Notice("Не удалось войти: " + errorMessage(err));
						} finally {
							btn.setDisabled(false);
						}
					})
			);
	}
}
