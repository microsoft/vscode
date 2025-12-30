/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Code Ship Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, IDisposable } from '../../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IAIAgentCommandInterceptor } from '../common/aiAgentCommandInterceptor.js';

/**
 * Command interceptor handler function.
 * Returns true to allow the command, false to block it.
 */
export type CommandInterceptorHandler = (commandId: string, args: any[]) => Promise<boolean>;

/**
 * AI Agent Command Interceptor Service
 *
 * This service manages command interception for the AI Agent system.
 * It is registered as a singleton and can be used by:
 * - CommandService: to check if commands should be allowed
 * - MainThreadAIAgent: to register/unregister interceptors from ExtHost
 *
 * Phase 3.2: Command Interception Integration
 */
export class AIAgentCommandInterceptorService extends Disposable implements IAIAgentCommandInterceptor {

	declare readonly _serviceBrand: undefined;

	private readonly _interceptors = new DisposableMap<string>();
	private readonly _handlers = new Map<string, CommandInterceptorHandler>();

	constructor(
		@ILogService private readonly _logService: ILogService
	) {
		super();
	}

	/**
	 * Check if a command should be allowed to execute.
	 * If no interceptor is registered for the command, it is allowed.
	 */
	async shouldAllowCommand(commandId: string, args: any[]): Promise<boolean> {
		const handler = this._handlers.get(commandId);
		if (!handler) {
			// No interceptor registered for this command, allow it
			return true;
		}

		try {
			const allowed = await handler(commandId, args);
			if (!allowed) {
				this._logService.trace('AIAgentCommandInterceptorService', `Command '${commandId}' blocked by interceptor`);
			}
			return allowed;
		} catch (err) {
			// On error, allow the command to proceed (fail-open)
			this._logService.warn('AIAgentCommandInterceptorService', `Interceptor error for '${commandId}':`, err);
			return true;
		}
	}

	/**
	 * Register a command interceptor with a handler.
	 * @param commandId The command ID to intercept
	 * @param handler The handler function that decides if the command should be allowed
	 * @returns A disposable that unregisters the interceptor
	 */
	registerInterceptor(commandId: string, handler: CommandInterceptorHandler): IDisposable {
		if (this._interceptors.has(commandId)) {
			this._logService.warn('AIAgentCommandInterceptorService', `Interceptor for ${commandId} already registered, replacing`);
			this._interceptors.deleteAndDispose(commandId);
		}

		this._handlers.set(commandId, handler);
		this._logService.trace('AIAgentCommandInterceptorService', `Interceptor registered for ${commandId}`);

		const disposable: IDisposable = {
			dispose: () => {
				this._handlers.delete(commandId);
				this._logService.trace('AIAgentCommandInterceptorService', `Interceptor unregistered for ${commandId}`);
			}
		};

		this._interceptors.set(commandId, disposable);
		return disposable;
	}

	/**
	 * Unregister a command interceptor.
	 * @param commandId The command ID to stop intercepting
	 */
	unregisterInterceptor(commandId: string): void {
		if (!this._interceptors.has(commandId)) {
			this._logService.warn('AIAgentCommandInterceptorService', `No interceptor found for ${commandId}`);
			return;
		}

		this._interceptors.deleteAndDispose(commandId);
	}

	/**
	 * Check if an interceptor is registered for a command.
	 */
	hasInterceptor(commandId: string): boolean {
		return this._interceptors.has(commandId);
	}

	/**
	 * Get all intercepted command IDs (for debugging).
	 */
	getInterceptedCommands(): string[] {
		return Array.from(this._interceptors.keys());
	}

	override dispose(): void {
		this._handlers.clear();
		super.dispose();
	}
}

// Register as singleton service
registerSingleton(IAIAgentCommandInterceptor, AIAgentCommandInterceptorService, InstantiationType.Delayed);
