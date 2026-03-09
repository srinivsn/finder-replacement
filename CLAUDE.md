# File Browser — CLAUDE.md

## Project Overview

A local split-pane file browser/viewer for macOS. Node.js + Express backend, vanilla JS frontend, no build step. Lets you navigate your filesystem and preview rendered files (HTML, markdown, PDF, images, code) in a single browser window.

## Tech Stack

- **Backend:** Node.js, Express 4, `mime-types`
- **Frontend:** Vanilla JS/HTML/CSS (no framework, no bundler)
- **CDN deps:** `marked` (markdown rendering), `highlight.js` (syntax highlighting)
- **Runtime:** Node.js 23+ (uses `fs/promises`, top-level features)

## Project Structure

```
server.js              # Express server — API routes, file serving, port management
bin/browse.js          # Global CLI entry point (shebang wrapper)
public/
  index.html           # SPA shell — loads CDN scripts, defines DOM structure
  style.css            # All styles — grid layout, tree, preview, dark mode, markdown body
  app.js               # All frontend logic — tree nav, preview dispatch, resizer, keyboard
package.json           # 2 deps: express, mime-types
"File Browser.app/"    # macOS .app bundle (shell script launcher)
```

## Key Architecture Decisions

- **Absolute paths everywhere.** The API uses absolute filesystem paths (not relative to a root). This allows navigating anywhere on the machine. The server binds to `127.0.0.1` only for security.
- **No build step.** Frontend is vanilla JS served as static files. CDN for marked and highlight.js.
- **Lazy tree loading.** Directories are only fetched when expanded (click) or navigated into (double-click). This keeps large filesystems responsive.
- **HTML relative assets.** HTML files are served via `/browsedir/*` (which maps to absolute paths) so that relative references to CSS/JS/images resolve correctly in the iframe.
- **Port fallback.** If port 3000 is busy, the server auto-tries up to +10.
- **PID file singleton.** Server writes PID to `/tmp/file-browser.pid` on startup, kills any previous instance first, cleans up on exit. Prevents stale zombie processes.
- **macOS .app backgrounding.** The `.app` launch script uses `nohup` to background the server, polls until ready, then opens the browser and exits. This prevents the "not responding" state in macOS.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/info` | Returns start directory, home dir, bookmarks |
| `GET /api/tree?path=<abs>` | Lists directory contents (entries, parent, basename) |
| `GET /api/file?path=<abs>` | Serves file with correct MIME type |
| `GET /browsedir/*` | Serves files by absolute path (for HTML iframe relative assets) |

## How to Run

```bash
npm install              # first time only
node server.js           # starts at ~/, opens browser
node server.js ~/Desktop # starts at specific dir
browse                   # global command (after npm link)
browse ~/code            # global command with path
```

## Common Modifications

- **Add bookmarks:** Edit the `bookmarks` array in `server.js` line ~40
- **Add file type preview:** Edit `previewFile()` in `public/app.js` line ~317
- **Add file type icons:** Edit `FILE_ICONS` in `public/app.js` line ~16
- **Add syntax highlighting language:** Edit `CODE_EXTS` map in `public/app.js` line ~43
- **Style changes:** All in `public/style.css` — CSS custom properties at top for theming

## Known Patterns

- The resizer disables `pointer-events` on the preview pane during drag to prevent iframes from stealing mouse events
- `navigateTo()` manages browser-like back/forward history
- Single-click expands folders inline; double-click navigates into them
- The `.app` bundle uses a hardcoded path (`/Users/jaysrinivasan/code/finder-replacement`) in its launch script — must be updated if project moves
- After changing the `.app`, must re-deploy: `rm -rf "/Applications/File Browser.app" && cp -r "File Browser.app" /Applications/`
- Server logs go to `/tmp/file-browser.log` when launched from the `.app`
