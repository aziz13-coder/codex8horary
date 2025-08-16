const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { promisify } = require('util');
const net = require('net');

// Determine whether we are running in development mode
const isDev = !app.isPackaged;

let mainWindow;
let backendProcess;
let isQuitting = false;

// Backend configuration
const BACKEND_PORT = 5000;
const FRONTEND_PORT = isDev ? 3000 : null;
const MAX_BACKEND_STARTUP_TIME = 120000; // 120 seconds

// Utility function to check if port is available
function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.once('close', () => resolve(true));
      server.close();
    });
    server.on('error', () => resolve(false));
  });
}

// Wait for backend to be ready
async function waitForBackend() {
  const startTime = Date.now();
  while (Date.now() - startTime < MAX_BACKEND_STARTUP_TIME) {
    try {
      const response = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/health`);
      if (response.ok) {
        console.log('Backend is ready');
        return true;
      }
    } catch (error) {
      // Backend not ready yet, continue waiting
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

// Find backend executable (compiled or Python script)
function findBackendExecutable() {
  const executableName = process.platform === 'win32' ? 'horary_backend.exe' : 'horary_backend';
  
  // In production, look for the compiled executable first
  if (!isDev) {
    const productionPaths = [
      // Electron resources paths
      path.join(process.resourcesPath, 'backend', executableName),
      path.join(process.resourcesPath, 'app', 'backend', executableName),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'backend', executableName),
      path.join(__dirname, '..', 'app.asar.unpacked', 'backend', executableName),
      path.join(path.dirname(process.execPath), 'resources', 'backend', executableName),
      path.join(path.dirname(process.execPath), 'resources', 'app', 'backend', executableName),
      path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'backend', executableName),
    ];

    for (const exePath of productionPaths) {
      try {
        if (require('fs').existsSync(exePath)) {
          console.log(`Found backend executable at: ${exePath}`);
          return { executable: exePath, usesPython: false };
        }
      } catch (error) {
        // Continue to next path
      }
    }
  }

  // Fallback to Python script (development or if executable not found)
  const pythonPaths = [
    'python',
    'python3',
    'python.exe',
    'C:\\Python39\\python.exe',
    'C:\\Python310\\python.exe',
    'C:\\Python311\\python.exe',
    'C:\\Python312\\python.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python39', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
  ];

  for (const pythonPath of pythonPaths) {
    try {
      const result = spawn(pythonPath, ['--version'], { stdio: 'pipe' });
      if (result) {
        console.log(`Found Python at: ${pythonPath}`);
        return { executable: pythonPath, usesPython: true };
      }
    } catch (error) {
      // Continue to next path
    }
  }
  
  console.log('No backend executable or Python found, using fallback');
  return { 
    executable: process.platform === 'win32' ? 'python.exe' : 'python3', 
    usesPython: true 
  };
}

// Find backend directory
function findBackendPath() {
  const possiblePaths = [
    // Development paths
    path.join(__dirname, '..', 'backend'),
    path.join(__dirname, 'backend'),
    
    // Production paths - Electron resources
    path.join(process.resourcesPath, 'backend'),
    path.join(process.resourcesPath, 'app', 'backend'),
    
    // Asar unpacked paths
    path.join(process.resourcesPath, 'app.asar.unpacked', 'backend'),
    path.join(__dirname, '..', 'app.asar.unpacked', 'backend'),
    
    // Other possible packaged paths
    path.join(__dirname, '..', '..', 'backend'),
    path.join(process.resourcesPath, '..', 'backend'),
    path.join(path.dirname(process.execPath), 'resources', 'backend'),
    path.join(path.dirname(process.execPath), 'resources', 'app', 'backend'),
    path.join(path.dirname(process.execPath), 'resources', 'app.asar.unpacked', 'backend'),
  ];

  console.log('Searching for backend in the following paths:');
  for (const backendPath of possiblePaths) {
    const appScript = path.join(backendPath, 'app.py');
    console.log(`  Checking: ${appScript}`);
    try {
      if (require('fs').existsSync(appScript)) {
        console.log(`✓ Found backend at: ${backendPath}`);
        return backendPath;
      }
    } catch (error) {
      console.log(`  ✗ Error checking path: ${error.message}`);
    }
  }

  console.log('Backend not found in any expected location');
  // Fallback
  const fallbackPath = isDev 
    ? path.join(__dirname, '..', 'backend')
    : path.join(process.resourcesPath, 'backend');
  
  console.log(`Using fallback path: ${fallbackPath}`);
  return fallbackPath;
}

// Start backend process
async function startBackend() {
  if (backendProcess) {
    return;
  }

  // Check if backend port is available
  const portAvailable = await checkPort(BACKEND_PORT);
  if (!portAvailable) {
    console.error(`Port ${BACKEND_PORT} is already in use`);
    return false;
  }

  const backendInfo = findBackendExecutable();
  const backendPath = findBackendPath();

  console.log(`Starting backend:`);
  console.log(`  Executable: ${backendInfo.executable}`);
  console.log(`  Uses Python: ${backendInfo.usesPython}`);
  console.log(`  Backend path: ${backendPath}`);
  console.log(`  Development mode: ${isDev}`);

  let command, args, cwd;

  if (backendInfo.usesPython) {
    // Using Python script
    const appScript = path.join(backendPath, 'app.py');
    
    // Check if app.py exists
    try {
      require('fs').accessSync(appScript);
      console.log(`✓ Found app.py at ${appScript}`);
    } catch (error) {
      console.error(`✗ Cannot find app.py at ${appScript}`);
      if (!isDev) {
        dialog.showErrorBox('Backend Error', `Cannot find backend files at:\n${appScript}\n\nPlease ensure the application was built correctly.`);
      }
      return false;
    }

    command = backendInfo.executable;
    args = [appScript];
    cwd = backendPath;
  } else {
    // Using compiled executable
    try {
      require('fs').accessSync(backendInfo.executable);
      console.log(`✓ Found backend executable at ${backendInfo.executable}`);
    } catch (error) {
      console.error(`✗ Cannot find backend executable at ${backendInfo.executable}`);
      if (!isDev) {
        dialog.showErrorBox('Backend Error', `Cannot find backend executable at:\n${backendInfo.executable}\n\nPlease ensure the application was built correctly.`);
      }
      return false;
    }

    command = backendInfo.executable;
    args = [];
    cwd = path.dirname(backendInfo.executable);
  }

  backendProcess = spawn(command, args, {
    cwd: cwd,
    stdio: isDev ? 'inherit' : 'pipe',
    env: { 
      ...process.env, 
      FLASK_ENV: isDev ? 'development' : 'production',
      PYTHONPATH: backendPath,
      PYTHONUNBUFFERED: '1'
    }
  });

  // Log backend output in production for debugging
  if (!isDev && backendProcess.stdout && backendProcess.stderr) {
    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend stdout: ${data}`);
    });
    
    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend stderr: ${data}`);
    });
  }

  backendProcess.on('error', (error) => {
    console.error('Backend process error:', error);
    if (!isDev) {
      dialog.showErrorBox('Backend Error', `Failed to start backend: ${error.message}`);
    }
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`Backend process exited with code ${code} and signal ${signal}`);
    backendProcess = null;
    if (!isQuitting && code !== 0) {
      // Restart backend if it crashes unexpectedly
      setTimeout(() => startBackend(), 2000);
    }
  });

  // Wait for backend to be ready
  const ready = await waitForBackend();
  if (!ready) {
    console.error('Backend failed to start within timeout');
    return false;
  }

  return true;
}

// Create the main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : process.platform === 'darwin' ? 'icon.icns' : 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    },
    show: false, // Don't show until ready
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default'
  });

  // Set up the menu
  createMenu();

  // Load the app
  if (isDev) {
    const devUrl = process.env.DEV_SERVER_URL || `http://localhost:${FRONTEND_PORT}`;
    mainWindow.loadURL(devUrl);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return mainWindow;
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chart',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-chart');
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Vox Stella',
              message: 'Vox Stella',
              detail: 'Traditional Horary Astrology Application\nVersion 1.1.0'
            });
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });

    // Window menu for macOS
    template[4].submenu = [
      { role: 'close' },
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      { role: 'front' }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App event handlers
app.whenReady().then(async () => {
  console.log('App ready, starting backend...');
  
  // Start backend first
  const backendStarted = await startBackend();
  if (!backendStarted && !isDev) {
    dialog.showErrorBox('Startup Error', 'Failed to start the backend service. The application will exit.');
    app.quit();
    return;
  }

  // Create main window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Ensure backend cleanup before quitting
    if (backendProcess && !isQuitting) {
      isQuitting = true;
      
      if (process.platform === 'win32') {
        // Windows-specific cleanup
        try {
          const { spawn } = require('child_process');
          spawn('taskkill', ['/pid', backendProcess.pid, '/t', '/f'], {
            stdio: 'ignore'
          });
          setTimeout(() => {
            backendProcess = null;
            app.quit();
          }, 1000);
        } catch (error) {
          backendProcess.kill('SIGKILL');
          backendProcess = null;
          app.quit();
        }
      } else {
        backendProcess.kill('SIGTERM');
        setTimeout(() => {
          if (backendProcess) {
            backendProcess.kill('SIGKILL');
          }
          backendProcess = null;
          app.quit();
        }, 2000);
      }
    } else {
      app.quit();
    }
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  
  // Terminate backend process with Windows-specific handling
  if (backendProcess) {
    console.log('Terminating backend process...');
    
    if (process.platform === 'win32') {
      // Windows-specific process termination
      try {
        // First attempt: graceful termination
        backendProcess.kill('SIGTERM');
        
        // Second attempt: force kill after 3 seconds (reduced timeout)
        setTimeout(() => {
          if (backendProcess && !backendProcess.killed) {
            console.log('Force killing backend process on Windows...');
            try {
              // Use taskkill for more reliable Windows process termination
              const { spawn } = require('child_process');
              spawn('taskkill', ['/pid', backendProcess.pid, '/t', '/f'], {
                stdio: 'ignore'
              });
            } catch (error) {
              console.error('Error using taskkill:', error);
              // Fallback to SIGKILL
              try {
                backendProcess.kill('SIGKILL');
              } catch (killError) {
                console.error('Error with SIGKILL:', killError);
              }
            }
          }
        }, 3000);
        
        // Final cleanup after 6 seconds
        setTimeout(() => {
          if (backendProcess && !backendProcess.killed) {
            console.log('Final cleanup attempt...');
            try {
              backendProcess.kill(9); // Force kill with signal 9
            } catch (error) {
              console.error('Final cleanup failed:', error);
            }
            backendProcess = null;
          }
        }, 6000);
        
      } catch (error) {
        console.error('Error terminating backend process:', error);
        backendProcess = null;
      }
    } else {
      // Unix/Linux/macOS termination (original logic)
      backendProcess.kill('SIGTERM');
      
      // Force kill after 5 seconds if it doesn't exit gracefully
      setTimeout(() => {
        if (backendProcess) {
          backendProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// Handle certificate errors in development
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (isDev) {
    // In development, ignore certificate errors
    event.preventDefault();
    callback(true);
  } else {
    // In production, use default behavior
    callback(false);
  }
});

console.log(`Vox Stella starting in ${isDev ? 'development' : 'production'} mode`);

// Additional cleanup on process exit (Windows-specific enhancement)
process.on('exit', () => {
  if (backendProcess && process.platform === 'win32') {
    try {
      const { execSync } = require('child_process');
      execSync(`taskkill /pid ${backendProcess.pid} /t /f`, { stdio: 'ignore' });
    } catch (error) {
      // Ignore errors during cleanup
    }
  }
});

// Handle SIGINT (Ctrl+C) for proper cleanup
process.on('SIGINT', () => {
  if (backendProcess) {
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        execSync(`taskkill /pid ${backendProcess.pid} /t /f`, { stdio: 'ignore' });
      } catch (error) {
        // Ignore errors
      }
    } else {
      backendProcess.kill('SIGTERM');
    }
  }
  process.exit(0);
});

// Handle SIGTERM for proper cleanup
process.on('SIGTERM', () => {
  if (backendProcess) {
    if (process.platform === 'win32') {
      try {
        const { execSync } = require('child_process');
        execSync(`taskkill /pid ${backendProcess.pid} /t /f`, { stdio: 'ignore' });
      } catch (error) {
        // Ignore errors
      }
    } else {
      backendProcess.kill('SIGTERM');
    }
  }
  process.exit(0);
});