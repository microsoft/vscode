/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ListSessionsOptions, Options, SDKSessionInfo, WarmQuery } from '@anthropic-ai/claude-agent-sdk';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';

export const IClaudeAgentSdkService = createDecorator<IClaudeAgentSdkService>('claudeAgentSdkService');

/**
 * Lazy wrapper over `@anthropic-ai/claude-agent-sdk` for the agent host
 * Claude provider. The interface grows phase-by-phase; Phase 5 introduces
 * the decorator so {@link import('./claudeAgent.js').ClaudeAgent} can take
 * it as a constructor dependency. Phase 6 adds {@link startup} for
 * materialization. Method surfaces are added in subsequent slices alongside
 * the tests that exercise them.
 */
export interface IClaudeAgentSdkService {
	readonly _serviceBrand: undefined;

	/**
	 * Enumerates persisted Claude sessions surfaced by the SDK's filesystem
	 * scan. Phase 5 mirrors `IAgent.listSessions()` (no `dir` parameter):
	 * the host translates this internally to `sdk.listSessions(undefined)`.
	 *
	 * Failures (corrupt module, postinstall mishap) reject with the SDK
	 * loader's diagnostic. Callers MUST tolerate rejection without
	 * collapsing the wider listing pipeline.
	 */
	listSessions(): Promise<readonly SDKSessionInfo[]>;

	/**
	 * Pre-warms the SDK subprocess and runs the init handshake. Returns
	 * a {@link WarmQuery} whose `.query(promptIterable)` binds the
	 * prompt iterable and returns a streaming `Query`. Aborting
	 * `options.abortController` either rejects this promise (if init is
	 * in flight) or causes the resulting Query to clean up resources
		 * (sdk.d.ts section `startup`).
	 *
	 * Phase 6 calls this from {@link ClaudeAgent._materializeProvisional}
	 * on the first `sendMessage`. Firing `onDidMaterializeSession` is
	 * deliberately deferred until after the await resolves so AgentService
	 * can atomically dispatch the deferred `sessionAdded` notification.
	 */
	startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery>;
}

/**
 * Narrowed structural slice of `@anthropic-ai/claude-agent-sdk` covering
 * exactly the bindings the agent host pulls from the SDK. Production
 * `import()` returns the full module which is structurally assignable to
 * this interface; tests subclass {@link ClaudeAgentSdkService} and
 * override {@link ClaudeAgentSdkService._loadSdk} to fault or stub these
 * bindings without having to name every export of the SDK module.
 */
export interface IClaudeSdkBindings {
	listSessions(options?: ListSessionsOptions): Promise<SDKSessionInfo[]>;
	startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery>;
}

/**
 * Production implementation. The SDK module is loaded lazily via dynamic
 * `import()` because it pulls in non-trivial deps that aren't relevant
 * unless the user has opted into the Claude agent.
 *
 * The loader's caching / log-once-on-failure semantics are locked by the
 * dedicated test in {@link import('../../test/node/claudeAgent.test.ts')},
 * which subclasses this and overrides {@link _loadSdk} to fault on demand.
 * That's why {@link _loadSdk} is `protected` rather than `private`.
 */
export class ClaudeAgentSdkService implements IClaudeAgentSdkService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Cached resolved bindings. We deliberately cache the *resolved* value,
	 * not the in-flight promise — if a transient `import()` failure recovers
	 * (e.g. user fixes a broken `node_modules`), the next call retries.
	 * Mirrors the convention in `agentHostTerminalManager.ts` for `node-pty`.
	 */
	private _sdkModule: IClaudeSdkBindings | undefined;

	/**
	 * Latched once we've logged a load failure, so a corrupt postinstall
	 * doesn't flood `error` events on every `listSessions()` call (each
	 * workbench refresh and session-list rerender hits this path).
	 */
	private _firstLoadFailureLogged = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) { }

	async listSessions(): Promise<readonly SDKSessionInfo[]> {
		const sdk = await this._getSdk();
		return sdk.listSessions(undefined);
	}

	async startup(params: { options: Options; initializeTimeoutMs?: number }): Promise<WarmQuery> {
		const sdk = await this._getSdk();
		return sdk.startup(params);
	}

	private async _getSdk(): Promise<IClaudeSdkBindings> {
		if (this._sdkModule) {
			return this._sdkModule;
		}
		try {
			this._sdkModule = await this._loadSdk();
			return this._sdkModule;
		} catch (err) {
			if (!this._firstLoadFailureLogged) {
				this._firstLoadFailureLogged = true;
				this._logService.error('[Claude] Failed to load @anthropic-ai/claude-agent-sdk', err);
			}
			throw err;
		}
	}

	protected async _loadSdk(): Promise<IClaudeSdkBindings> {
		return import('@anthropic-ai/claude-agent-sdk');
	}
}
