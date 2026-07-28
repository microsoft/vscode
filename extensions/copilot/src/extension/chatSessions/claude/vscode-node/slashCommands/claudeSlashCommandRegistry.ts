/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CancellationToken } from 'vscode';

/**
 * Interface for Claude slash command handlers.
 *
 * Implement this interface to create a new slash command for the Claude chat participant.
 * Register handlers using `registerClaudeSlashCommand()`.
 */
export interface IClaudeSlashCommandHandler {
	/**
	 * The command name without the leading slash (e.g., "hooks" for /hooks)
	 */
	readonly commandName: string;

	/**
	 * Human-readable description of what this command does
	 */
	readonly description: string;

	/**
	 * Optional VS Code command ID for Command Palette registration.
	 * If provided, the command will be registered as a VS Code command
	 * and can be invoked via the Command Palette.
	 *
	 * @example "copilot.claude.hooks"
	 */
	readonly commandId?: string;

	/**
	 * Handle the slash command.
	 *
	 * @param args - Arguments passed after the command name
	 * @param stream - Response stream for sending messages to the chat (undefined when invoked from Command Palette)
	 * @param token - Cancellation token
	 * @returns Chat result or void
	 */
	handle(
		args: string,
		stream: vscode.ChatResponseStream | undefined,
		token: CancellationToken
	): Promise<vscode.ChatResult | void>;
}

/**
 * Constructor type for slash command handlers.
 * Handlers are instantiated via the instantiation service for dependency injection.
 */
export interface IClaudeSlashCommandHandlerCtor {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	new(...args: any[]): IClaudeSlashCommandHandler;
}

// Registry of slash command handler constructors
const handlerRegistry: IClaudeSlashCommandHandlerCtor[] = [];

/**
 * Register a slash command handler.
 * Call this at module load time to register your handler.
 *
 * ## Adding a new slash command
 *
 * 1. Create a handler class implementing `IClaudeSlashCommandHandler`
 * 2. Call `registerClaudeSlashCommand(YourHandler)` at module load time
 * 3. Import it in `slashCommands/index.ts`
 * 4. Add entries to `package.json`:
 *    - Under `contributes.commands`: Add the VS Code command (e.g., `copilot.claude.mycommand`)
 *    - Under `contributes.chatSessions[type="claude-code"].commands`: Add the slash command name and description
 *
 * @param ctor - The handler constructor class
 *
 * @example
 * ```typescript
 * export class MyCommand implements IClaudeSlashCommandHandler {
 *     readonly commandName = 'mycommand';
 *     readonly description = 'Does something useful';
 *     readonly commandId = 'copilot.claude.mycommand'; // For Command Palette
 *
 *     async handle(args: string, stream: vscode.ChatResponseStream, token: CancellationToken) {
 *         stream.markdown('Hello!');
 *         return {};
 *     }
 * }
 *
 * registerClaudeSlashCommand(MyCommand);
 * ```
 */
export function registerClaudeSlashCommand(ctor: IClaudeSlashCommandHandlerCtor): void {
	handlerRegistry.push(ctor);
}

/**
 * Get all registered slash command handler constructors.
 * Used by ClaudeSlashCommandService to instantiate handlers.
 */
export function getClaudeSlashCommandRegistry(): readonly IClaudeSlashCommandHandlerCtor[] {
	return handlerRegistry;
}
