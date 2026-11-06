import { app, BrowserWindow } from 'electron';
import net from 'net';
import path from 'node:path';
import crypto from 'node:crypto';
import pkgUpdater from 'electron-updater';
const { autoUpdater } = pkgUpdater;

let mainWindow;
let port = 3001;
const localAuthToken = crypto.randomUUID();
process.env.LOCAL_AUTH_TOKEN = localAuthToken;

// Helper to find a free port starting from a default port
function findFreePort(startPort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, () => {
      server.once('close', () => {
        resolve(startPort);
      });
      server.close();
    });
    server.error = () => {
      resolve(findFreePort(startPort + 1));
    };
    server.on('error', () => {
      resolve(findFreePort(startPort + 1));
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
    title: "Marketing Flow",
    // We can set an icon here later if available
  });

  // Load the running Express server with local auth token
  mainWindow.loadURL(`http://localhost:${port}?token=${localAuthToken}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // 1. Find a free port dynamically to prevent address collision errors
  port = await findFreePort(3001);
  process.env.PORT = String(port);
  process.env.NODE_ENV = 'production';
  process.env.USER_DATA_PATH = app.getPath('userData');
  if (app.isPackaged) {
    process.env.DEMUCS_RUNTIME_DIR = path.join(process.resourcesPath, 'audio-engine');
  }

  console.log(`[Electron Main] Starting Express server on port ${port}...`);

  // 2. Dynamically import the Express server so it starts with the set port and NODE_ENV
  try {
    await import('./server/server.js');
    console.log(`[Electron Main] Express server started successfully.`);
  } catch (err) {
    console.error(`[Electron Main] Failed to start Express server:`, err);
    app.quit();
    return;
  }

  // 3. Create the desktop window
  createWindow();

  // 4. Auto-update check (only in packaged production environment)
  if (app.isPackaged) {
    autoUpdater.logger = console;
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.error('[Electron Main] AutoUpdate Error:', err);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
