import * as vscode from 'vscode';
import * as Y from 'yjs';
import { AwarenessMessage, AwarenessState, FsOperation, Message, SyncMessage, WelcomeMessage } from '../types/messages.js';

const globalScope = globalThis as typeof globalThis & {
  btoa?: (data: string) => string;
  atob?: (data: string) => string;
};

const encoder = (data: Uint8Array): string => {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(data).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  if (globalScope.btoa) {
    return globalScope.btoa(binary);
  }
  throw new Error('Unable to encode base64: no available encoder');
};

const decoder = (data: string): Uint8Array => {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(data, 'base64'));
  }
  if (!globalScope.atob) {
    throw new Error('Unable to decode base64: no available decoder');
  }
  const binary = globalScope.atob(data);
  const buffer = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    buffer[i] = binary.charCodeAt(i);
  }
  return buffer;
};

type DocumentBinding = {
  ytext: Y.Text;
  observer: (event: Y.YTextEvent, transaction: Y.Transaction) => void;
};

export type BridgeOptions = {
  serverUrl: string;
  username: string;
  room: string;
  bootstrap: boolean;
};

export type CollabStatus = {
  connected: boolean;
  serverUrl: string;
  room: string | null;
  clientId: string | null;
  peers: number;
  lastLocalChange: Date | null;
  lastRemoteChange: Date | null;
};

export class CrdtBridge {
  private ws: WebSocket | null = null;
  private readonly ydoc = new Y.Doc();
  private readonly bindings = new Map<string, DocumentBinding>();
  private readonly awarenessEmitter = new vscode.EventEmitter<AwarenessMessage>();
  private readonly fsEmitter = new vscode.EventEmitter<FsOperation & { clientId?: string }>();
  private options: BridgeOptions | null = null;
  private connected = false;
  private clientId: string | null = null;
  private peerIds = new Set<string>();
  private lastLocalChange: Date | null = null;
  private lastRemoteChange: Date | null = null;
  private applyingRemote = false;

  readonly onAwareness = this.awarenessEmitter.event;
  readonly onFs = this.fsEmitter.event;

  constructor() {
    this.ydoc.on('update', (update, _origin, _doc, transaction) => {
      if (!this.connected) {
        return;
      }
      if (transaction && transaction.origin === 'remote') {
        return;
      }
      this.lastLocalChange = new Date();
      this.send({ type: 'sync', update: encoder(update) });
    });
  }

  async connect(options: BridgeOptions) {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.options = options;
    const url = new URL(options.serverUrl);
    url.searchParams.set('room', options.room);

    this.ws = new WebSocket(url.toString());
    this.ws.binaryType = 'arraybuffer';

    await new Promise<void>((resolve, reject) => {
      if (!this.ws) {
        reject(new Error('WebSocket not created'));
        return;
      }
      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };
      this.ws.onerror = (err) => reject(err);
    });

    this.ws.onmessage = (event) => {
      if (typeof event.data !== 'string') {
        return;
      }
      this.handleMessage(event.data);
    };

    this.ws.onerror = (event) => {
      console.error('cocode collab websocket error', event);
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.peerIds.clear();
    };
  }

  bindDocument(document: vscode.TextDocument) {
    if (document.isUntitled) {
      return;
    }
    const uri = document.uri.toString();
    if (this.bindings.has(uri)) {
      return;
    }

    const ytext = this.ydoc.getText(uri);
    const observer = (event: Y.YTextEvent, transaction: Y.Transaction) => {
      if (transaction.local) {
        return;
      }
      this.lastRemoteChange = new Date();
      void this.applyFullDocument(uri);
    };

    ytext.observe(observer);
    this.bindings.set(uri, { ytext, observer });

    if (this.options?.bootstrap && ytext.length === 0) {
      const text = document.getText();
      if (text.length > 0) {
        this.ydoc.transact(() => {
          ytext.insert(0, text);
        }, 'bootstrap');
      }
    } else if (ytext.toString() !== document.getText()) {
      void this.applyFullDocument(uri);
    }
  }

  unbindDocument(uri: vscode.Uri) {
    const key = uri.toString();
    const binding = this.bindings.get(key);
    if (!binding) {
      return;
    }
    binding.ytext.unobserve(binding.observer);
    this.bindings.delete(key);
  }

  handleLocalChange(event: vscode.TextDocumentChangeEvent) {
    if (this.applyingRemote) {
      return;
    }

    const uri = event.document.uri.toString();
    const binding = this.bindings.get(uri);
    if (!binding) {
      return;
    }

    const changes = [...event.contentChanges].sort((a, b) => b.rangeOffset - a.rangeOffset);
    if (changes.length === 0) {
      return;
    }

    this.ydoc.transact(() => {
      for (const change of changes) {
        if (change.rangeLength > 0) {
          binding.ytext.delete(change.rangeOffset, change.rangeLength);
        }
        if (change.text.length > 0) {
          binding.ytext.insert(change.rangeOffset, change.text);
        }
      }
    }, 'vscode');
  }

  sendAwareness(state: AwarenessState) {
    this.send({ type: 'awareness', clientId: this.clientId ?? '', state });
  }

  sendFs(operation: FsOperation) {
    this.send(operation);
  }

  getStatus(): CollabStatus {
    return {
      connected: this.connected,
      serverUrl: this.options?.serverUrl ?? 'unknown',
      room: this.options?.room ?? null,
      clientId: this.clientId,
      peers: this.peerIds.size,
      lastLocalChange: this.lastLocalChange,
      lastRemoteChange: this.lastRemoteChange
    };
  }

  getClientId() {
    return this.clientId;
  }

  dispose() {
    for (const [, binding] of this.bindings) {
      binding.ytext.unobserve(binding.observer);
    }
    this.bindings.clear();
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.clientId = null;
    this.peerIds.clear();
    this.awarenessEmitter.dispose();
    this.fsEmitter.dispose();
  }

  private async applyFullDocument(uri: string) {
    const binding = this.bindings.get(uri);
    if (!binding) {
      return;
    }
    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri);
    if (!doc) {
      return;
    }

    const nextText = binding.ytext.toString();
    if (doc.getText() === nextText) {
      return;
    }

    const edit = new vscode.WorkspaceEdit();
    const lastLineIndex = Math.max(doc.lineCount - 1, 0);
    const lastLine = doc.lineCount === 0 ? '' : doc.lineAt(lastLineIndex).text;
    const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lastLineIndex, lastLine.length));

    this.applyingRemote = true;
    try {
      edit.replace(doc.uri, range, nextText);
      await vscode.workspace.applyEdit(edit);
    } finally {
      this.applyingRemote = false;
    }
  }

  private send(message: Message) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  private handleMessage(raw: string) {
    let message: Message;
    try {
      message = JSON.parse(raw) as Message;
    } catch (error) {
      console.error('Failed to parse collab message', error);
      return;
    }

    if (message.type === 'welcome') {
      const welcome = message as WelcomeMessage;
      this.clientId = welcome.clientId;
      return;
    }

    if (message.type === 'sync') {
      const sync = message as SyncMessage;
      const update = decoder(sync.update);
      Y.applyUpdate(this.ydoc, update, 'remote');
      if (sync.clientId) {
        this.peerIds.add(sync.clientId);
      }
      return;
    }

    if (message.type === 'awareness') {
      const awareness = message as AwarenessMessage;
      if (awareness.clientId !== this.clientId) {
        if (awareness.state) {
          this.peerIds.add(awareness.clientId);
        } else {
          this.peerIds.delete(awareness.clientId);
        }
      }
      this.awarenessEmitter.fire(awareness);
      return;
    }

    if (message.type === 'fs') {
      this.fsEmitter.fire(message);
      return;
    }
  }
}
