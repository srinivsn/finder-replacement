// State
const state = {
  currentDir: '',       // absolute path of the directory being browsed
  parentDir: null,      // absolute path of parent (null if at root /)
  entries: [],          // entries in current directory
  expandedDirs: {},     // path -> [entries] for expanded subdirs
  selectedFile: null,   // absolute path of previewed file
  bookmarks: [],
  history: [],          // navigation history (absolute paths)
  historyIndex: -1,
  focusIndex: -1,
  allRows: [],
};

// File type icons
const FILE_ICONS = {
  directory: '📁',
  directoryOpen: '📂',
  html: '🌐', htm: '🌐',
  md: '📝', markdown: '📝',
  pdf: '📕',
  jpg: '🖼', jpeg: '🖼', png: '🖼', gif: '🖼', svg: '🖼', webp: '🖼', bmp: '🖼', ico: '🖼',
  json: '{ }', js: '📜', ts: '📜', py: '🐍', rb: '💎',
  css: '🎨', scss: '🎨',
  txt: '📄', csv: '📊',
  default: '📄',
};

function getIcon(entry) {
  if (entry.type === 'directory') {
    return state.expandedDirs[entry.path] !== undefined
      ? FILE_ICONS.directoryOpen
      : FILE_ICONS.directory;
  }
  const ext = (entry.ext || '').replace('.', '');
  return FILE_ICONS[ext] || FILE_ICONS.default;
}

// File type sets
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico', 'tiff']);
const HTML_EXTS = new Set(['html', 'htm']);
const MD_EXTS = new Set(['md', 'markdown', 'mdx']);
const CODE_EXTS = new Map([
  ['py', 'python'], ['js', 'javascript'], ['ts', 'typescript'], ['jsx', 'javascript'],
  ['tsx', 'typescript'], ['rb', 'ruby'], ['rs', 'rust'], ['go', 'go'], ['java', 'java'],
  ['c', 'c'], ['cpp', 'cpp'], ['h', 'c'], ['hpp', 'cpp'], ['cs', 'csharp'],
  ['swift', 'swift'], ['kt', 'kotlin'], ['sh', 'bash'], ['bash', 'bash'], ['zsh', 'bash'],
  ['json', 'json'], ['yaml', 'yaml'], ['yml', 'yaml'], ['toml', 'toml'], ['xml', 'xml'],
  ['sql', 'sql'], ['css', 'css'], ['scss', 'scss'], ['less', 'less'], ['sass', 'scss'],
  ['txt', 'plaintext'], ['csv', 'plaintext'], ['log', 'plaintext'],
  ['r', 'r'], ['lua', 'lua'], ['pl', 'perl'], ['php', 'php'],
  ['ex', 'elixir'], ['exs', 'elixir'], ['hs', 'haskell'], ['ml', 'ocaml'],
  ['clj', 'clojure'], ['vue', 'xml'], ['svelte', 'xml'],
  ['dockerfile', 'dockerfile'], ['makefile', 'makefile'],
]);

// API helpers
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// Navigation
async function navigateTo(dirPath, addToHistory = true) {
  try {
    const data = await fetchJSON(`/api/tree?path=${encodeURIComponent(dirPath)}`);
    state.currentDir = data.current;
    state.parentDir = data.parent;
    state.entries = data.entries;
    state.expandedDirs = {};
    state.selectedFile = null;
    state.focusIndex = -1;

    // Update path bar
    document.getElementById('path-bar').value = data.current;
    document.title = `${data.basename} — File Browser`;

    // History management
    if (addToHistory) {
      // Trim forward history
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(data.current);
      state.historyIndex = state.history.length - 1;
    }

    updateNavButtons();
    updateBookmarkHighlight();
    renderTree();
    clearPreview();
  } catch (err) {
    showError(`Cannot open: ${err.message}`);
  }
}

function goBack() {
  if (state.historyIndex > 0) {
    state.historyIndex--;
    navigateTo(state.history[state.historyIndex], false);
  }
}

function goForward() {
  if (state.historyIndex < state.history.length - 1) {
    state.historyIndex++;
    navigateTo(state.history[state.historyIndex], false);
  }
}

function goUp() {
  if (state.parentDir) {
    navigateTo(state.parentDir);
  }
}

function updateNavButtons() {
  document.getElementById('back-btn').disabled = state.historyIndex <= 0;
  document.getElementById('forward-btn').disabled = state.historyIndex >= state.history.length - 1;
  document.getElementById('up-btn').disabled = !state.parentDir;
}

function showError(msg) {
  // Show briefly in preview pane
  const pane = document.getElementById('preview-pane');
  pane.innerHTML = `<div class="error-banner">${msg}</div>
    <div id="preview-placeholder" style="position:relative;padding-top:60px;text-align:center;color:var(--placeholder-color)">
    Could not navigate to that path</div>`;
}

function clearPreview() {
  const pane = document.getElementById('preview-pane');
  pane.innerHTML = '<div id="preview-placeholder">Select a file to preview</div>';
}

// Bookmarks
function renderBookmarks(bookmarks) {
  const container = document.getElementById('bookmarks');
  container.innerHTML = '';
  bookmarks.forEach(bm => {
    const item = document.createElement('div');
    item.className = 'bookmark-item';
    item.dataset.path = bm.path;
    item.innerHTML = `<span class="bookmark-icon">${bm.icon}</span><span class="bookmark-name">${bm.name}</span>`;
    item.addEventListener('click', () => navigateTo(bm.path));
    container.appendChild(item);
  });
}

function updateBookmarkHighlight() {
  document.querySelectorAll('.bookmark-item').forEach(el => {
    el.classList.toggle('active', el.dataset.path === state.currentDir);
  });
}

// Tree: load a subdirectory's entries
async function loadSubdir(dirPath) {
  const data = await fetchJSON(`/api/tree?path=${encodeURIComponent(dirPath)}`);
  state.expandedDirs[dirPath] = data.entries;
  return data.entries;
}

function collapseSubdir(dirPath) {
  const keysToRemove = Object.keys(state.expandedDirs).filter(
    k => k === dirPath || k.startsWith(dirPath + '/')
  );
  keysToRemove.forEach(k => delete state.expandedDirs[k]);
}

// Tree rendering
function renderTree() {
  const container = document.getElementById('tree-container');
  const filterQuery = document.getElementById('filter-input').value.toLowerCase();
  container.innerHTML = '';
  state.allRows = [];

  // Directory label
  const label = document.createElement('div');
  label.className = 'tree-dir-label';
  label.textContent = state.currentDir.split('/').pop() || '/';
  label.title = state.currentDir;
  container.appendChild(label);

  // Parent directory row (..)
  if (state.parentDir && !filterQuery) {
    const row = createTreeRow({
      name: '..',
      type: 'directory',
      path: state.parentDir,
    }, 0, true);
    row.classList.add('parent-row');
    container.appendChild(row);
  }

  // Entries
  renderEntries(state.entries, 0, container, filterQuery);
}

function renderEntries(entries, depth, container, filterQuery) {
  for (const entry of entries) {
    const matchesFilter = !filterQuery || entry.name.toLowerCase().includes(filterQuery);
    const isExpanded = state.expandedDirs[entry.path] !== undefined;
    const hasMatchingChildren = isExpanded && hasFilterMatch(entry.path, filterQuery);

    if (filterQuery && !matchesFilter && entry.type === 'file') continue;
    if (filterQuery && !matchesFilter && entry.type === 'directory' && !hasMatchingChildren) continue;

    const row = createTreeRow(entry, depth, false);
    const rowIndex = state.allRows.length;
    state.allRows.push({ entry, element: row, depth });

    if (rowIndex === state.focusIndex) {
      row.classList.add('focused');
    }

    container.appendChild(row);

    // Render children if expanded
    if (entry.type === 'directory' && isExpanded) {
      const children = state.expandedDirs[entry.path] || [];
      renderEntries(children, depth + 1, container, filterQuery);
    }
  }
}

function createTreeRow(entry, depth, isParentRow) {
  const row = document.createElement('div');
  row.className = 'tree-row';
  row.style.paddingLeft = `${depth * 16 + 8}px`;
  row.dataset.path = entry.path;
  row.dataset.type = entry.type;
  row.dataset.name = entry.name;

  if (entry.path === state.selectedFile) {
    row.classList.add('selected');
  }

  // Arrow
  const arrow = document.createElement('span');
  arrow.className = 'tree-arrow';
  if (entry.type === 'directory' && !isParentRow) {
    const isExpanded = state.expandedDirs[entry.path] !== undefined;
    arrow.textContent = isExpanded ? '▾' : '▸';
  }
  row.appendChild(arrow);

  // Icon
  const icon = document.createElement('span');
  icon.className = 'tree-icon';
  if (isParentRow) {
    icon.textContent = '↩';
  } else {
    icon.textContent = getIcon(entry);
  }
  row.appendChild(icon);

  // Name
  const name = document.createElement('span');
  name.className = 'tree-name';
  if (entry.name.startsWith('.') && !isParentRow) name.classList.add('dimmed');
  name.textContent = entry.name;
  row.appendChild(name);

  // Click handler
  if (isParentRow) {
    row.addEventListener('click', () => navigateTo(entry.path));
    row.addEventListener('dblclick', () => navigateTo(entry.path));
  } else {
    row.addEventListener('click', () => handleRowClick(entry));
    row.addEventListener('dblclick', () => {
      if (entry.type === 'directory') {
        navigateTo(entry.path);
      }
    });
  }

  return row;
}

function hasFilterMatch(dirPath, filterQuery) {
  if (!filterQuery) return true;
  const children = state.expandedDirs[dirPath];
  if (!children) return false;
  return children.some(child => {
    if (child.name.toLowerCase().includes(filterQuery)) return true;
    if (child.type === 'directory' && state.expandedDirs[child.path]) {
      return hasFilterMatch(child.path, filterQuery);
    }
    return false;
  });
}

async function handleRowClick(entry) {
  if (entry.type === 'directory') {
    if (state.expandedDirs[entry.path] !== undefined) {
      collapseSubdir(entry.path);
    } else {
      await loadSubdir(entry.path);
    }
    renderTree();
  } else {
    state.selectedFile = entry.path;
    renderTree();
    previewFile(entry.path);
  }
}

// Preview
async function previewFile(filePath) {
  const ext = filePath.includes('.') ? filePath.split('.').pop().toLowerCase() : '';
  const previewPane = document.getElementById('preview-pane');
  const fileUrl = `/api/file?path=${encodeURIComponent(filePath)}`;

  // For HTML files, construct a /browsedir/ URL that preserves the directory
  const dirOfFile = filePath.substring(0, filePath.lastIndexOf('/'));
  const browseUrl = `/browsedir${filePath}`;

  previewPane.innerHTML = '';

  try {
    if (HTML_EXTS.has(ext)) {
      const iframe = document.createElement('iframe');
      iframe.src = browseUrl;
      previewPane.appendChild(iframe);

    } else if (MD_EXTS.has(ext)) {
      const text = await fetchText(fileUrl);
      const div = document.createElement('div');
      div.className = 'markdown-body preview-content';
      div.innerHTML = marked.parse(text);
      div.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
      previewPane.appendChild(div);

    } else if (ext === 'pdf') {
      const embed = document.createElement('embed');
      embed.src = fileUrl;
      embed.type = 'application/pdf';
      previewPane.appendChild(embed);

    } else if (IMAGE_EXTS.has(ext)) {
      const wrapper = document.createElement('div');
      wrapper.className = 'image-preview';
      const img = document.createElement('img');
      img.src = fileUrl;
      img.alt = filePath.split('/').pop();
      wrapper.appendChild(img);
      previewPane.appendChild(wrapper);

    } else {
      const text = await fetchText(fileUrl);

      if (isBinary(text)) {
        previewPane.innerHTML = `
          <div class="binary-notice">
            <p>Binary file — cannot preview</p>
            <a href="${fileUrl}" download>Download file</a>
          </div>`;
        return;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'preview-content';
      const pre = document.createElement('pre');
      const code = document.createElement('code');

      const lang = CODE_EXTS.get(ext) || ext;
      if (lang) code.className = `language-${lang}`;
      code.textContent = text;
      pre.appendChild(code);
      wrapper.appendChild(pre);
      previewPane.appendChild(wrapper);

      try { hljs.highlightElement(code); } catch {}
    }
  } catch (err) {
    previewPane.innerHTML = `
      <div class="binary-notice">
        <p>Unable to load file</p>
        <p style="font-size:12px;margin-top:8px">${err.message}</p>
      </div>`;
  }
}

function isBinary(text) {
  const sample = text.substring(0, 8000);
  const nullCount = (sample.match(/\x00/g) || []).length;
  return nullCount > sample.length * 0.01;
}

// Pane resizer
function initResizer() {
  const resizer = document.getElementById('resizer');
  const main = document.querySelector('main');
  let isResizing = false;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    // Block iframes/embeds from stealing mouse events during resize
    document.getElementById('preview-pane').style.pointerEvents = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const treeWidth = Math.max(150, Math.min(e.clientX, window.innerWidth - 200));
    main.style.gridTemplateColumns = `${treeWidth}px 4px 1fr`;
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    resizer.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.getElementById('preview-pane').style.pointerEvents = '';
  });
}

// Keyboard navigation
function initKeyboard() {
  const container = document.getElementById('tree-container');

  container.addEventListener('keydown', async (e) => {
    const rows = state.allRows;
    if (!rows.length) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        state.focusIndex = Math.min(state.focusIndex + 1, rows.length - 1);
        renderTree();
        scrollToFocused();
        break;

      case 'ArrowUp':
        e.preventDefault();
        state.focusIndex = Math.max(state.focusIndex - 1, 0);
        renderTree();
        scrollToFocused();
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (state.focusIndex >= 0 && rows[state.focusIndex]) {
          const entry = rows[state.focusIndex].entry;
          if (entry.type === 'directory' && state.expandedDirs[entry.path] === undefined) {
            await loadSubdir(entry.path);
            renderTree();
          }
        }
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (state.focusIndex >= 0 && rows[state.focusIndex]) {
          const entry = rows[state.focusIndex].entry;
          if (entry.type === 'directory' && state.expandedDirs[entry.path] !== undefined) {
            collapseSubdir(entry.path);
            renderTree();
          }
        }
        break;

      case 'Enter':
        e.preventDefault();
        if (state.focusIndex >= 0 && rows[state.focusIndex]) {
          handleRowClick(rows[state.focusIndex].entry);
        }
        break;

      case 'Backspace':
        e.preventDefault();
        goUp();
        break;
    }
  });

  // Global shortcuts
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
      e.preventDefault();
      document.getElementById('filter-input').focus();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
      e.preventDefault();
      const pathBar = document.getElementById('path-bar');
      pathBar.focus();
      pathBar.select();
    }
    // Alt+Left = back, Alt+Right = forward
    if (e.altKey && e.key === 'ArrowLeft') {
      e.preventDefault();
      goBack();
    }
    if (e.altKey && e.key === 'ArrowRight') {
      e.preventDefault();
      goForward();
    }
    // Alt+Up = parent
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      goUp();
    }
  });
}

function scrollToFocused() {
  const focused = document.querySelector('.tree-row.focused');
  if (focused) focused.scrollIntoView({ block: 'nearest' });
}

// Path bar
function initPathBar() {
  const pathBar = document.getElementById('path-bar');

  pathBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = pathBar.value.trim();
      if (target) {
        navigateTo(target);
      }
      pathBar.blur();
    }
    if (e.key === 'Escape') {
      pathBar.value = state.currentDir;
      pathBar.blur();
    }
  });
}

// Theme toggle
function initTheme() {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
    updateHljsTheme(true);
  }

  document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.documentElement.classList.toggle('dark');
    updateHljsTheme(isDark);
  });
}

function updateHljsTheme(isDark) {
  document.getElementById('hljs-light').disabled = isDark;
  document.getElementById('hljs-dark').disabled = !isDark;
}

// Filter
function initFilter() {
  document.getElementById('filter-input').addEventListener('input', () => {
    renderTree();
  });
}

// Nav buttons
function initNavButtons() {
  document.getElementById('back-btn').addEventListener('click', goBack);
  document.getElementById('forward-btn').addEventListener('click', goForward);
  document.getElementById('up-btn').addEventListener('click', goUp);
}

// Init
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const info = await fetchJSON('/api/info');

    // Render bookmarks, filtering out ones that don't exist
    state.bookmarks = info.bookmarks;
    renderBookmarks(info.bookmarks);

    // Init all interactions
    initResizer();
    initKeyboard();
    initTheme();
    initFilter();
    initPathBar();
    initNavButtons();

    // Navigate to start directory
    await navigateTo(info.startDir);
  } catch (err) {
    document.body.innerHTML = `<div style="padding:40px;text-align:center;color:#999">
      <p>Failed to connect to server</p>
      <p style="font-size:12px;margin-top:8px">${err.message}</p>
    </div>`;
  }
});
