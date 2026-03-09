const express = require('express');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const mime = require('mime-types');
const { exec } = require('child_process');

const HOME_DIR = os.homedir();
const START_DIR = path.resolve(process.argv[2] || HOME_DIR);

// Security: validate path is absolute and exists, but allow any local path
function sanitizePath(inputPath) {
  const resolved = path.resolve(inputPath || HOME_DIR);
  return resolved;
}

async function startServer() {
  // Verify start directory exists
  try {
    const stat = await fs.stat(START_DIR);
    if (!stat.isDirectory()) {
      console.error(`Error: ${START_DIR} is not a directory`);
      process.exit(1);
    }
  } catch {
    console.error(`Error: ${START_DIR} does not exist`);
    process.exit(1);
  }

  const app = express();

  // Serve static frontend files
  app.use(express.static(path.join(__dirname, 'public')));

  // API: starting directory and bookmarks
  app.get('/api/info', (req, res) => {
    res.json({
      startDir: START_DIR,
      homeDir: HOME_DIR,
      bookmarks: [
        { name: 'Home', path: HOME_DIR, icon: '🏠' },
        { name: 'Desktop', path: path.join(HOME_DIR, 'Desktop'), icon: '🖥' },
        { name: 'Documents', path: path.join(HOME_DIR, 'Documents'), icon: '📄' },
        { name: 'Downloads', path: path.join(HOME_DIR, 'Downloads'), icon: '📥' },
        { name: 'Code', path: path.join(HOME_DIR, 'code'), icon: '💻' },
      ],
    });
  });

  // API: list directory contents (absolute paths)
  app.get('/api/tree', async (req, res, next) => {
    try {
      const dirPath = sanitizePath(req.query.path);
      const stat = await fs.stat(dirPath);
      if (!stat.isDirectory()) {
        return res.status(400).json({ error: 'Not a directory' });
      }

      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      const results = await Promise.all(
        entries.map(async (entry) => {
          const fullPath = path.join(dirPath, entry.name);
          let type = entry.isDirectory() ? 'directory' : 'file';

          // Handle symlinks
          if (entry.isSymbolicLink()) {
            try {
              const realPath = await fs.realpath(fullPath);
              const realStat = await fs.stat(realPath);
              type = realStat.isDirectory() ? 'directory' : 'file';
            } catch {
              type = 'file'; // broken symlink
            }
          }

          const result = {
            name: entry.name,
            type,
            path: fullPath,
          };

          if (type === 'file') {
            result.ext = path.extname(entry.name).toLowerCase();
            try {
              const fileStat = await fs.stat(fullPath);
              result.size = fileStat.size;
            } catch {
              result.size = 0;
            }
          }

          return result;
        })
      );

      // Sort: directories first, then alphabetical (case-insensitive)
      results.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });

      res.json({
        current: dirPath,
        parent: path.dirname(dirPath) !== dirPath ? path.dirname(dirPath) : null,
        basename: path.basename(dirPath),
        entries: results,
      });
    } catch (err) {
      if (err.code === 'EACCES') {
        return res.status(403).json({ error: 'Permission denied' });
      }
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'Directory not found' });
      }
      next(err);
    }
  });

  // API: serve a file with correct MIME type
  app.get('/api/file', async (req, res, next) => {
    try {
      const filePath = sanitizePath(req.query.path);
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        return res.status(400).json({ error: 'Path is a directory' });
      }
      const mimeType = mime.lookup(filePath) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);
      res.sendFile(filePath);
    } catch (err) {
      if (err.code === 'EACCES') {
        return res.status(403).json({ error: 'Permission denied' });
      }
      if (err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      next(err);
    }
  });

  // Serve files by absolute path (for HTML relative assets)
  // Uses /browse?file=/absolute/path/to/file.html
  app.get('/browse', (req, res, next) => {
    try {
      const filePath = sanitizePath(req.query.file);
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  // Serve files preserving directory structure for relative asset resolution
  // /browsedir/absolute/path/dir/file.css resolves relative to the HTML file
  app.get('/browsedir/*', (req, res, next) => {
    try {
      const filePath = '/' + req.params[0];
      res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error(err.message);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

  const PORT = parseInt(process.env.PORT, 10) || 3000;

  // Write PID file so we can clean up stale processes
  const PID_FILE = path.join(os.tmpdir(), 'file-browser.pid');

  // Kill any previous instance
  try {
    const oldPid = require('fs').readFileSync(PID_FILE, 'utf8').trim();
    if (oldPid) {
      try { process.kill(parseInt(oldPid), 'SIGTERM'); } catch {}
    }
  } catch {}

  // Write current PID
  require('fs').writeFileSync(PID_FILE, String(process.pid));

  // Clean up PID file on exit
  process.on('exit', () => {
    try { require('fs').unlinkSync(PID_FILE); } catch {}
  });
  process.on('SIGINT', () => process.exit());
  process.on('SIGTERM', () => process.exit());

  const tryListen = (port) => {
    const server = app.listen(port, '127.0.0.1', () => {
      const url = `http://localhost:${port}`;
      console.log(`\nFile browser running at ${url}`);
      console.log(`Start directory: ${START_DIR}\n`);
      exec(`open ${url}`);
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && port < PORT + 10) {
        console.log(`Port ${port} in use, trying ${port + 1}...`);
        tryListen(port + 1);
      } else {
        console.error(`Could not start server: ${err.message}`);
        process.exit(1);
      }
    });
  };

  tryListen(PORT);
}

startServer();
