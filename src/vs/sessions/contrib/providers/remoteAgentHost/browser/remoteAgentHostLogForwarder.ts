/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { UriTemplate } from '../../../../../base/common/uriTemplate.js';
import { ILogService, LogLevel } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { iterateOtlpLogRecords, logLevelToOtlpLevelName, severityNumberToLogLevel, type IOtlpLogRecord, type OtlpLogLevelName } from '../../../../../platform/agentHost/common/otlp/otlpLogEmitter.js';
import { AgentHostClientState, type RemoteAgentHostProtocolClient } from '../../../../../platform/agentHost/browser/remoteAgentHostProtocolClient.js';
import { remoteAgentHostLogOutputChannelId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { formatHostBuildInfo, readHostBuildInfo } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { Extensions, IOutputChannel, IOutputChannelRegistry, IOutputService } from '../../../../../workbench/services/output/common/output.js';

/**
 * Forwarder that bridges a connected {@link RemoteAgentHostProtocolClient}'s
 * OTLP logs channel into the workbench's Output panel.
 *
 * For each {@link AgentHostClientState.Connected} transition (initial
 * handshake or post-reconnect) where the host advertised
 * `telemetry.logs`, the forwarder:
 *
 * - Lazily registers an Output channel via
 *   {@link IOutputChannelRegistry.registerChannel} keyed by the host's
 *   stable address so subsequent connects reuse the same channel and the
 *   user keeps any logs from previous sessions visible in the picker.
 * - Subscribes to the host's logs channel at the level matching the
 *   workbench's current {@link ILogService} level and re-subscribes when
 *   that level changes.
 * - Decodes incoming `otlp/exportLogs` notifications and appends each
 *   record to the Output channel.
 *
 * Output channels are deliberately NOT removed when the host disconnects —
 * the user expects to still be able to inspect prior log output, and the
 * count of remote hosts is small so leaking them is fine.
 *
 * The local agent host has its own out-of-band IPC log forwarder
 * (`AgentHostProcessManager` + `LoggerChannel`) and does NOT route through
 * this class.
 */
export class RemoteAgentHostLogForwarder extends Disposable {

	private readonly _channelId: string;
	private readonly _channelLabel: string;
	private _outputChannel: IOutputChannel | undefined;
	private _channelRegistered = false;
	/** Whether the one-time host build-info header has been written. */
	private _buildInfoHeaderWritten = false;
	/** Tracks whatever needs to be torn down for a single subscribe cycle. */
	private readonly _subscriptionStore = this._register(new MutableDisposable<DisposableStore>());
	private _currentLevel: OtlpLogLevelName | undefined;

	constructor(
		private readonly _client: RemoteAgentHostProtocolClient,
		address: string,
		displayName: string,
		@IOutputService private readonly _outputService: IOutputService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._channelId = remoteAgentHostLogOutputChannelId(address);
		this._channelLabel = `Agent Host (${displayName})`;

		// Wire up subscribe/teardown around the client's connection state.
		this._register(_client.onDidChangeConnectionState(state => {
			switch (state) {
				case AgentHostClientState.Connected:
					this._attach();
					break;
				case AgentHostClientState.Reconnecting:
				case AgentHostClientState.Incompatible:
				case AgentHostClientState.Closed:
					this._detach();
					break;
				case AgentHostClientState.Connecting:
					break;
			}
		}));

		// The workbench's overall log level drives the wire-level
		// subscription. Re-subscribe when it changes so we stop receiving
		// records the user does not want to see.
		this._register(_logService.onDidChangeLogLevel(() => this._attach()));

		this._register(_client.onDidReceiveOtlpLogs(params => {
			this._handleBatch(params.payload);
		}));

		// If the client is already connected when the forwarder is
		// constructed (e.g. attached after handshake), attach immediately.
		if (_client.connectionState === AgentHostClientState.Connected) {
			this._attach();
		}
	}

	/**
	 * (Re-)subscribe to the host's logs channel at the level matching the
	 * workbench's current log level. Replaces any prior subscription.
	 * Silent no-op when the host did not advertise a logs channel —
	 * there is nothing to subscribe to.
	 */
	private _attach(): void {
		// Defer subscribe traffic when the transport is not actually
		// usable. The `Connected` state-change listener reruns `_attach()`
		// once the soft-reconnect completes, so deferred work is picked
		// up automatically. Without this guard, repeated log-level
		// changes during a single reconnect would queue multiple gated
		// `subscribe` requests that all fire after the gate resolves,
		// leaving stale subscriptions on the server.
		if (this._client.connectionState !== AgentHostClientState.Connected) {
			return;
		}

		const template = this._client.initializeResult.get()?.telemetry?.logs;
		if (!template) {
			return;
		}

		const desiredLevel = this._levelFromLogService();
		if (!desiredLevel) {
			// `Off` — drop the subscription if we had one.
			this._detach();
			return;
		}

		if (this._subscriptionStore.value && this._currentLevel === desiredLevel) {
			// Already attached at the same level — nothing to do.
			return;
		}

		// Output channel is registered lazily so hosts without an OTLP
		// logs channel never produce an empty entry in the picker.
		this._ensureChannelRegistered();
		this._writeHostBuildInfoHeader();

		const store = new DisposableStore();
		this._subscriptionStore.value = store;
		this._currentLevel = desiredLevel;

		const channelUri = this._expandLogsChannel(template, desiredLevel);

		// Best-effort: the server may reject the subscribe (incompatible
		// protocol version, host without OTLP, etc.). Log to our channel
		// and bail — the channel itself stays registered.
		this._client.subscribeStateless(URI.parse(channelUri)).catch(err => {
			this._appendLine(`Failed to subscribe to OTLP logs channel ${channelUri}: ${formatError(err)}`);
		});

		store.add(toDisposable(() => {
			// Server unsubscribe is best-effort: if the connection has
			// already torn down we just drop our state.
			try {
				this._client.unsubscribe(URI.parse(channelUri));
			} catch {
				// ignore
			}
		}));
	}

	/**
	 * Register the per-host Output channel on first attach. Subsequent
	 * calls are no-ops — registering the same id twice replaces the
	 * existing channel.
	 *
	 * The channel is intentionally never deregistered: the host count is
	 * small, and the user typically wants to inspect logs after a host
	 * has disconnected (e.g. when diagnosing why it dropped).
	 */
	private _ensureChannelRegistered(): void {
		if (this._channelRegistered) {
			return;
		}
		this._channelRegistered = true;
		const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
		if (!registry.getChannel(this._channelId)) {
			registry.registerChannel({
				id: this._channelId,
				label: this._channelLabel,
				log: false,
				languageId: 'log',
			});
		}
	}

	/**
	 * Drop the current subscription (if any). Idempotent. The Output
	 * channel registration is preserved — only the in-flight subscribe
	 * is undone.
	 */
	private _detach(): void {
		this._subscriptionStore.clear();
		this._currentLevel = undefined;
	}

	/**
	 * Resolve the level we want to subscribe at from the workbench's
	 * global log level. `Off` yields `undefined` so the caller can drop
	 * any existing subscription.
	 */
	private _levelFromLogService(): OtlpLogLevelName | undefined {
		const level = this._logService.getLevel();
		if (level === LogLevel.Off) {
			return undefined;
		}
		return logLevelToOtlpLevelName(level) ?? 'info';
	}

	/**
	 * Expand the host's RFC 6570 URI template to a concrete subscribable
	 * channel URI. Hosts that hard-code a literal channel (no template
	 * variables) round-trip verbatim — `UriTemplate.resolve` substitutes
	 * any `{level}` variable and otherwise emits the literal sequence.
	 *
	 * Using `UriTemplate.parse` (rather than a hand-rolled `.replace`)
	 * keeps the implementation spec-conformant: the host can theoretically
	 * advertise variants like `{?level}` or pin additional unknown
	 * variables the protocol may later define.
	 */
	private _expandLogsChannel(template: string, level: OtlpLogLevelName): string {
		return UriTemplate.parse(template).resolve({ level });
	}

	/**
	 * Decode an OTLP/JSON `ExportLogsServiceRequest` payload and append
	 * each contained record to the registered Output channel. Records
	 * whose severity is below the workbench's current log level are
	 * filtered defensively (the host *should* have honoured `{level}`
	 * but the spec says we MUST still filter).
	 */
	private _handleBatch(payload: unknown): void {
		if (!this._channelRegistered) {
			// We never got far enough to register a channel — drop any
			// stray records rather than implicitly creating one here.
			return;
		}
		const loggerLevel = this._logService.getLevel();
		if (loggerLevel === LogLevel.Off) {
			return;
		}
		for (const record of iterateOtlpLogRecords(payload)) {
			const level = severityNumberToLogLevel(record.severityNumber);
			if (level < loggerLevel) {
				continue;
			}
			this._appendLine(formatRecord(record));
		}
	}

	/**
	 * Write a one-time header line with the host's build info (version,
	 * commit, date, quality) read from the connected client's root state.
	 * Lets the user see which build is hosting the agent host in the
	 * forwarded Output channel. No-op when the root state has not arrived
	 * or carries no build info, and only ever writes once.
	 */
	private _writeHostBuildInfoHeader(): void {
		if (this._buildInfoHeaderWritten) {
			return;
		}
		const rootState = this._client.rootState.value;
		if (!rootState || rootState instanceof Error) {
			return;
		}
		const buildInfo = readHostBuildInfo(rootState);
		if (!buildInfo) {
			return;
		}
		this._buildInfoHeaderWritten = true;
		this._appendLine(`Agent host version ${formatHostBuildInfo(buildInfo)}`);
	}

	private _appendLine(text: string): void {
		if (!this._outputChannel) {
			this._outputChannel = this._outputService.getChannel(this._channelId);
			if (!this._outputChannel) {
				return;
			}
		}
		this._outputChannel.append(text.endsWith('\n') ? text : `${text}\n`);
	}
}

function formatRecord(record: IOtlpLogRecord): string {
	// Match the `[timestamp] [level] message` shape the workbench's
	// other log Output channels use, so the rendering looks consistent
	// when the user switches between them. Timestamps are formatted
	// from the OTLP nanosecond integer string.
	const timestamp = formatTimestamp(record.timeUnixNano);
	const severity = record.severityText.toUpperCase().padEnd(5);
	const attributes = record.attributes && Object.keys(record.attributes).length > 0
		? ` ${JSON.stringify(record.attributes)}`
		: '';
	return `[${timestamp}] [${severity}] ${record.body}${attributes}`;
}

function formatTimestamp(timeUnixNano: string): string {
	// `timeUnixNano` is a base-10 integer string with the last 6 digits
	// being sub-ms precision. Cap precision at ms so the conversion fits
	// in a JS number.
	const ms = timeUnixNano.length > 6 ? Number(timeUnixNano.slice(0, -6)) : 0;
	if (!Number.isFinite(ms)) {
		return new Date().toISOString();
	}
	return new Date(ms).toISOString();
}

function formatError(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}
