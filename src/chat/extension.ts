import * as vscode from 'vscode';
import { ChatPanel } from './ui/panel';

export function activate(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('fancyChat.openPanel', () => {
        ChatPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);
}

export function deactivate(): void {
    // Nothing to clean up explicitly; disposables are handled by VS Code
}
