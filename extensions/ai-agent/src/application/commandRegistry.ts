/**
 * Command Registry
 * Centralized command registration and management
 */

import * as vscode from 'vscode';
import { AgentController } from './agentController';

/**
 * Command handler type
 */
type CommandHandler = (...args: any[]) => any;

/**
 * Registered command info
 */
interface RegisteredCommand {
    id: string;
    handler: CommandHandler;
    disposable: vscode.Disposable;
}

/**
 * Internal API interface (for interceptCommand)
 */
interface IExtHostAIAgent {
    interceptCommand(commandId: string, handler: (args: any[]) => Promise<boolean>): vscode.Disposable;
    requestOverlayAccess(): Promise<any>;
    readonly onNativeEvent: vscode.Event<any>;
}

/**
 * CommandRegistry class
 * Manages VS Code command registration and interception
 */
export class CommandRegistry implements vscode.Disposable {
    private readonly commands: Map<string, RegisteredCommand> = new Map();
    private readonly disposables: vscode.Disposable[] = [];
    private readonly controller: AgentController;
    private readonly internalApi: IExtHostAIAgent | undefined;

    constructor(controller: AgentController, internalApi?: IExtHostAIAgent) {
        this.controller = controller;
        this.internalApi = internalApi;
    }

    /**
     * Register all Code Ship commands
     */
    registerAllCommands(): void {
        // Main commands
        this.registerCommand('codeShip.openChat', () => this.openChatPanel());
        this.registerCommand('codeShip.sendMessage', (message: string) => this.sendMessage(message));
        this.registerCommand('codeShip.switchPhase', (phase: string) => this.switchPhase(phase));
        this.registerCommand('codeShip.cancel', () => this.cancel());
        this.registerCommand('codeShip.clearHistory', () => this.clearHistory());
        this.registerCommand('codeShip.checkDependencies', () => this.checkDependencies());

        // Setup command interception if internal API available
        if (this.internalApi) {
            this.setupInterception();
        }
    }

    /**
     * Register a command
     * @param id Command ID
     * @param handler Command handler
     */
    registerCommand(id: string, handler: CommandHandler): void {
        if (this.commands.has(id)) {
            console.warn(`[Code Ship] Command ${id} already registered`);
            return;
        }

        const disposable = vscode.commands.registerCommand(id, handler);
        this.commands.set(id, { id, handler, disposable });
        this.disposables.push(disposable);
    }

    /**
     * Unregister a command
     * @param id Command ID
     */
    unregisterCommand(id: string): void {
        const command = this.commands.get(id);
        if (command) {
            command.disposable.dispose();
            this.commands.delete(id);
        }
    }

    /**
     * Setup command interception using Internal API
     */
    private setupInterception(): void {
        if (!this.internalApi) return;

        // Intercept file save for AI review
        const saveInterceptor = this.internalApi.interceptCommand(
            'workbench.action.files.save',
            async (args) => {
                // Get configuration
                const config = vscode.workspace.getConfiguration('codeShip');
                const reviewOnSave = config.get<boolean>('reviewOnSave', false);

                if (!reviewOnSave) {
                    return true; // Allow save without review
                }

                const result = await vscode.window.showInformationMessage(
                    '[Code Ship] Run AI review before save?',
                    { modal: false },
                    'Save',
                    'Review First'
                );

                if (result === 'Review First') {
                    // Trigger AI review
                    await vscode.commands.executeCommand('codeShip.reviewCurrentFile');
                }

                return true; // Always allow save after user decision
            }
        );

        this.disposables.push(saveInterceptor);

        // Intercept git commit for AI review
        const commitInterceptor = this.internalApi.interceptCommand(
            'git.commit',
            async (args) => {
                const config = vscode.workspace.getConfiguration('codeShip');
                const reviewOnCommit = config.get<boolean>('reviewOnCommit', false);

                if (!reviewOnCommit) {
                    return true;
                }

                const result = await vscode.window.showInformationMessage(
                    '[Code Ship] Run AI review before commit?',
                    { modal: false },
                    'Commit',
                    'Review First'
                );

                if (result === 'Review First') {
                    await vscode.commands.executeCommand('codeShip.reviewStagedChanges');
                }

                return true;
            }
        );

        this.disposables.push(commitInterceptor);
    }

    /**
     * Open the chat panel
     */
    private async openChatPanel(): Promise<void> {
        await vscode.commands.executeCommand('codeShip.showChatView');
    }

    /**
     * Send a message to the AI
     */
    private async sendMessage(message: string): Promise<void> {
        await this.controller.sendMessage(message);
    }

    /**
     * Switch development phase
     */
    private async switchPhase(phase: string): Promise<void> {
        if (['design', 'implementation', 'review'].includes(phase)) {
            await this.controller.switchPhase(phase as 'design' | 'implementation' | 'review');
            vscode.window.showInformationMessage(`[Code Ship] Switched to ${phase} phase`);
        } else {
            vscode.window.showErrorMessage(`[Code Ship] Invalid phase: ${phase}`);
        }
    }

    /**
     * Cancel current operation
     */
    private async cancel(): Promise<void> {
        await this.controller.cancel();
        vscode.window.showInformationMessage('[Code Ship] Operation cancelled');
    }

    /**
     * Clear chat history with confirmation dialog
     */
    private async clearHistory(): Promise<void> {
        const result = await vscode.window.showWarningMessage(
            'Are you sure you want to clear all chat history? This action cannot be undone.',
            { modal: true },
            'Clear'
        );

        if (result === 'Clear') {
            this.controller.clearHistory();
            vscode.window.showInformationMessage('[Code Ship] Chat history cleared');
        }
    }

    /**
     * Check CLI dependencies
     */
    private async checkDependencies(): Promise<void> {
        const { DependencyManager } = await import('../domain/dependency/dependencyManager');
        const manager = new DependencyManager();
        const report = await manager.generateReport();

        const outputChannel = vscode.window.createOutputChannel('Code Ship Dependencies');
        outputChannel.appendLine(report);
        outputChannel.show();
    }

    /**
     * Get registered command IDs
     */
    getRegisteredCommands(): string[] {
        return Array.from(this.commands.keys());
    }

    /**
     * Dispose of all commands
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.commands.clear();
    }
}
