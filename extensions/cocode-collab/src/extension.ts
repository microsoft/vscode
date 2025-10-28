import * as vscode from 'vscode';
import { CollabClient } from './client/CollabClient.js';
import { scaffoldTasks } from './scaffoldTasks.js';

let client: CollabClient | null = null;

export async function activate(context: vscode.ExtensionContext) {
  const start = vscode.commands.registerCommand('cocode.collab.start', async () => {
    await ensureDisposed();
    client = new CollabClient(context, 'host');
    await client.start();
  });

  const join = vscode.commands.registerCommand('cocode.collab.join', async () => {
    await ensureDisposed();
    client = new CollabClient(context, 'join');
    await client.start();
  });

  const leave = vscode.commands.registerCommand('cocode.collab.leave', async () => {
    await ensureDisposed();
    vscode.window.showInformationMessage('Left collaboration session.');
  });

  const status = vscode.commands.registerCommand('cocode.collab.status', async () => {
    if (!client) {
      vscode.window.showInformationMessage('Not connected to a collaboration session.');
      return;
    }
    await client.showStatus();
  });

  const scaffold = vscode.commands.registerCommand('cocode.scaffold.tasks', scaffoldTasks);

  context.subscriptions.push(start, join, leave, status, scaffold);
}

export function deactivate() {
  void ensureDisposed();
}

async function ensureDisposed() {
  if (client) {
    await client.dispose();
    client = null;
  }
}
