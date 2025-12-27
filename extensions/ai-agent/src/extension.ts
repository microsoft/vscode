/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Code Ship Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

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

/**
 * Code Ship AI Agent Extension
 * This extension provides the core AI capabilities for Code Ship IDE
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('[Code Ship] AI Agent extension activating...');

    // Check for Internal API availability
    const aiAgent = (vscode as any).aiAgent as IExtHostAIAgent | undefined;

    if (!aiAgent) {
        console.warn('[Code Ship] Internal API not available. Running in limited mode.');
        vscode.window.showWarningMessage(
            'Code Ship AI Agent: Running in limited mode. Some features require the Code Ship custom build.'
        );
        // Still register basic commands for standard VS Code
        registerBasicCommands(context);
        return;
    }

    console.log('[Code Ship] Internal API detected. Full functionality enabled.');

    // Register commands
    registerCommands(context, aiAgent);

    // Setup command interception demo
    setupCommandInterception(context, aiAgent);

    console.log('[Code Ship] AI Agent extension activated successfully.');
}

/**
 * Register basic commands (works in standard VS Code)
 */
function registerBasicCommands(context: vscode.ExtensionContext) {
    const helloWorldCmd = vscode.commands.registerCommand('codeShip.helloWorld', () => {
        vscode.window.showInformationMessage('Hello from Code Ship AI Agent! (Limited Mode)');
    });

    context.subscriptions.push(helloWorldCmd);
}

/**
 * Register full commands with Internal API access
 */
function registerCommands(context: vscode.ExtensionContext, aiAgent: IExtHostAIAgent) {
    // Hello World command
    const helloWorldCmd = vscode.commands.registerCommand('codeShip.helloWorld', async () => {
        vscode.window.showInformationMessage(
            'Hello from Code Ship AI Agent! Internal API is available.'
        );

        // Demo: Request overlay access
        try {
            const overlay = await aiAgent.requestOverlayAccess();
            vscode.window.showInformationMessage(`Overlay created with ID: ${overlay.id}`);

            // Clean up after 5 seconds
            setTimeout(() => {
                overlay.dispose();
                console.log('[Code Ship] Demo overlay disposed');
            }, 5000);
        } catch (err) {
            console.error('[Code Ship] Failed to create overlay:', err);
        }
    });

    // Test Intercept command
    const testInterceptCmd = vscode.commands.registerCommand('codeShip.testIntercept', () => {
        vscode.window.showInformationMessage(
            'Command interception is active. Try saving a file to see the AI review prompt.'
        );
    });

    context.subscriptions.push(helloWorldCmd, testInterceptCmd);
}

/**
 * Setup command interception for AI review features
 */
function setupCommandInterception(context: vscode.ExtensionContext, aiAgent: IExtHostAIAgent) {
    // Intercept file save command
    const saveInterceptor = aiAgent.interceptCommand(
        'workbench.action.files.save',
        async (args: any[]) => {
            // Show AI review prompt before save
            const result = await vscode.window.showInformationMessage(
                '[Code Ship AI] Review before save?',
                { modal: false },
                'Save',
                'Review First'
            );

            if (result === 'Review First') {
                vscode.window.showInformationMessage(
                    '[Code Ship AI] AI review would happen here. Proceeding with save...'
                );
            }

            // Always allow save to proceed for now
            return true;
        }
    );

    // Subscribe to native events
    const nativeEventSubscription = aiAgent.onNativeEvent((event) => {
        // Log native events for debugging
        console.log('[Code Ship] Native event:', event.type);
    });

    context.subscriptions.push(saveInterceptor, nativeEventSubscription);
}

export function deactivate() {
    console.log('[Code Ship] AI Agent extension deactivated.');
}
