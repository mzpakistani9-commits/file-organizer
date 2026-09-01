const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');

// electron-is-dev is an optional dep; fall back cleanly if not installed.
let isDev = false;
try {
  isDev = require('electron-is-dev');
} catch (e) {
  isDev = !app.isPackaged;
}

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
      nodeIntegration: false,
    },
  });

  // BUGFIX: packaged build lives at <appRoot>/build/index.html.
  // ../build would point OUTSIDE the asar/packaged dir and the window would be blank.
  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, 'build/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // BUGFIX: mainWindow is `undefined` (never null) once closed on macOS;
  // re-create on "activate" and after the window is destroyed.
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
});

// ---------- Helpers ----------

/**
 * Move a file/folder safely:
 * - Handles cross-drive/cross-filesystem moves (EXDEV) by copying then deleting.
 * - Never overwrites an existing file: auto-renames to "name (1).ext" instead.
 * Returns the final destination path actually used.
 */
async function safeMove(sourcePath, destPath) {
  const destDir = path.dirname(destPath);
  await fs.mkdir(destDir, { recursive: true });

  const finalDest = await getNonCollidingPath(destPath);

  try {
    await fs.rename(sourcePath, finalDest);
  } catch (err) {
    if (err.code === 'EXDEV') {
      // Cross-device move: rename() can't do this atomically. Copy then delete source.
      await copyRecursive(sourcePath, finalDest);
      await fs.rm(sourcePath, { recursive: true, force: true });
    } else {
      throw err;
    }
  }

  return finalDest;
}

/** If destPath already exists, append " (1)", " (2)", etc. until it's free. */
async function getNonCollidingPath(destPath) {
  let candidate = destPath;
  let counter = 1;
  const dir = path.dirname(destPath);
  const ext = path.extname(destPath);
  const base = path.basename(destPath, ext);

  while (fsSync.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}

async function copyRecursive(src, dest) {
  const stat = await fs.stat(src);
  if (stat.isDirectory()) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry.name), path.join(dest, entry.name));
    }
  } else {
    await fs.copyFile(src, dest);
  }
}

/** Prevent moving a folder into itself or one of its own descendants. */
function isSubPath(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** Build a RegExp safely; returns null instead of throwing on invalid patterns. */
function safeRegex(pattern) {
  try {
    return new RegExp(pattern, 'i');
  } catch (e) {
    return null;
  }
}

// ---------- IPC Handlers ----------

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('get-folder-contents', async (event, folderPath) => {
  try {
    const files = await fs.readdir(folderPath, { withFileTypes: true });
    const contents = await Promise.all(
      files.map(async (file) => {
        const fullPath = path.join(folderPath, file.name);
        let size = 0;
        try {
          const stat = await fs.stat(fullPath);
          size = stat.size;
        } catch (e) {
          // file may have been removed between readdir and stat; ignore
        }
        return {
          name: file.name,
          path: fullPath,
          isDirectory: file.isDirectory(),
          ext: path.extname(file.name),
          size,
        };
      })
    );
    return contents;
  } catch (error) {
    console.error('Error reading folder:', error);
    return [];
  }
});

// Move file/folder (the core operation)
ipcMain.handle('move-file', async (event, sourcePath, destPath) => {
  try {
    if (sourcePath === destPath) {
      return { success: false, error: 'Source and destination are the same.' };
    }
    // Block moving a folder into its own subtree
    const sourceStat = await fs.stat(sourcePath);
    if (sourceStat.isDirectory() && isSubPath(sourcePath, destPath)) {
      return { success: false, error: "Can't move a folder into itself or its own subfolder." };
    }

    const finalDest = await safeMove(sourcePath, destPath);
    return { success: true, finalPath: finalDest, renamed: finalDest !== destPath };
  } catch (error) {
    console.error('Error moving file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-config', async () => {
  try {
    const configPath = path.join(app.getPath('userData'), 'organizer-config.json');
    if (fsSync.existsSync(configPath)) {
      const data = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(data);
    }
    return { rules: [], positions: {} };
  } catch (error) {
    console.error('Error reading config:', error);
    return { rules: [], positions: {} };
  }
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    const configPath = path.join(app.getPath('userData'), 'organizer-config.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error saving config:', error);
    return { success: false, error: error.message };
  }
});

// Organize folder by rules — each file is isolated so one failure doesn't stop the batch.
ipcMain.handle('organize-folder', async (event, folderPath, rules) => {
  const results = [];
  let files;
  try {
    files = await fs.readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    return { error: `Could not read folder: ${error.message}` };
  }

  for (const file of files) {
    if (file.isDirectory()) continue;

    const sourcePath = path.join(folderPath, file.name);
    let targetFolder = null;
    let ruleError = null;

    for (const rule of rules) {
      let matches = false;

      if (rule.type === 'extension') {
        // BUGFIX: tolerate ".pdf" and "pdf" — normalize to a leading dot.
        let ext = String(rule.value || '').toLowerCase().trim();
        if (ext && !ext.startsWith('.')) ext = `.${ext}`;
        matches = ext !== '' && file.name.toLowerCase().endsWith(ext);
      } else if (rule.type === 'namePattern') {
        const regex = safeRegex(rule.value);
        if (!regex) {
          ruleError = `Invalid pattern "${rule.value}" — skipped`;
          continue;
        }
        matches = regex.test(file.name);
      } else if (rule.type === 'fileType') {
        const ext = path.extname(file.name).toLowerCase();
        const typeMap = {
          image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.heic'],
          document: ['.pdf', '.doc', '.docx', '.txt', '.xlsx', '.pptx', '.csv', '.rtf'],
          video: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm'],
          audio: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'],
          archive: ['.zip', '.rar', '.7z', '.tar', '.gz'],
        };
        matches = (typeMap[rule.value] || []).includes(ext);
      }

      if (matches) {
        targetFolder = rule.targetFolder;
        break;
      }
    }

    if (targetFolder) {
      try {
        const destPath = path.join(folderPath, targetFolder, file.name);
        const finalDest = await safeMove(sourcePath, destPath);
        results.push({
          file: file.name,
          moved: true,
          destination: targetFolder,
          renamed: finalDest !== destPath ? path.basename(finalDest) : null,
        });
      } catch (error) {
        results.push({ file: file.name, moved: false, error: error.message });
      }
    } else if (ruleError) {
      results.push({ file: file.name, moved: false, error: ruleError });
    }
  }

  return results;
});

// ---------- Auto Organize (no rules needed) ----------
// Preset file-type folders in a fixed order so numbering stays stable.
const FILE_TYPE_FOLDERS = [
  { folder: 'Images', exts: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.heic'] },
  { folder: 'Documents', exts: ['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.xls', '.pptx', '.csv', '.rtf'] },
  { folder: 'Videos', exts: ['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm'] },
  { folder: 'Audio', exts: ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'] },
  { folder: 'Archives', exts: ['.zip', '.rar', '.7z', '.tar', '.gz'] },
];

const pad2 = (n) => String(n).padStart(2, '0');

ipcMain.handle('auto-organize', async (event, folderPath, options = {}) => {
  const scheme = options.scheme || 'numbered'; // 'named' | 'numbered' | 'extension'
  const includeOthers = options.includeOthers !== false;

  let files;
  try {
    files = await fs.readdir(folderPath, { withFileTypes: true });
  } catch (error) {
    return { error: `Could not read folder: ${error.message}` };
  }

  // 'numbered' uses a stable number per preset type (01_Images, 02_Documents, ...).
  const typeNumbers = {};
  FILE_TYPE_FOLDERS.forEach((t, i) => { typeNumbers[t.folder] = pad2(i + 1); });

  const results = [];
  const usedFolders = [];
  const extCounters = {};

  for (const file of files) {
    if (file.isDirectory()) continue;
    const sourcePath = path.join(folderPath, file.name);
    const ext = path.extname(file.name).toLowerCase();

    let folderName = null;
    if (scheme === 'extension') {
      const bare = (ext.replace(/^\./, '')) || 'other';
      folderName = bare;
      extCounters[folderName] = (extCounters[folderName] || 0) + 1;
    } else {
      const type = FILE_TYPE_FOLDERS.find((t) => t.exts.includes(ext));
      folderName = type ? type.folder : (includeOthers ? 'Others' : null);
      if (!folderName) continue;
    }

    if (scheme === 'numbered') folderName = `${typeNumbers[folderName] || '99'}_${folderName}`;
    if (scheme === 'extension') folderName = `${pad2(extCounters[folderName])}_${folderName}`;

    if (!usedFolders.includes(folderName)) usedFolders.push(folderName);

    try {
      const destPath = path.join(folderPath, folderName, file.name);
      const finalDest = await safeMove(sourcePath, destPath);
      results.push({
        file: file.name,
        moved: true,
        destination: folderName,
        renamed: finalDest !== destPath ? path.basename(finalDest) : null,
      });
    } catch (error) {
      results.push({ file: file.name, moved: false, error: error.message });
    }
  }

  return { results, folders: usedFolders };
});