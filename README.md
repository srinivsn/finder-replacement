# File Browser

A lightweight split-pane file browser and viewer for macOS. Navigate your entire filesystem and preview files without opening a dozen apps.

## Why

When you're generating lots of files — HTML reports, markdown docs, PDFs, images — you end up bouncing between Finder, Chrome, Preview, and a markdown viewer just to see what things look like. This tool gives you a single window with a folder tree on the left and a rendered preview on the right.

No Electron. No build step. Just `node server.js` and a browser tab.

## Install

```bash
cd ~/code/finder-replacement
npm install
```

## Usage

### Option 1: Terminal command (from anywhere)

```bash
# Install globally (one time)
npm link

# Then use from anywhere
browse                    # starts at ~/
browse ~/Desktop          # starts at a specific directory
browse ~/code/my-project  # starts at a project
```

### Option 2: macOS app (Spotlight / Dock)

```bash
cp -r "File Browser.app" /Applications/
```

Then **Cmd+Space** > type "File Browser" > Enter. Or drag it to your Dock.

### Option 3: Direct

```bash
node server.js              # starts at ~/
node server.js ~/Desktop    # starts at a specific directory
```

Opens `http://localhost:3000` in your default browser. If port 3000 is busy, it tries 3001, 3002, etc.

## What It Previews

| File type | How it renders |
|---|---|
| `.html`, `.htm` | Rendered HTML in iframe (relative CSS/JS/images work) |
| `.md`, `.markdown` | Rendered markdown (headings, tables, code blocks, etc.) |
| `.pdf` | Embedded PDF viewer |
| `.jpg`, `.png`, `.gif`, `.svg`, `.webp` | Image display |
| `.js`, `.py`, `.json`, `.css`, `.ts`, `.go`, `.rs`, etc. | Syntax-highlighted code |
| `.txt`, `.csv`, `.log` | Plain text |
| Binary files | Download link |

## Navigation

### Sidebar
- **Bookmarks** — Home, Desktop, Documents, Downloads, Code (customizable in `server.js`)
- **File tree** — click to expand folders, click files to preview
- **Filter** — type to filter files by name
- **`..`** — click to go to parent directory
- **Double-click** folders to navigate into them (resets tree to that directory)

### Path Bar
- **Cmd+L** — focus the path bar
- Type any absolute path and press **Enter** to jump there
- **Escape** to cancel

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Cmd+L` | Focus path bar |
| `Cmd+F` | Focus filter input |
| `Alt+Left` | Go back |
| `Alt+Right` | Go forward |
| `Alt+Up` | Go to parent directory |
| Arrow keys | Navigate file tree |
| `Enter` | Open file / toggle folder |
| `Backspace` | Go to parent directory |

### Mouse
- **Back/Forward/Up** buttons in the header bar
- **Drag the divider** between panes to resize

## Customization

### Bookmarks

Edit the `bookmarks` array in `server.js`:

```js
bookmarks: [
  { name: 'Home', path: HOME_DIR, icon: '🏠' },
  { name: 'Desktop', path: path.join(HOME_DIR, 'Desktop'), icon: '🖥' },
  { name: 'Projects', path: '/path/to/projects', icon: '🚀' },
  // add more here
],
```

### Port

```bash
PORT=8080 node server.js
```

### Dark Mode

Auto-detects system preference. Toggle manually with the **◐** button in the header.

## Architecture

```
finder-replacement/
├── server.js               # Express backend (~190 lines)
├── bin/browse.js            # Global CLI entry point
├── public/
│   ├── index.html           # SPA shell
│   ├── style.css            # Layout, dark mode, markdown styles
│   └── app.js               # Tree, preview, navigation logic (~600 lines)
├── File Browser.app/        # macOS app bundle
├── package.json             # 2 deps: express, mime-types
└── CLAUDE.md                # Development guide
```

- **Backend:** Node.js + Express. Three API endpoints (`/api/info`, `/api/tree`, `/api/file`) plus a `/browsedir/*` catch-all for HTML relative asset resolution. Binds to `127.0.0.1` only.
- **Frontend:** Vanilla JS, no framework, no build step. Markdown via [marked](https://github.com/markedjs/marked) (CDN). Syntax highlighting via [highlight.js](https://highlightjs.org/) (CDN).
- **Dependencies:** `express` and `mime-types`. That's it.

## Security

This is a **local-only** tool:
- Server binds to `127.0.0.1` (localhost only, not network-accessible)
- Not intended to be exposed to the internet or a LAN
- No authentication (not needed for local use)
