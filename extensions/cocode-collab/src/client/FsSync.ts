import * as vscode from 'vscode';
import { CrdtBridge } from './CrdtBridge.js';
import { FsOperation } from '../types/messages.js';

export class FsSync {
  private applyingRemote = false;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly bridge: CrdtBridge) {}

  async initialize() {
    this.disposables.push(
      vscode.workspace.onDidCreateFiles((event) => {
        if (this.applyingRemote) {
          return;
        }
        for (const file of event.files) {
          this.bridge.sendFs({ type: 'fs', op: 'create', uri: file.toString() });
        }
      }),
      vscode.workspace.onDidDeleteFiles((event) => {
        if (this.applyingRemote) {
          return;
        }
        for (const file of event.files) {
          this.bridge.sendFs({ type: 'fs', op: 'delete', uri: file.toString() });
        }
      }),
      vscode.workspace.onDidRenameFiles((event) => {
        if (this.applyingRemote) {
          return;
        }
        for (const file of event.files) {
          this.bridge.sendFs({ type: 'fs', op: 'rename', uri: file.newUri.toString(), from: file.oldUri.toString() });
        }
      }),
      this.bridge.onFs((operation) => {
        void this.applyRemote(operation);
      })
    );
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables.length = 0;
  }

  private async applyRemote(operation: FsOperation) {
    this.applyingRemote = true;
    try {
      if (operation.op === 'create') {
        const uri = vscode.Uri.parse(operation.uri);
        if (uri.scheme !== 'file') {
          return;
        }
        await this.ensureDir(uri);
        try {
          await vscode.workspace.fs.stat(uri);
        } catch {
          await vscode.workspace.fs.writeFile(uri, new Uint8Array());
        }
      } else if (operation.op === 'delete') {
        const uri = vscode.Uri.parse(operation.uri);
        if (uri.scheme !== 'file') {
          return;
        }
        try {
          await vscode.workspace.fs.delete(uri, { recursive: true });
        } catch (error) {
          console.warn('Failed to delete remote file', error);
        }
      } else if (operation.op === 'rename') {
        const uri = vscode.Uri.parse(operation.uri);
        const from = vscode.Uri.parse(operation.from);
        if (uri.scheme !== 'file' || from.scheme !== 'file') {
          return;
        }
        await this.ensureDir(uri);
        try {
          await vscode.workspace.fs.rename(from, uri, { overwrite: false });
        } catch (error) {
          console.warn('Failed to rename remote file', error);
        }
      }
    } finally {
      this.applyingRemote = false;
    }
  }

  private async ensureDir(uri: vscode.Uri) {
    const parts = uri.path.split('/');
    parts.pop();
    if (parts.length === 0) {
      return;
    }
    const path = parts.join('/') || '/';
    const dirUri = uri.with({ path, query: '', fragment: '' });
    try {
      await vscode.workspace.fs.stat(dirUri);
    } catch {
      await vscode.workspace.fs.createDirectory(dirUri);
    }
  }
}
