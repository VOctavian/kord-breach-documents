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

- **Place a point** — pick a location in the header, the current spawn's
  screenshot and description show up on the left, click the map where it
  belongs. The marker drops and the editor moves on to the next unplaced point.
- **Edit descriptions** — the "Описание (RU)" and "Описание (EN)" fields save as
  you type.
- **Change document type** — the dropdown above the description.
- **Screenshots** — "+ Скриншот" uploads files (jpeg/png/webp, up to 12 MB) into
  `assets/screenshots/`; "Убрать фото" drops the current frame from the point
  (the file stays on disk). With more than one frame, thumbnails appear below.
- **New spawn** — "+ Новый спавн" creates an empty point: fill in the
  description, add a screenshot, then click the map.
- **Delete point** — "Удалить точку".

Everything saves automatically (`POST /api/spawns` → `data/spawns.json`); the
"Сохранить" button is only there for manual saves.

Shortcuts: `←` / `→` previous / next point, `Esc` closes the enlarged screenshot.

> The editor holds the whole point list in the tab's memory and rewrites
> `data/spawns.json` in full on every change. If the file was changed from
> outside (by a script or by hand), reload the editor page — otherwise your next
> action will restore the stale version.

## Publishing updates

Marked up new points? Publish with one command:

```
node scripts/publish.mjs
```

It validates the data, commits, pushes and waits for the update to reach the
site.

| Flag | What it does |
| --- | --- |
| `--dry-run` | validation and commit preview only |
| `-m "text"` | custom commit message instead of the generated one |
| `--all` | commit everything, not just `data/` and `assets/screenshots/` |
| `--no-wait` | don't wait for the deploy |
| `--no-changelog` | don't add a "What's new" entry |
| `--changelog-only` | only write "What's new" and exit — to preview the popup before pushing |

Before committing it checks: unique ids, that the location and document type
exist, that every screenshot file is present. If anything is off, publishing is
aborted. It separately warns about points without coordinates, empty drafts, and
screenshots not attached to any point.

The commit message is built from the diff against the previous version, e.g.
`Обновление спавнов: новых точек: 4, размечено: 4, сдвинуто: 2`.

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

## Data

| File | Contents |
| --- | --- |
| `data/spawns.json` | points: map, document type, `caption`/`captionEn`, `images` array, `x`/`y` as percentages of the map size |
| `data/maps.json` | 12 locations: map file, type (`raster`/`svg`), dimensions |
| `data/docs.json` | 8 document types: ru/en name, icon, marker colour |
| `data/changelog.json` | update history for the "What's new" popup, newest first |
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

**Online counter** in the header — Supabase Realtime Presence. Every tab holds a
websocket and announces itself in the shared `kord-breach-online` channel; the
number of channel members is the online count. No server of your own, no
database involved.

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Project Settings → API → copy **Project URL** and **anon public key**.
3. Put them into `SUPABASE_URL` and `SUPABASE_ANON_KEY`.

The free tier caps at 200 concurrent connections; past that the extra visitors
just don't connect and the site keeps working. The `anon` key is meant to be
public, but keep this project to Realtime only — no tables, no storage. If you
ever add tables, turn RLS on, and never put the `service_role` key here.

**Discord invite** — `DISCORD_INVITE`, used by both the feedback button and the
header icon. The current invite never expires; Discord hands out 7-day links by
default, so check the expiry whenever you replace it:

```
curl -s "https://discord.com/api/v10/invites/UErdQwg7ww?with_expiration=true"
```

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

[YouTube](https://www.youtube.com/@MasterMD_yt) ·
[Twitch](https://www.twitch.tv/mastermd_ttv) ·
[TikTok](https://www.tiktok.com/@mastermd_tt) ·
[Boosty](https://boosty.to/mastermd)

## Feedback

Wrong marker, a spawn that's missing here, or an idea — drop by Discord:
https://discord.gg/UErdQwg7ww
