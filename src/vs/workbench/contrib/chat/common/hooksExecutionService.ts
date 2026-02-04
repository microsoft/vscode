/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { URI } from '../../../../base/common/uri.js';
import { HookTypeValue, IChatRequestHooks, IHookCommand } from './promptSyntax/hookSchema.js';
import { IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Extensions, IOutputChannelRegistry, IOutputService } from '../../../services/output/common/output.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { localize } from '../../../../nls.js';

export const hooksOutputChannelId = 'hooksExecution';
const hooksOutputChannelLabel = localize('hooksExecutionChannel', "Hooks");

export const enum HookResultKind {
	Success = 1,
	Error = 2
}

export interface IHookResult {
	readonly kind: HookResultKind;
	readonly result: string | object;
}

export interface IHooksExecutionOptions {
	readonly input?: unknown;
	readonly token?: CancellationToken;
}

/**
 * Callback interface for hook execution proxies.
 * MainThreadHooks implements this to forward calls to the extension host.
 */
export interface IHooksExecutionProxy {
	runHookCommand(hookCommand: IHookCommand, input: unknown, token: CancellationToken): Promise<IHookResult>;
}

export const IHooksExecutionService = createDecorator<IHooksExecutionService>('hooksExecutionService');

export interface IHooksExecutionService {
	_serviceBrand: undefined;

	/**
	 * Called by mainThreadHooks when extension host is ready
	 */
	setProxy(proxy: IHooksExecutionProxy): void;

	/**
	 * Register hooks for a session. Returns a disposable that unregisters them.
	 */
	registerHooks(sessionResource: URI, hooks: IChatRequestHooks): IDisposable;

	/**
	 * Get hooks registered for a session.
	 */
	getHooksForSession(sessionResource: URI): IChatRequestHooks | undefined;

	/**
	 * Execute hooks of the given type for the given session
	 */
	executeHook(hookType: HookTypeValue, sessionResource: URI, options?: IHooksExecutionOptions): Promise<IHookResult[]>;
}

export class HooksExecutionService implements IHooksExecutionService {
	declare readonly _serviceBrand: undefined;

	private _proxy: IHooksExecutionProxy | undefined;
	private readonly _sessionHooks = new Map<string, IChatRequestHooks>();
	private _channelRegistered = false;
	private _requestCounter = 0;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@IOutputService private readonly _outputService: IOutputService,
	) { }

	setProxy(proxy: IHooksExecutionProxy): void {
		this._proxy = proxy;
	}

	private _ensureOutputChannel(): void {
		if (this._channelRegistered) {
			return;
		}
		Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels).registerChannel({
			id: hooksOutputChannelId,
			label: hooksOutputChannelLabel,
			log: false
		});
		this._channelRegistered = true;
	}

	private _log(requestId: number, hookType: HookTypeValue, message: string): void {
		this._ensureOutputChannel();
		const channel = this._outputService.getChannel(hooksOutputChannelId);
		if (channel) {
			channel.append(`[${new Date().toISOString()}] [#${requestId}] [${hookType}] ${message}\n`);
		}
	}

	registerHooks(sessionResource: URI, hooks: IChatRequestHooks): IDisposable {
		const key = sessionResource.toString();
		this._sessionHooks.set(key, hooks);
		return toDisposable(() => {
			this._sessionHooks.delete(key);
		});
	}

	getHooksForSession(sessionResource: URI): IChatRequestHooks | undefined {
		return this._sessionHooks.get(sessionResource.toString());
	}

	async executeHook(hookType: HookTypeValue, sessionResource: URI, options?: IHooksExecutionOptions): Promise<IHookResult[]> {
		if (!this._proxy) {
			return [];
		}

		const hooks = this.getHooksForSession(sessionResource);
		if (!hooks) {
			return [];
		}

		const hookCommands = hooks[hookType];
		if (!hookCommands || hookCommands.length === 0) {
			return [];
		}

		const requestId = this._requestCounter++;

		this._logService.debug(`[HooksExecutionService] Executing ${hookCommands.length} hook(s) for type '${hookType}'`);
		this._log(requestId, hookType, `Executing ${hookCommands.length} hook(s)`);

		const results: IHookResult[] = [];
		const token = options?.token ?? CancellationToken.None;
		for (const hookCommand of hookCommands) {
			const hookCommandJson = JSON.stringify({
				...hookCommand,
				cwd: hookCommand.cwd?.fsPath
			});
			this._log(requestId, hookType, `Running: ${hookCommandJson}`);
			if (options?.input !== undefined) {
				this._log(requestId, hookType, `Input: ${JSON.stringify(options.input)}`);
			}

			const startTime = Date.now();
			try {
				const result = await this._proxy.runHookCommand(hookCommand, options?.input, token);
				const elapsed = Date.now() - startTime;
				const resultKindStr = result.kind === HookResultKind.Success ? 'Success' : 'Error';
				const resultStr = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
				this._log(requestId, hookType, `Completed (${resultKindStr}) in ${elapsed}ms`);
				this._log(requestId, hookType, `Output: ${resultStr}`);
				results.push(result);
			} catch (err) {
				const elapsed = Date.now() - startTime;
				const errMessage = err instanceof Error ? err.message : String(err);
				this._log(requestId, hookType, `Error in ${elapsed}ms: ${errMessage}`);
				results.push({
					kind: HookResultKind.Error,
					result: errMessage
				});
			}
		}

		return results;
	}
}
