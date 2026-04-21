/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, IReference, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../../../base/common/uri.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IAgentConnection, IAgentCreateSessionConfig, IAgentResolveSessionConfigParams, IAgentSessionConfigCompletionsParams, IAgentSessionMetadata, IAuthenticateParams, IAuthenticateResult, AgentHostIpcLoggingSettingId } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IAgentSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { StateComponents, type ComponentToState, type IRootState } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import type { IActionEnvelope, INotification, ISessionAction, ITerminalAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { ICreateTerminalParams, IResolveSessionConfigResult, ISessionConfigCompletionsResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
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

class LoggingAgentSubscription<T> extends Disposable implements IAgentSubscription<T> {

	private readonly _onDidChange = this._register(new Emitter<T>());
	readonly onDidChange: Event<T> = this._onDidChange.event;

	readonly onWillApplyAction: Event<IActionEnvelope>;
	readonly onDidApplyAction: Event<IActionEnvelope>;

	constructor(
		private readonly _label: string,
		private readonly _inner: IAgentSubscription<T>,
		logCurrentValue: boolean,
		private readonly _log: (arrow: string, method: string, data?: unknown) => void,
	) {
		super();

		this.onWillApplyAction = _inner.onWillApplyAction;
		this.onDidApplyAction = _inner.onDidApplyAction;

		if (logCurrentValue && _inner.value !== undefined) {
			this._log('**', `${this._label}.current`, _inner.value);
		}

		this._register(_inner.onDidChange(value => {
			this._log('**', `${this._label}.onDidChange`, value);
			this._onDidChange.fire(value);
		}));
	}

	get value(): T | Error | undefined {
		return this._inner.value;
	}

	get verifiedValue(): T | undefined {
		return this._inner.verifiedValue;
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
	private static readonly _currentRootStateLogKeys = new Set<string>();
	/**
	 * Shared event-log subscription per channel ID. Multiple wrappers may
	 * exist for the same underlying connection (e.g. one for chat, one for
	 * terminal); we only want each event to appear once in the channel.
	 */
	private static readonly _sharedEventLog = new Map<string, IDisposable>();

	private _outputChannel: IOutputChannel | undefined;
	private readonly _enabled: boolean;

	readonly clientId: string;
	readonly onDidAction: Event<IActionEnvelope>;
	readonly onDidNotification: Event<INotification>;
	private readonly _rootState: IAgentSubscription<IRootState>;

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
		const currentRootStateLogKey = `${this.channelId}:rootState.current`;
		let logCurrentRootState = false;

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
				const eventLogStore = new DisposableStore();
				eventLogStore.add(_inner.onDidAction(e => this._log('**', 'onDidAction', e)));
				eventLogStore.add(_inner.onDidNotification(e => this._log('**', 'onDidNotification', e)));
				LoggingAgentConnection._sharedEventLog.set(this.channelId, eventLogStore);
			}
			LoggingAgentConnection._channelRefCounts.set(this.channelId, refs + 1);
			logCurrentRootState = !LoggingAgentConnection._currentRootStateLogKeys.has(currentRootStateLogKey);
			if (logCurrentRootState) {
				LoggingAgentConnection._currentRootStateLogKeys.add(currentRootStateLogKey);
			}
			this._register(toDisposable(() => {
				const current = LoggingAgentConnection._channelRefCounts.get(this.channelId)! - 1;
				if (current <= 0) {
					LoggingAgentConnection._channelRefCounts.delete(this.channelId);
					LoggingAgentConnection._currentRootStateLogKeys.delete(currentRootStateLogKey);
					LoggingAgentConnection._sharedEventLog.get(this.channelId)?.dispose();
					LoggingAgentConnection._sharedEventLog.delete(this.channelId);
					registry.removeChannel(this.channelId);
				} else {
					LoggingAgentConnection._channelRefCounts.set(this.channelId, current);
				}
			}));
		}

		// Expose the inner events directly. Logging happens once per channel
		// via the shared subscription registered above; wrappers must not
		// add their own logging listener or events would be logged N times
		// (once per wrapper for the same channel).
		this.onDidAction = _inner.onDidAction;
		this.onDidNotification = _inner.onDidNotification;

		this._rootState = this._register(new LoggingAgentSubscription('rootState', _inner.rootState, logCurrentRootState, (arrow, method, data) => this._log(arrow, method, data)));
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

	async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<IResolveSessionConfigResult> {
		return this._logCall('resolveSessionConfig', params, () => this._inner.resolveSessionConfig(params));
	}

	async sessionConfigCompletions(params: IAgentSessionConfigCompletionsParams): Promise<ISessionConfigCompletionsResult> {
		return this._logCall('sessionConfigCompletions', params, () => this._inner.sessionConfigCompletions(params));
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
		return this._rootState;
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
