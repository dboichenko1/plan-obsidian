# Tile Day Planner

An Obsidian client for a self-hosted tile planner backed by [Supabase](https://supabase.com).
The server side and the web app live in a separate repository:
[dboichenko1/plan_web](https://github.com/dboichenko1/plan_web). This plugin lets you see and
complete your planner tasks without leaving Obsidian.

Your data stays in **your own** Supabase project — the plugin talks directly to it using the
public anon key, and access is protected by row level security.

## Features

- **Today panel** (right sidebar, `calendar-check` ribbon icon or the "Open task panel"
  command):
  - **Today** — open tasks scheduled for today (local date);
  - **Overdue** — tasks scheduled earlier than today (collapsed by default);
  - **No date** — tasks without a scheduled date (collapsed by default);
  - each task has a checkbox to complete it, a colored urgency dot, and its title;
  - a quick-add field at the top (press Enter to create a task for today) and a refresh button.
- **Day code block** — embed a day's open tasks in any note:

  ````markdown
  ```planner
  2026-08-03
  ```
  ````

  Leave the block body empty to show today.
- **Email sign-in** — no passwords; enter the one-time code from the email, or paste the
  sign-in link from it.
- **Session persistence** — the session is stored in the plugin data and restored when
  Obsidian starts.

### Urgency

- with a due date (`due_on`): due today or overdue — 4 (red dot), within 3 days — 3 (orange),
  within 7 days — 2 (green), later — 1 (blue);
- without a due date — the task's manual urgency (`urgency_manual`).

Completing a task records `completed_at` and `urgency_at_completion`.

## Setup

This plugin is a client: it needs a running planner backend. Deploy the schema from
[dboichenko1/plan_web](https://github.com/dboichenko1/plan_web) to your own Supabase project
first.

1. Open **Settings → Tile Day Planner**.
2. Enter your **Supabase URL** (e.g. `https://abcdefgh.supabase.co`) and the project's
   **anon key**. Both can be found in your Supabase project's API settings.
3. Enter your email and click **Send code**, then sign in with what the email contains:
   - if there is a one-time code, enter it and click **Sign in**;
   - if there is only a link, copy the whole link, paste it into
     **Or paste the sign-in link from the email** and click **Sign in with link**.

Until the URL and key are set, the panel and code blocks show
"Set Supabase URL and key in settings".

## Install

### Community plugins

Once the plugin is accepted into the catalog: **Settings → Community plugins → Browse**,
search for "Tile Day Planner", install and enable it.

### BRAT

Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin, then add
`dboichenko1/plan-obsidian` as a beta plugin.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the
   [latest release](https://github.com/dboichenko1/plan-obsidian/releases), or build them
   yourself with `npm install && npm run build`.
2. Copy them into `<vault>/.obsidian/plugins/tile-day-planner/` (create the folder).
3. Enable the plugin in **Settings → Community plugins**.

## Development

- `npm run dev` — esbuild watch mode;
- `npm run build` — TypeScript type check and production build into `main.js`.

Sources are in `src/`: `main.ts` (plugin core and Supabase access), `view.ts` (sidebar panel),
`settings.ts` (settings tab and sign-in), `codeblock.ts` (the `planner` code block),
`util.ts` (dates and urgency), `types.ts` (data types).

---

## Для себя

Это клиент к моему личному планировщику ([plan_web](https://github.com/dboichenko1/plan_web)):
панель «Сегодня» с просроченными и задачами без даты, быстрый ввод на сегодня, код-блок
`planner` с датой дня. Вход по коду из письма, URL и anon-ключ Supabase задаются в настройках
плагина. Сборка: `npm install && npm run build`, файлы `main.js`, `manifest.json`,
`styles.css` — в папку плагина `tile-day-planner` в хранилище.
