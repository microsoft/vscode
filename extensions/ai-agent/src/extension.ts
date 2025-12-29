/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Code Ship Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { AgentController } from './application/agentController';
import { CommandRegistry } from './application/commandRegistry';
import { WebviewProvider } from './presentation/webview/webviewProvider';
import { DependencyManager } from './domain/dependency/dependencyManager';

// Type definition for Internal API (matches extHostAIAgent.ts)
interface IExtHostAIAgent {
    interceptCommand(commandId: string, handler: (args: any[]) => Promise<boolean>): vscode.Disposable;
    requestOverlayAccess(): Promise<{
        id: string;
        updatePosition(line: number, column: number): void;
        updateContent(html: string): void;
        dispose(): void;
    }>;
    readonly onNativeEvent: vscode.Event<{ type: string; [key: string]: any }>;
}

// Extend vscode namespace type
declare module 'vscode' {
    export const aiAgent: IExtHostAIAgent | undefined;
}

// Extension state
let agentController: AgentController | undefined;
let commandRegistry: CommandRegistry | undefined;
let webviewProvider: WebviewProvider | undefined;

/**
 * Code Ship AI Agent Extension
 * This extension provides the core AI capabilities for Code Ship IDE
 */
export async function activate(context: vscode.ExtensionContext) {
    console.log('[Code Ship] AI Agent extension activating...');

    // Check for Internal API availability
    const aiAgent = (vscode as any).aiAgent as IExtHostAIAgent | undefined;

    if (!aiAgent) {
        console.warn('[Code Ship] Internal API not available. Running in limited mode.');
    } else {
        console.log('[Code Ship] Internal API detected. Full functionality enabled.');
    }

    // Get state file path from workspace
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const statePath = workspaceFolder
        ? vscode.Uri.joinPath(workspaceFolder.uri, '.codeship', 'state.json').fsPath
        : undefined;

    // Initialize AgentController
    agentController = new AgentController({
        statePath
    });

    // Initialize controller
    try {
        await agentController.initialize();
    } catch (error) {
        console.error('[Code Ship] Failed to initialize AgentController:', error);
    }

    // Initialize CommandRegistry with Internal API if available
    commandRegistry = new CommandRegistry(agentController, aiAgent);
    commandRegistry.registerAllCommands();

    // Initialize WebviewProvider
    webviewProvider = new WebviewProvider({
        extensionUri: context.extensionUri,
        controller: agentController
    });

    // Register webview view provider (for sidebar)
    const webviewViewRegistration = vscode.window.registerWebviewViewProvider(
        WebviewProvider.viewType,
        webviewProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );

    // Register command to show chat panel
    const showChatViewCmd = vscode.commands.registerCommand('codeShip.showChatView', () => {
        webviewProvider?.showPanel();
    });

    // Register command to focus chat view
    const focusChatCmd = vscode.commands.registerCommand('codeShip.focusChat', async () => {
        await vscode.commands.executeCommand('codeShip.chatView.focus');
    });

    // Register command to toggle history panel
    const showHistoryCmd = vscode.commands.registerCommand('codeShip.showHistory', () => {
        // Send sessions list first to ensure data is available
        agentController?.sendSessions();
        // Then toggle the history panel
        webviewProvider?.postMessage({ type: 'toggle-history' });
    });

    // Register command to create new chat session
    const newChatCmd = vscode.commands.registerCommand('codeShip.newChat', async () => {
        await agentController?.createSession();
    });

    // Set initial context for welcome view (based on chat history)
    const hasMessages = agentController.chatHistory.length > 0;
    await vscode.commands.executeCommand('setContext', 'codeShip.noMessages', !hasMessages);

    // Update context when messages are added
    agentController.onMessage(() => {
        vscode.commands.executeCommand('setContext', 'codeShip.noMessages', false);
    });

    // Add to subscriptions
    context.subscriptions.push(
        webviewViewRegistration,
        showChatViewCmd,
        focusChatCmd,
        showHistoryCmd,
        newChatCmd,
        { dispose: () => agentController?.dispose() },
        { dispose: () => commandRegistry?.dispose() },
        { dispose: () => webviewProvider?.dispose() }
    );

    // Focus chat view on startup (after a short delay to ensure view is ready)
    setTimeout(async () => {
        try {
            await vscode.commands.executeCommand('codeShip.chatView.focus');
        } catch (error) {
            console.log('[Code Ship] Could not focus chat view:', error);
        }
    }, 500);

    // Check dependencies after activation completes (non-blocking)
    // This allows webview resources to load without being blocked by the dependency dialog
    setTimeout(() => {
        checkDependencies().catch(err => {
            console.error('[Code Ship] Dependency check failed:', err);
        });
    }, 2000);

    console.log('[Code Ship] AI Agent extension activated successfully.');
}

/**
 * Check CLI dependencies and show warning if missing
 */
async function checkDependencies(): Promise<void> {
    const manager = new DependencyManager();
    const missing = await manager.getMissingDependencies();

    if (missing.length > 0) {
        const missingNames = missing.map(m => m.cli).join(', ');
        const message = `Code Ship: Missing CLI dependencies: ${missingNames}`;

        const action = await vscode.window.showWarningMessage(
            message,
            'View Details',
            'Dismiss'
        );

        if (action === 'View Details') {
            const report = await manager.generateReport();
            const outputChannel = vscode.window.createOutputChannel('Code Ship Dependencies');
            outputChannel.appendLine(report);
            outputChannel.show();
        }
    }
}

export function deactivate() {
    console.log('[Code Ship] AI Agent extension deactivating...');

    // Cleanup is handled by subscriptions
    agentController = undefined;
    commandRegistry = undefined;
    webviewProvider = undefined;

    console.log('[Code Ship] AI Agent extension deactivated.');
}
