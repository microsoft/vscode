import * as vscode from 'vscode';
import { CrdtBridge } from './CrdtBridge.js';
import { AwarenessMessage } from '../types/messages.js';
import { CursorDecorations, RemoteSelection } from './CursorDecorations.js';

const DEBOUNCE_MS = 75;

type PeerState = {
  clientId: string;
  username: string;
  color: string;
  uri: string;
  selectionStart: number;
  selectionEnd: number;
};

export class Presence {
  private readonly peers = new Map<string, PeerState>();
  private readonly decorations = new CursorDecorations();
  private debounceHandle: ReturnType<typeof setTimeout> | undefined;
  private awarenessSubscription: vscode.Disposable | null = null;

  constructor(private readonly bridge: CrdtBridge, private readonly username: string) {}

  initialize() {
    this.awarenessSubscription = this.bridge.onAwareness((message) => this.onAwareness(message));
    this.render();
  }

  handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent) {
    if (!event.textEditor?.document) {
      return;
    }
    this.scheduleBroadcast(event.textEditor);
  }

  syncEditor(editor: vscode.TextEditor | undefined) {
    if (!editor || editor.document.isClosed) {
      return;
    }
    this.scheduleBroadcast(editor, true);
  }

  render() {
    this.decorations.clear();
    for (const editor of vscode.window.visibleTextEditors) {
      const uri = editor.document.uri.toString();
      const selections: RemoteSelection[] = [];
      for (const peer of this.peers.values()) {
        if (peer.uri === uri) {
          selections.push({
            clientId: peer.clientId,
            username: peer.username,
            selectionStart: peer.selectionStart,
            selectionEnd: peer.selectionEnd,
            color: peer.color
          });
        }
      }
      if (selections.length > 0) {
        this.decorations.apply(editor, selections);
      } else {
        this.decorations.apply(editor, []);
      }
    }
  }

  dispose() {
    this.decorations.dispose();
    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }
    this.awarenessSubscription?.dispose();
    this.peers.clear();
  }

  private onAwareness(message: AwarenessMessage) {
    if (message.clientId === this.bridge.getClientId()) {
      return;
    }

    if (!message.state) {
      this.peers.delete(message.clientId);
      this.render();
      return;
    }

    this.peers.set(message.clientId, {
      clientId: message.clientId,
      username: message.state.username || 'guest',
      color: this.colorFor(message.clientId),
      uri: message.state.uri,
      selectionStart: message.state.selectionStart,
      selectionEnd: message.state.selectionEnd
    });
    this.render();
  }

  private colorFor(clientId: string) {
    const hash = Array.from(clientId).reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const hue = hash % 360;
    return `hsl(${hue} 82% 64%)`;
  }

  private scheduleBroadcast(editor: vscode.TextEditor, immediate = false) {
    const run = () => {
      const selection = editor.selection;
      const start = editor.document.offsetAt(selection.start);
      const end = editor.document.offsetAt(selection.end);
      this.bridge.sendAwareness({
        uri: editor.document.uri.toString(),
        selectionStart: start,
        selectionEnd: end,
        username: this.username
      });
    };

    if (immediate) {
      run();
      return;
    }

    if (this.debounceHandle) {
      clearTimeout(this.debounceHandle);
    }
    this.debounceHandle = setTimeout(run, DEBOUNCE_MS);
  }
}
