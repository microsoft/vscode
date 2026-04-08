/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../../../../base/common/uri.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IAgentConnection, IAgentCreateSessionConfig, IAgentSessionMetadata, IAuthenticateParams, IAuthenticateResult, AgentHostIpcLoggingSettingId } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IActionEnvelope, INotification, ISessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { IResourceCopyParams, IResourceCopyResult, IResourceDeleteParams, IResourceDeleteResult, IResourceListResult, IResourceMoveParams, IResourceMoveResult, IResourceReadResult, IResourceWriteParams, IResourceWriteResult, IStateSnapshot } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
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
 * The output channel is registered on construction and removed on dispose,
 * so its lifetime matches the connection.
 *
 * All method calls, results, errors, and events are logged with arrows:
 * - `>>` for outgoing calls
 * - `<<` for results
 * - `!!` for errors
 * - `**` for events (onDidAction, onDidNotification)
 */
export class LoggingAgentConnection extends Disposable implements IAgentConnection {

	declare readonly _serviceBrand: undefined;

	private _outputChannel: IOutputChannel | undefined;
	private readonly _enabled: boolean;

	readonly clientId: string;
	readonly onDidAction: Event<IActionEnvelope>;
	readonly onDidNotification: Event<INotification>;

	constructor(
		private readonly _inner: IAgentConnection,
		private readonly _channelId: string,
		private readonly _channelLabel: string,
		@IOutputService private readonly _outputService: IOutputService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super();
		this.clientId = _inner.clientId;
		this._enabled = !!configurationService.getValue<boolean>(AgentHostIpcLoggingSettingId);

		if (this._enabled) {
			// Register the output channel if not already registered (e.g. by an
			// earlier connection to the same host that was torn down on reconnect).
			const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
			if (!registry.getChannel(this._channelId)) {
				registry.registerChannel({
					id: this._channelId,
					label: this._channelLabel,
					log: false,
					languageId: 'log',
				});
				this._register({ dispose: () => registry.removeChannel(this._channelId) });
			}
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

	async shutdown(): Promise<void> {
		return this._logCall('shutdown', undefined, () => this._inner.shutdown());
	}

	async subscribe(resource: URI): Promise<IStateSnapshot> {
		return this._logCall('subscribe', resource, () => this._inner.subscribe(resource));
	}

	unsubscribe(resource: URI): void {
		this._log('>>', 'unsubscribe', resource);
		this._inner.unsubscribe(resource);
	}

	dispatchAction(action: ISessionAction, clientId: string, clientSeq: number): void {
		this._log('>>', 'dispatchAction', { action, clientId, clientSeq });
		this._inner.dispatchAction(action, clientId, clientSeq);
	}

	nextClientSeq(): number {
		return this._inner.nextClientSeq();
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
			this._outputChannel = this._outputService.getChannel(this._channelId);
			if (!this._outputChannel) {
				return;
			}
		}

		const timestamp = new Date().toISOString();
		const payload = formatPayload(data);
		this._outputChannel.append(`[${timestamp}] ${arrow} ${method}${payload ? `\n${payload}` : ''}\n`);
	}
}
