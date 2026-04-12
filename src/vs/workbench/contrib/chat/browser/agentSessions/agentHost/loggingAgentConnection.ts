/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../../../base/common/uri.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IAgentConnection, IAgentCreateSessionConfig, IAgentSessionMetadata, IAuthenticateParams, IAuthenticateResult, AgentHostIpcLoggingSettingId } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents, type ComponentToState, type IRootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IActionEnvelope, INotification, ISessionAction, ITerminalAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { ICreateTerminalParams } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import type { IResourceCopyParams, IResourceCopyResult, IResourceDeleteParams, IResourceDeleteResult, IResourceListResult, IResourceMoveParams, IResourceMoveResult, IResourceReadResult, IResourceWriteParams, IResourceWriteResult } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { Extensions, IOutputChannel, IOutputChannelRegistry, IOutputService } from '../../../../../services/output/common/output.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';

/**
 * JSON replacer that serializes revived URI objects to their string form,
 * keeping the rest of the payload intact.
 */
function uriReplacer(_key: string, value: unknown): unknown {
	if (value && typeof value === 'object' && (value as { $mid?: unknown }).$mid !== undefined && (value as { scheme?: unknown }).scheme !== undefined) {
		return URI.revive(value as UriComponents).toString();
	}
	return value;
}

function formatPayload(data: unknown): string {
	if (data === undefined) {
		return '';
	}
	try {
		return JSON.stringify(data, uriReplacer, 2);
	} catch {
		return String(data);
	}
}

/**
 * A logging wrapper around an {@link IAgentConnection} that writes all IPC
 * traffic to a dedicated output channel. Used by both local and remote agent
 * host contributions to provide per-host IPC tracing.
 *
 * The output channel is registered on first construction for a given channel
 * ID and ref-counted across instances, so it survives reconnections and is
 * only removed when the last instance for that ID is disposed.
 *
 * All method calls, results, errors, and events are logged with arrows:
 * - `>>` for outgoing calls
 * - `<<` for results
 * - `!!` for errors
 * - `**` for events (onDidAction, onDidNotification)
 */
export class LoggingAgentConnection extends Disposable implements IAgentConnection {

	declare readonly _serviceBrand: undefined;

	/** Ref-count per channel ID so the output channel survives reconnections. */
	private static readonly _channelRefCounts = new Map<string, number>();

	private _outputChannel: IOutputChannel | undefined;
	private readonly _enabled: boolean;

	readonly clientId: string;
	readonly onDidAction: Event<IActionEnvelope>;
	readonly onDidNotification: Event<INotification>;

	constructor(
		private readonly _inner: IAgentConnection,
		public readonly channelId: string,
		private readonly _channelLabel: string,
		@IOutputService private readonly _outputService: IOutputService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this.clientId = _inner.clientId;
		this._enabled = !!configurationService.getValue<boolean>(AgentHostIpcLoggingSettingId);

		if (this._enabled) {
			const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
			const refs = LoggingAgentConnection._channelRefCounts.get(this.channelId) ?? 0;
			if (refs === 0) {
				registry.registerChannel({
					id: this.channelId,
					label: this._channelLabel,
					log: false,
					languageId: 'log',
				});
			}
			LoggingAgentConnection._channelRefCounts.set(this.channelId, refs + 1);
			this._register(toDisposable(() => {
				const current = LoggingAgentConnection._channelRefCounts.get(this.channelId)! - 1;
				if (current <= 0) {
					LoggingAgentConnection._channelRefCounts.delete(this.channelId);
					registry.removeChannel(this.channelId);
				} else {
					LoggingAgentConnection._channelRefCounts.set(this.channelId, current);
				}
			}));
		}

		// Wrap events with logging
		const onDidActionEmitter = this._register(new Emitter<IActionEnvelope>());
		this._register(_inner.onDidAction(e => {
			this._log('**', 'onDidAction', e);
			onDidActionEmitter.fire(e);
		}));
		this.onDidAction = onDidActionEmitter.event;

		const onDidNotificationEmitter = this._register(new Emitter<INotification>());
		this._register(_inner.onDidNotification(e => {
			this._log('**', 'onDidNotification', e);
			onDidNotificationEmitter.fire(e);
		}));
		this.onDidNotification = onDidNotificationEmitter.event;
	}

	// ---- IAgentConnection method proxies with logging -----------------------

	async authenticate(params: IAuthenticateParams): Promise<IAuthenticateResult> {
		return this._logCall('authenticate', params, () => this._inner.authenticate(params));
	}

	async listSessions(): Promise<IAgentSessionMetadata[]> {
		return this._logCall('listSessions', undefined, () => this._inner.listSessions());
	}

	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		return this._logCall('createSession', config, () => this._inner.createSession(config));
	}

	async disposeSession(session: URI): Promise<void> {
		return this._logCall('disposeSession', session, () => this._inner.disposeSession(session));
	}

	async createTerminal(params: ICreateTerminalParams): Promise<void> {
		return this._logCall('createTerminal', params, () => this._inner.createTerminal(params));
	}

	async disposeTerminal(terminal: URI): Promise<void> {
		return this._logCall('disposeTerminal', terminal, () => this._inner.disposeTerminal(terminal));
	}

	get rootState(): IAgentSubscription<IRootState> {
		return this._inner.rootState;
	}

	getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		return this._inner.getSubscription(kind, resource);
	}

	getSubscriptionUnmanaged<T extends StateComponents>(kind: T, resource: URI): IAgentSubscription<ComponentToState[T]> | undefined {
		return this._inner.getSubscriptionUnmanaged(kind, resource);
	}

	dispatch(action: ISessionAction | ITerminalAction): void {
		this._log('>>', 'dispatch', action);
		this._inner.dispatch(action);
	}

	async resourceList(uri: URI): Promise<IResourceListResult> {
		return this._logCall('resourceList', uri, () => this._inner.resourceList(uri));
	}

	async resourceRead(uri: URI): Promise<IResourceReadResult> {
		return this._logCall('resourceRead', uri, () => this._inner.resourceRead(uri));
	}

	async resourceWrite(params: IResourceWriteParams): Promise<IResourceWriteResult> {
		return this._logCall('resourceWrite', params, () => this._inner.resourceWrite(params));
	}

	async resourceCopy(params: IResourceCopyParams): Promise<IResourceCopyResult> {
		return this._logCall('resourceCopy', params, () => this._inner.resourceCopy(params));
	}

	async resourceDelete(params: IResourceDeleteParams): Promise<IResourceDeleteResult> {
		return this._logCall('resourceDelete', params, () => this._inner.resourceDelete(params));
	}

	async resourceMove(params: IResourceMoveParams): Promise<IResourceMoveResult> {
		return this._logCall('resourceMove', params, () => this._inner.resourceMove(params));
	}

	// ---- Public logging API for callers' catch blocks -----------------------

	/**
	 * Log an error to the output channel. Use this from caller catch blocks
	 * so connection errors appear in the per-host channel.
	 */
	logError(context: string, error: unknown): void {
		this._log('!!', context, error instanceof Error ? error.message : String(error));
	}

	// ---- Internal helpers ---------------------------------------------------

	private async _logCall<T>(method: string, params: unknown, fn: () => Promise<T>): Promise<T> {
		this._log('>>', method, params);
		try {
			const result = await fn();
			this._log('<<', method, result);
			return result;
		} catch (err) {
			this._log('!!', method, err instanceof Error ? err.message : String(err));
			throw err;
		}
	}

	private _log(arrow: string, method: string, data?: unknown): void {
		if (!this._enabled) {
			return;
		}

		if (!this._outputChannel) {
			this._outputChannel = this._outputService.getChannel(this.channelId);
			if (!this._outputChannel) {
				return;
			}
		}

		const timestamp = new Date().toISOString();
		const payload = formatPayload(data);
		this._outputChannel.append(`[${timestamp}] ${arrow} ${method}${payload ? `\n${payload}` : ''}\n`);
	}
}
