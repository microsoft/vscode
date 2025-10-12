const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  authSuccess: () => ipcRenderer.send('auth-success'),
  getFirebaseConfig: () => ipcRenderer.invoke('get-firebase-config')
});