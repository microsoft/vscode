import * as vscode from 'vscode';
import { ChatPanelProvider } from './chatPanel';
import { PlatformBrowserProvider } from './platformPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Nexora Core extension is now active!');

    // Register Chat Panel
    const chatProvider = new ChatPanelProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('nexora.chatPanel', chatProvider)
    );

    // Register Platform Browser
    const platformProvider = new PlatformBrowserProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('nexora.platformBrowser', platformProvider)
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('nexora.openChat', () => {
            vscode.commands.executeCommand('nexora.chatPanel.focus');
        }),
        vscode.commands.registerCommand('nexora.refreshPlatforms', () => {
            platformProvider.refresh();
            vscode.window.showInformationMessage('Platforms refreshed!');
        })
    );

    vscode.window.showInformationMessage('🚀 Nexora AI Orchestration System activated!');
}

export function deactivate() {
    console.log('Nexora Core extension deactivated');
}
