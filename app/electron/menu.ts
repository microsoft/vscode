import { BrowserWindow, Menu, MenuItemConstructorOptions, app } from 'electron';

export function createMenu(mainWindow: BrowserWindow): void {
  const isMac = process.platform === 'darwin';

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow.webContents.send('menu:open-folder'),
        },
        {
          label: 'New File',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu:new-file'),
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu:save'),
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu:save-as'),
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => mainWindow.webContents.send('menu:settings'),
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
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
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => mainWindow.webContents.send('menu:find'),
        },
        {
          label: 'Find in Files',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => mainWindow.webContents.send('menu:find-in-files'),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => mainWindow.webContents.send('menu:command-palette'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => mainWindow.webContents.send('menu:toggle-sidebar'),
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'CmdOrCtrl+`',
          click: () => mainWindow.webContents.send('menu:toggle-terminal'),
        },
        {
          label: 'Toggle AI Panel',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => mainWindow.webContents.send('menu:toggle-ai'),
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
      ],
    },
    {
      label: 'Terminal',
      submenu: [
        {
          label: 'New Terminal',
          accelerator: 'CmdOrCtrl+Shift+`',
          click: () => mainWindow.webContents.send('menu:new-terminal'),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About AI Studio',
          click: () => mainWindow.webContents.send('menu:about'),
        },
        {
          label: 'Documentation',
          click: () => {
            import('electron').then(({ shell }) => {
              shell.openExternal('https://github.com/nathakumar/vscode');
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => mainWindow.webContents.toggleDevTools(),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
