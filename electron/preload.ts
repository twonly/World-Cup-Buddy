import { contextBridge, ipcRenderer } from 'electron';

export type Mood = 'idle' | 'watch' | 'cheer' | 'sad' | 'flag' | 'sleep' | 'dance';
export type ShrimpEvent =
  | { kind: 'mood'; mood: Mood }
  | { kind: 'pack'; pack: any }
  | { kind: 'score'; score: any; showPossession?: boolean; showWinProb?: boolean }
  | { kind: 'possession' | 'winprob'; points: number[] };

contextBridge.exposeInMainWorld('shrimpAPI', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (cfg: any) => ipcRenderer.invoke('config:set', cfg),
  listTeams: () => ipcRenderer.invoke('teams:list'),
  getTeamAliases: () => ipcRenderer.invoke('teams:aliases'),
  drag: (dx: number, dy: number) => ipcRenderer.invoke('shrimp:drag', dx, dy),
  click: () => ipcRenderer.invoke('shrimp:click'),
  triggerDemo: () => ipcRenderer.invoke('demo:trigger'),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  saveCard: () => ipcRenderer.invoke('card:save'),
  listCharacters: () => ipcRenderer.invoke('characters:list'),
  openCharactersFolder: () => ipcRenderer.invoke('characters:openFolder'),
  getCharacter: (id: string) => ipcRenderer.invoke('characters:get', id),
  importFlags: () => ipcRenderer.invoke('characters:importFlags'),
  contextMenu: () => ipcRenderer.invoke('shrimp:contextMenu'),
  farewell: () => ipcRenderer.invoke('shrimp:farewell'),
  testProxy: (mode: string, proxyUrl?: string, proxyBypass?: string) => ipcRenderer.invoke('proxy:test', mode, proxyUrl, proxyBypass),
  onEvent: (cb: (ev: ShrimpEvent) => void) => {
    const listener = (_: any, ev: ShrimpEvent) => cb(ev);
    ipcRenderer.on('shrimp-event', listener);
    return () => ipcRenderer.removeListener('shrimp-event', listener);
  },
});

// Bubble window controls (pin = cancel auto-close, user closes manually)
contextBridge.exposeInMainWorld('bubbleAPI', {
  pin: () => ipcRenderer.invoke('bubble:pin'),
  close: () => ipcRenderer.invoke('bubble:close'),
  drag: (dx: number, dy: number) => ipcRenderer.invoke('bubble:drag', dx, dy),
  resize: (contentH: number) => ipcRenderer.invoke('bubble:resize', contentH),
});
