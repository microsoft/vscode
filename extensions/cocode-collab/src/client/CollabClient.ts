import * as vscode from 'vscode';
import { customAlphabet } from 'nanoid';
import { CrdtBridge, BridgeOptions } from './CrdtBridge.js';
import { Presence } from './Presence.js';
import { FsSync } from './FsSync.js';

export type SessionMode = 'host' | 'join';

const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);

export class CollabClient {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly bridge: CrdtBridge;
  private presence: Presence | null = null;
  private fsSync: FsSync | null = null;
  private mode: SessionMode;
  private started = false;

  constructor(private readonly context: vscode.ExtensionContext, mode: SessionMode) {
    this.mode = mode;
    this.bridge = new CrdtBridge();
  }

  async start() {
    if (this.started) {
      return;
    }

    const configuration = vscode.workspace.getConfiguration('cocode.collab');
    const serverUrl = configuration.get<string>('serverUrl') ?? 'ws://localhost:3001';
    const username = this.resolveUsername(configuration.get<string>('username') ?? '');

    let room = configuration.get<string>('room')?.trim() ?? '';
    if (!room) {
      if (this.mode === 'host') {
        room = await this.generateRoomId();
        const accept = await vscode.window.showInputBox({
          title: 'cocode session id',
          prompt: 'Share this ID with collaborators or provide a custom value.',
          value: room
        });
        if (!accept) {
          vscode.window.showInformationMessage('Collaboration session cancelled.');
          return;
        }
        room = accept.trim();
      } else {
        const joinId = await vscode.window.showInputBox({
          title: 'Join cocode session',
          prompt: 'Enter the session ID shared by the host.',
          validateInput: (value) => (value.trim().length === 0 ? 'Enter a session ID.' : undefined)
        });
        if (!joinId) {
          vscode.window.showInformationMessage('Join request cancelled.');
          return;
        }
        room = joinId.trim();
      }
    }

    const options: BridgeOptions = {
      serverUrl,
      username,
      room,
      bootstrap: this.mode === 'host'
    };

    await this.bridge.connect(options);

    vscode.workspace.textDocuments.forEach((doc) => this.bridge.bindDocument(doc));

    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((doc) => this.bridge.bindDocument(doc)),
      vscode.workspace.onDidCloseTextDocument((doc) => this.bridge.unbindDocument(doc.uri)),
      vscode.workspace.onDidChangeTextDocument((event) => this.bridge.handleLocalChange(event))
    );

    this.presence = new Presence(this.bridge, username);
    this.presence.initialize();
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((event) => this.presence?.handleSelectionChange(event)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.presence?.render())
    );
    this.presence.syncEditor(vscode.window.activeTextEditor);

    this.fsSync = new FsSync(this.bridge);
    await this.fsSync.initialize();

    this.started = true;
    vscode.window.showInformationMessage(`Connected to cocode session ${room}.`);
  }

  async showStatus() {
    const status = this.bridge.getStatus();
    const lines: string[] = [
      `Server: ${status.serverUrl}`,
      `Room: ${status.room ?? 'n/a'}`,
      `Client ID: ${status.clientId ?? 'pending'}`,
      `Peers: ${status.peers}`,
      `Last local change: ${status.lastLocalChange?.toLocaleTimeString() ?? 'none'}`,
      `Last remote change: ${status.lastRemoteChange?.toLocaleTimeString() ?? 'none'}`,
      `Connected: ${status.connected ? 'yes' : 'no'}`
    ];
    await vscode.window.showInformationMessage(lines.join('\n'), { modal: true });
  }

  async dispose() {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.presence?.dispose();
    this.fsSync?.dispose();
    this.bridge.dispose();
    this.disposables.forEach((d) => d.dispose());
    this.disposables.length = 0;
  }

  private resolveUsername(configured: string): string {
    if (configured.trim().length > 0) {
      return configured.trim();
    }
    if (typeof navigator !== 'undefined' && (navigator as any).userAgent) {
      return 'guest-' + nanoid();
    }
    if (typeof process !== 'undefined' && process.env.USER) {
      return process.env.USER;
    }
    return 'guest-' + nanoid();
  }

  private async generateRoomId() {
    return nanoid();
  }
}
