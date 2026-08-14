# Kord Breach — secret document spawns

**English** · [Русский](README.ru.md)

Interactive guide to secret document spawn points in Kord Breach: pick a
location, get a map with document icons on it, click an icon to see the
screenshot with a description, and use ← / → to page through the rest of the
spawns on that map.

**Live site:** https://voctavian.github.io/kord-breach-documents/

171 spawn points across 12 locations, 8 document types, 173 screenshots.
Interface and descriptions in Russian and English.

## Pages

| Page | What it does |
| --- | --- |
| `index.html` | location picker: map preview, spawn count, document types present |
| `map.html?map=<id>` | map with icons, filter by document type, screenshot viewer |
| `editor.html?map=<id>` | editing points — **local only**, never published |
| `survey-editor.html` | the survey and its responses — **local only** |

The editor link only shows up when the site is opened from `localhost`, and the
page itself is excluded from the GitHub Pages build: the published site is
read-only.

## Running locally

```
node server.mjs
```

Open http://localhost:5173 (override with `PORT`). No dependencies — Node 18+ is
all you need.

## Editor

Run `node server.mjs` and open `editor.html`.

- **Place a point** — right-click the map for a menu: "Новая точка здесь"
  creates a point with those coordinates, "Переместить сюда" moves the current
  one. The left button only pans, so a stray click can't knock coordinates off.
- **Edit descriptions** — the "Описание (RU)" and "Описание (EN)" fields save as
  you type.
- **Change document type** — the dropdown above the description.
- **Screenshots** — "+ Скриншот" uploads files (jpeg/png/webp, up to 12 MB) into
  `assets/screenshots/`; "Убрать фото" drops the current frame from the point
  (the file stays on disk). With more than one frame, thumbnails appear below.
- **New spawn** — "+ Новый спавн" creates an empty point with no coordinates:
  fill in the description, add a screenshot, then place it from the right-click
  menu.
- **Delete point** — "Удалить точку".

Everything saves automatically half a second after an edit
(`POST /api/spawns` → `data/spawns.json`). The "Готово" button flushes anything
still pending and opens the normal map for that location; if the write fails the
editor stays put and shows the error.

Shortcuts: `←` / `→` previous / next point, `Esc` closes the enlarged screenshot.

> The editor holds the whole point list in the tab's memory and rewrites
> `data/spawns.json` in full on every change. If the file was changed from
> outside (by a script or by hand), reload the editor page — otherwise your next
> action will restore the stale version.

## Publishing updates

Marked up new points, or edited a survey? Publish with one command:

```
node scripts/publish.mjs
```

It validates the data, commits, pushes and waits for the update to reach the
site. Surveys need no separate command: `data/survey.json` and the gallery images
in `assets/survey/` ride along in the same run.

| Flag | What it does |
| --- | --- |
| `--dry-run` | validation and commit preview only |
| `-m "text"` | custom commit message instead of the generated one |
| `--all` | commit everything, not just `data/`, `assets/screenshots/` and `assets/survey/` |
| `--no-wait` | don't wait for the deploy |
| `--no-changelog` | don't add a "What's new" entry |
| `--changelog-only` | only write "What's new" and exit — to preview the popup before pushing |

Before committing it checks: unique ids, that the location and document type
exist, that every screenshot file is present. Surveys are checked separately:
unique survey and question ids, gallery images present, no live survey that is
missing from the list or has no questions. If anything is off, publishing is
aborted. It warns about points without coordinates, empty drafts, and screenshots
not attached to any point.

The commit subject is built from the diff against the previous version and
follows what actually changed:

| What changed | Commit subject |
| --- | --- |
| points only | `Обновление спавнов: новых точек: 4, сдвинуто: 2` |
| survey only | `Опрос: включён «Пара вопросов о карте»` |
| both | subject stays about points, the survey line moves into the body |

A long subject is cut at 72 characters and repeated in full in the body —
otherwise `git log --oneline` truncates it on its own, and badly.

**Not every file gets swept into the commit.** Tracked changes go in as a whole,
but a *new* file under `assets/` is only added when the data actually references
it. Unattached images are listed under "в коммит не пойдёт, ни к чему не
привязано" and left on disk. `git add` on a directory once dragged in 1.5 MB of
junk that then shipped with every build.

If the deploy fails, the script reruns it once. When the rerun fails too it's
almost always a GitHub outage — check [githubstatus.com](https://www.githubstatus.com/).

In Claude Code the same thing is available as `/publish`.

## What's new popup

On every publish that changes something a visitor can see, `publish.mjs` appends
an entry to `data/changelog.json`: the publish time (field `at`, local, to the
minute) plus the affected points grouped by location and split into "new" and
"fixes". A point counts as new the first time it becomes visible on the map —
whether it was just created or finally got coordinates.

The "What's new" popup opens by itself when there are entries the visitor hasn't
dismissed. Once dismissed it stays away until the next publish; the read marker
lives in `localStorage` under `kord_breach_changelog_v1`. Unread entries are
expanded, everything older sits in collapsed `<details>` under "Past updates".
First-time visitors only get the three most recent entries expanded, and long
lists collapse into "N more".

History folds up as it ages: this month's updates sit in a flat list, earlier
months become "July 2026" folders, and past years become a year folder holding
months holding the updates themselves. Each folder shows how many entries it
holds.

The "📋 Updates" button next to "Buy me a coffee" reopens the popup at any time.
When opened by hand the latest entry is always expanded, even if it was already
read.

Preview the popup before pushing:

```
node scripts/publish.mjs --changelog-only
```

That writes the file without committing. A normal run afterwards picks the entry
up instead of duplicating it.

## Visitor survey

A side panel with questions, opened by a square button pinned to the right edge
and closed only via the ✕. It never slides in on its own — visitors open it when
they feel like it. The button sits half-sunk into the edge and slides all the way
out on hover (and on keyboard focus); on touch screens, where there is nothing to
hover with, it stands out in full. The bar under the button is amber until the
survey is answered and green afterwards; answering any number of times is
allowed. An unanswered survey gets a red "Новый"/"NEW" tag hanging off the
button's top-left corner — offset far enough left to stay visible while the
button is sunk.

Any number of surveys can be live at once: their `id`s are listed in `activeIds`,
and each gets its own button in the column on the right. Only one panel is ever
open — opening the next one closes the previous. Leave the list empty and neither
the buttons nor the panels exist.

Everything is edited locally in `survey-editor.html` (run `node server.mjs`, then
use the "Редактор опросов" link in the header — it only appears on localhost).
The list on the left: the circle switches a survey on and off (several may be lit
at once), the buttons create, duplicate and delete. Duplicating copies the survey with its questions
and images but hands out fresh `id`s to the survey and every question —
otherwise responses from two surveys would blend together in the export.

The survey and each question have their own gallery: "+ Картинка" drops the file
into `assets/survey/`, the site shows thumbnails and a click opens the original.
The "✕" on a thumbnail removes it from the gallery; the file stays on disk.

The "Ответы" tab shows the responses of the selected survey: browse, export CSV,
delete spam.

Responses go into a Supabase table. Run this once in the project's SQL Editor:

```sql
create table public.survey_responses (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  survey_id  text not null check (survey_id ~ '^[a-zA-Z0-9._-]{1,64}$'),
  lang       text check (lang in ('ru', 'en')),
  answers    jsonb not null check (pg_column_size(answers) < 8192)
);

alter table public.survey_responses enable row level security;

-- Visitors may only write: with no select policy, the anon key cannot read
-- anyone else's answers.
create policy survey_insert_anon on public.survey_responses
  for insert to anon with check (true);
```

The insert must carry a `Prefer: return=minimal` header — otherwise PostgREST
tries to return the inserted row, hits the missing select policy and answers 401.

Responses are read by the local server using the `service_role` key from
`.env.local` (see `.env.local.example`). That key bypasses RLS entirely, so the
file is in `.gitignore` and **must never go into `js/config.js`**, which ships to
the browser. Without the file the site works as usual and only the "Ответы" tab
explains what is missing.

The size limit on `answers` and the format check on `survey_id` live in the table
itself: the anon key is public, so it should not be possible to push arbitrary
junk through it. That is not full spam protection — cleanup is the delete button
in the editor.

## Data

| File | Contents |
| --- | --- |
| `data/spawns.json` | points: map, document type, `caption`/`captionEn`, `images` array, `x`/`y` as percentages of the map size |
| `data/maps.json` | 12 locations: map file, type (`raster`/`svg`), dimensions |
| `data/docs.json` | 8 document types: ru/en name, icon, marker colour |
| `data/changelog.json` | update history for the "What's new" popup, newest first |
| `data/survey.json` | surveys: the list plus the `activeIds` that are shown |
| `assets/survey/` | images for the survey and question galleries |
| `assets/screenshots/` | spawn screenshots |
| `assets/maps/` | location maps |
| `documentations/` | document type icons |

Coordinates are stored as percentages, so they don't depend on the display
scale. `x: null` means the point isn't placed yet — it's hidden on the map and
highlighted red in the list. Points with neither a description nor screenshots
are treated as drafts and never reach the site.

## Configuration

Third-party service keys live in [js/config.js](js/config.js). An empty value
simply turns the service off.

**Supabase** is what the survey needs: answers go into the `survey_responses`
table (its schema and policies are in the "Surveys" section above).

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Project Settings → API → copy **Project URL** and **anon public key**.
3. Put them into `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

The `anon` key is meant to be public and ships to the site along with the rest
of the code — what protects you is RLS on the table, so never turn the
insert-only policy off. Never put the `service_role` key here: it belongs in
`.env.local` and nowhere else.

**Discord invite** — `DISCORD_INVITE`, used by both the feedback button and the
header icon. The current invite never expires; Discord hands out 7-day links by
default, so check the expiry whenever you replace it:

```
curl -s "https://discord.com/api/v10/invites/UErdQwg7ww?with_expiration=true"
```

## Sign-in and roles

Google and Discord through Supabase Auth. The schema lives in
[supabase/schema.sql](supabase/schema.sql) — idempotent, run the whole thing in
the SQL Editor.

Roles sit in a `user_roles` table (`admin`, `subscriber`) rather than a column on
the profile: a person can hold both, and a subscription has an expiry date. The
client reads its own via the `my_roles()` RPC.

**The first admin is granted by hand** — there is deliberately no "first person
to sign in becomes admin", that is a race and a hole:

1. Sign in on the site once; a trigger creates the row in `profiles`.
2. `insert into public.user_roles (user_id, role) select id, 'admin' from public.profiles where email = '…';`

After that, roles are handed out on the Roles tab in the admin panel. Removing the
role from the last remaining admin is blocked by the `user_roles_keep_last_admin`
trigger — recovering from that would mean going back to the SQL Editor.

**Roles are deliberately not in the JWT.** A Custom Access Token Hook would save
one query per request, but a broken hook takes sign-in down for everyone at once,
and a revoked role would keep working for up to an hour until the token refreshes.
With two admins the win is zero. Worth revisiting only if tables with tens of
thousands of RLS-filtered rows ever appear.

**What is configured in the dashboards.** The redirect URI in Google Cloud Console
and the Discord Developer Portal is *not* the site — it is
`<SUPABASE_URL>/auth/v1/callback`. In Supabase → URL Configuration: Site URL
`https://voctavian.github.io/kord-breach-documents/`, Additional the same with
`/**` plus `http://localhost:5173/**`. Scopes are set in code (`PROVIDERS` in
[js/auth.js](js/auth.js)); there is no field for them in the dashboard.

The site lives in a subfolder, so `location.origin` is somebody else's root —
`js/auth.js` uses `new URL('.', location.href)` everywhere instead. Putting the
origin into the Supabase settings would drop people on a GitHub 404 after login.

One person signing in with both Google and Discord ends up as a single user only
if the verified e-mail matches. Different addresses mean two accounts, and the
role has to be granted twice.

## Admin panel

`admin.html` is published and reachable at the site URL, but without the `admin`
role it just says "no access" and returns no data: access is cut by RLS, and the
client-side check exists only to avoid rendering a useless interface.

| Section | What it does |
| --- | --- |
| Users | grant `admin` and `subscriber` |
| Surveys | toggle which surveys are shown (**without a deploy**), browse and delete answers, export CSV |
| Spawns | opens the editor for a chosen map |

Survey texts stay in `data/survey.json` and are edited locally in
`survey-editor.html`: that is content, it has history in git and works offline.
Only the list of enabled ones lives in Supabase
(`site_settings.survey_active_ids`), because the urgent operation is switching a
survey on or off, not rewriting a question. If Supabase is unreachable,
`js/survey.js` falls back to `activeIds` from the file.

## Editing spawns from the site

The editor runs in two modes, and [js/store.js](js/store.js) is what decides
which one.

**Locally** it writes straight to disk through `server.mjs`, autosaving 500 ms
after every change — same as it always did.

**On the site** there is no disk, and saving means committing. Autosaving there
would mean one commit and one deploy run per marker nudge, so edits pile up in a
draft (`localStorage`) and go to the repository in a single commit when you press
**Publish**. The site updates once the deploy finishes, 1–2 minutes later.

Screenshots added before publishing live in the tab's memory and are shown from
an `objectURL`, but their path is assigned immediately and hashed exactly the way
`server.mjs` hashes it — so the same file added from a phone and from the desktop
does not end up duplicated. That also means **an unpublished draft does not
survive a tab reload with its images**; the editor warns on `beforeunload`.

### The `commit` Edge Function

[supabase/functions/commit/index.ts](supabase/functions/commit/index.ts) writes
files into the repository via the GitHub Git Data API — data and images in one
commit, so the site never references a file that is not there yet.

It asks the database for the caller's roles (`rpc/my_roles`) using the caller's
own token and refuses anything without `admin`. That means the rule about who may
write stays in one place — RLS — and the function needs no service key at all.
Paths are restricted to `data/` and `assets/`.

**Deploying it (no CLI needed):** Dashboard → Edge Functions → Deploy a new
function → *Via Editor*, name it `commit`, paste the file, Deploy.

Secrets go to Project Settings → Edge Functions → Secrets:

| Secret | Value |
| --- | --- |
| `GITHUB_TOKEN` | fine-grained token, this repo only, **Contents: read and write** |
| `GITHUB_REPO` | `VOctavian/kord-breach-documents` |
| `GITHUB_BRANCH` | optional, defaults to `main` |

> Keep this repository the source of truth for the function. The dashboard editor
> has **no version history** — an edit made there and not mirrored back here is
> gone for good.

If someone else pushed while you were editing, the function answers `409` instead
of overwriting: reload the editor and redo the change.

## Ads

There are no ad blocks yet — [js/ads.js](js/ads.js) is the extension point.
`adsEnabled()` combines the `site_settings.ads_enabled` switch with roles:
subscribers and admins never see ads. `mountAds()` puts a `no-ads` class on
`<body>` so future placeholders can collapse with plain CSS.

> The maps are CC BY-NC-SA (NonCommercial). The role mechanism has nothing to do
> with the licence, but running ads on those maps would breach it — either swap
> the maps out, or keep the subscription as an ad-free perk only.

## Analytics

Two services, because they answer different questions.

**GoatCounter** — https://kord-breach-documents.goatcounter.com. The script is
in `index.html` and `map.html`, pageviews are counted automatically, and
`count.js` sends nothing from localhost.

**Umami Cloud** — [cloud.umami.is](https://cloud.umami.is), free Hobby tier,
added for the realtime view GoatCounter doesn't have. Set `UMAMI_WEBSITE_ID` in
`js/config.js`.

Extra events are sent by `js/analytics.js`:

| Event | When |
| --- | --- |
| `map-open-<id>` | clicking a location card |
| `spawn-view-<id>` | opening the screenshot viewer (paging with arrows doesn't count) |
| `lang-switch-<ru\|en>` | switching language |
| `coffee-open`, `feedback-open`, `discord-open` | support and feedback buttons |
| `changelog-new-<id>` | the "What's new" popup opened by itself |
| `changelog-open` | the popup was opened with the button |
| `author-open` | the header logo was clicked |
| `survey-open` | survey opened by its button |
| `survey-submit` | a response was stored successfully |
| `project-<id>` | a click through to another project |
| `social-<platform>` | social icons in the header |

## Scripts

| Script | What it does |
| --- | --- |
| `scripts/parse-article.mjs` | parses a saved copy of the article (`article.html`) into `spawns-raw.json` |
| `scripts/diff-article.mjs` | compares the parsed article against `data/spawns.json` and reports what's missing; `--write` also downloads it |
| `scripts/sync-new-spawns.mjs` | appends points that appeared in the article after the last parse, leaving existing coordinates and edits alone |
| `scripts/download-screenshots.mjs` | downloads screenshots and **recreates `data/spawns.json` from scratch** |
| `scripts/download-maps.mjs [id…]` | downloads maps from the wiki and updates `data/maps.json` |
| `scripts/merge-spawns.mjs` | merges several screenshots into one point (list in `MERGES`) |
| `scripts/add-en-captions.mjs`, `add-en-captions-2.mjs` | fill in English descriptions |
| `scripts/stage-screenshots.mjs` | stages only the screenshots actually referenced by `data/spawns.json` |
| `scripts/publish.mjs` | validate → commit → push → wait for the deploy |

`download-screenshots.mjs` overwrites `data/spawns.json` with empty coordinates —
back it up before running.

Coordinates are tied to a specific map image: replace a file in `assets/maps/`
and every point on that location has to be placed again.

## Deploy

On every push to `main`, GitHub Actions
([.github/workflows/deploy.yml](.github/workflows/deploy.yml)) assembles `_site`
from the viewer part only and publishes it to GitHub Pages. The editor,
`server.mjs` and `scripts/` never make it into the build — the workflow asserts
this before uploading.

## Sources

- Spawn screenshots and descriptions: the article [«Kord Breach: полное прохождение и все точки спавна документов»](https://vk.ru/@-218287636-kord-breach-polnoe-prohozhdenie-i-vse-tochki-spavna-dokument) by the МетаДвиж community.
- Location maps: [Escape from Tarkov Wiki](https://escapefromtarkov.fandom.com/), maps by RE3MR, Jindouz and xTycho. Licensed CC BY-NC-SA 4.0.

Which files exactly are pulled from the wiki: see the `WIKI_FILES` table in
`scripts/download-maps.mjs`. The Factory map is cropped vertically (`CROP`)
because the bottom half of the original is empty.

## Author

The header logo (`assets/Icon_2_512x512.png`) opens a popup with links and other
projects — the list lives in `PROJECTS` in [js/author.js](js/author.js). Setting
`stale: true` puts a warning on the card that the project is no longer kept up to
date with the current game version.

[YouTube](https://www.youtube.com/@MasterMD_yt) ·
[Twitch](https://www.twitch.tv/mastermd_ttv) ·
[TikTok](https://www.tiktok.com/@mastermd_tt) ·
[Boosty](https://boosty.to/mastermd)

## Feedback

Wrong marker, a spawn that's missing here, or an idea — drop by Discord:
https://discord.gg/UErdQwg7ww
