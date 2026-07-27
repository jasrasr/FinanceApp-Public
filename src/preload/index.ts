import { contextBridge, ipcRenderer } from 'electron';
import { createAppBridge } from './debt-bridge';

const appBridge = createAppBridge((channel, request) =>
  ipcRenderer.invoke(channel, request),
);

contextBridge.exposeInMainWorld('debtTracker', appBridge);
