import * as vscode from 'vscode';
import { ChatPanel } from './ui/panel';

const disposables: vscode.Disposable[] = [];

export function activate(context: vscode.ExtensionContext): void {
    const commandDisposable = vscode.commands.registerCommand('fancyChat.openPanel', () => {
        ChatPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(commandDisposable);
    disposables.push(commandDisposable);
}

export function deactivate(): void {
    while (disposables.length) {
        const disposable = disposables.pop();
        disposable?.dispose();
    }
}
