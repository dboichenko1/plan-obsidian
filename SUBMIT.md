# Сабмит в каталог Obsidian community plugins

## Блок для community-plugins.json

Добавляется в **конец** массива в `community-plugins.json`:

```json
{
  "id": "tile-day-planner",
  "name": "Tile Day Planner",
  "author": "dboichenko1",
  "description": "Browse and complete tasks from your self-hosted tile planner (Supabase) — today panel, overdue list, and day code blocks.",
  "repo": "dboichenko1/plan-obsidian"
}
```

## Перед PR — проверить

- [ ] В репозитории есть релиз с тегом `0.1.0` (без префикса `v`), и к нему приложены
      `main.js`, `manifest.json`, `styles.css` (создаётся автоматически экшеном
      `.github/workflows/release.yml` при пуше тега).
- [ ] `manifest.json` лежит в **корне** репозитория, `id`, `version` (`0.1.0`) и `name`
      совпадают с релизом и блоком выше.
- [ ] В `versions.json` есть запись `"0.1.0": "1.4.0"` (версия → minAppVersion).
- [ ] В корне есть `README.md` и `LICENSE`.

## Пошагово

1. Форкнуть [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases)
   (кнопка Fork на GitHub).
2. В форке открыть файл `community-plugins.json` и добавить блок выше **в самый конец**
   массива (после последнего элемента поставить запятую, затем новый блок). Редактировать
   можно прямо в веб-интерфейсе GitHub (карандаш → Commit changes).
3. Открыть Pull Request из форка в `obsidianmd/obsidian-releases` (base: `master`).
   Название PR: `Add plugin: Tile Day Planner`.
4. В описании PR заполнить их шаблон-чек-лист (галочки `[x]`): подтвердить, что прочитаны
   [гайдлайны разработчика](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) и
   [политики](https://docs.obsidian.md/Developer+policies), что репозиторий содержит README,
   LICENSE и релиз с нужными файлами, и что это сабмит нового плагина.
5. Дождаться автоматической проверки бота в PR; если бот нашёл проблемы — поправить в
   репозитории плагина (при изменении manifest — перевыпустить релиз) и написать в PR.
6. После одобрения ревьюером и мержа плагин появится в каталоге
   **Settings → Community plugins → Browse** в течение нескольких часов.

## Обновление версий в будущем

1. Поднять `version` в `manifest.json` и `package.json`, добавить строку в `versions.json`.
2. Закоммитить, запушить, поставить тег с номером версии (`git tag 0.1.1 && git push origin
   0.1.1`) — экшен соберёт и опубликует релиз.
3. PR в obsidian-releases для новых версий не нужен — каталог подхватывает релизы сам.
