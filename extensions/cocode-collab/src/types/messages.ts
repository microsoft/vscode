export type SyncMessage = {
  type: 'sync';
  update: string; // base64 encoded Yjs update
  clientId?: string;
};

export type AwarenessState = {
  uri: string;
  selectionStart: number;
  selectionEnd: number;
  username: string;
};

export type AwarenessMessage = {
  type: 'awareness';
  clientId: string;
  state: AwarenessState | null;
};

export type FsOperation =
  | { type: 'fs'; op: 'create'; uri: string } 
  | { type: 'fs'; op: 'delete'; uri: string }
  | { type: 'fs'; op: 'rename'; uri: string; from: string };

export type WelcomeMessage = {
  type: 'welcome';
  clientId: string;
  room: string;
};

export type Message = SyncMessage | AwarenessMessage | FsOperation | WelcomeMessage;
