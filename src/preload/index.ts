import { contextBridge } from 'electron';
import type { AppBridge } from '../shared/app-bridge';

const appBridge = Object.freeze({
  appName: 'Debt Tracker',
  bridgeVersion: 1,
} satisfies AppBridge);

contextBridge.exposeInMainWorld('debtTracker', appBridge);
