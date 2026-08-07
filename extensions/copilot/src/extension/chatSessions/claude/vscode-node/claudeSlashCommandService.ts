/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';
import { createDecorator, IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { getClaudeSlashCommandRegistry, IClaudeSlashCommandHandler } from './slashCommands/claudeSlashCommandRegistry';

export interface IClaudeSlashCommandRequest {
	readonly prompt: string;
	readonly command: string | undefined;
}

// Import all slash command handlers to trigger self-registration
import './slashCommands/index';

export interface IClaudeSlashCommandResult {
	handled: boolean;
	result?: vscode.ChatResult;
}

export interface IClaudeSlashCommandService {
	readonly _serviceBrand: undefined;

	/**
	 * Try to handle a slash command from the user's request.
	 *
	 * Checks `request.command` first (VS Code slash command), then falls back to
	 * parsing a `/command` pattern from `request.prompt`.
	 *
	 * @param request - The user's request containing prompt and optional command
	 * @param stream - Response stream for sending messages to the chat
	 * @param token - Cancellation token
	 * @returns Object indicating whether the command was handled and the result
	 */
	tryHandleCommand(
		request: IClaudeSlashCommandRequest,
		stream: vscode.ChatResponseStream,
		token: CancellationToken
	): Promise<IClaudeSlashCommandResult>;

	/**
	 * Get all registered command names.
	 */
	getRegisteredCommands(): readonly string[];
}

export const IClaudeSlashCommandService = createDecorator<IClaudeSlashCommandService>('claudeSlashCommandService');

export class ClaudeSlashCommandService extends Disposable implements IClaudeSlashCommandService {
	readonly _serviceBrand: undefined;

	private _handlerCache = new Map<string, IClaudeSlashCommandHandler>();
	private _initialized = false;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		// Initialize eagerly to register VS Code commands at startup
		this._ensureInitialized();
	}

	async tryHandleCommand(
		request: IClaudeSlashCommandRequest,
		stream: vscode.ChatResponseStream,
		token: CancellationToken
	): Promise<IClaudeSlashCommandResult> {
		// 1. Check request.command (VS Code slash command selected via UI)
		if (request.command) {
			const handler = this._getHandler(request.command.toLowerCase());
			if (handler) {
				const result = await handler.handle(request.prompt, stream, token);
				return { handled: true, result: result ?? {} };
			}
		}

		// 2. Fall back to parsing /command from the prompt text
		const match = request.prompt.trim().match(/^\/(\w+)(?:\s+(.*))?$/);
		if (!match) {
			return { handled: false };
		}

		const [, commandName, args] = match;
		const handler = this._getHandler(commandName.toLowerCase());
		if (!handler) {
			return { handled: false };
		}

		const result = await handler.handle(args ?? '', stream, token);
		return { handled: true, result: result ?? {} };
	}

	getRegisteredCommands(): readonly string[] {
		this._ensureInitialized();
		return Array.from(this._handlerCache.keys());
	}

	private _getHandler(commandName: string): IClaudeSlashCommandHandler | undefined {
		this._ensureInitialized();
		return this._handlerCache.get(commandName);
	}

	private _ensureInitialized(): void {
		if (this._initialized) {
			return;
		}

		// Instantiate all registered handlers and cache them by command name
		const ctors = getClaudeSlashCommandRegistry();
		for (const ctor of ctors) {
			const handler = this.instantiationService.createInstance(ctor);
			const commandKey = handler.commandName.toLowerCase();
			// This shouldn't happen unless we accidentally register duplicates
			if (this._handlerCache.has(commandKey)) {
				this.logService.warn(`Duplicate Claude slash command name "${handler.commandName}" detected. Ignoring handler ${ctor.name || 'unknown constructor'}.`);
				continue;
			}
			this._handlerCache.set(commandKey, handler);

			// Register VS Code command if commandId is provided
			if (handler.commandId) {
				this._register(vscode.commands.registerCommand(handler.commandId, () => {
					// Invoke with no args and no stream (Command Palette mode)
					return handler.handle('', undefined, CancellationToken.None);
				}));
			}
		}

		this._initialized = true;
	}
}
