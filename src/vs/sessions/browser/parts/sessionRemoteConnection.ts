/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeoutTimer } from '../../../base/common/async.js';
import { Codicon } from '../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { autorun, derived, derivedObservableWithCache, IObservable, IReader, observableSignal, observableValue, transaction } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { ILogService } from '../../../platform/log/common/log.js';
import { isAgentHostProvider } from '../../common/agentHostSessionsProvider.js';
import { SessionRemoteConnectionFailureReason, SessionRemoteConnectionStatus } from '../../services/sessions/common/session.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { IRemoteHostUnavailableEmptyStateContent } from './remoteHostUnavailableEmptyState.js';
import { ISessionReadOnlyBannerContent } from './sessionReadOnlyBanner.js';

const RECONNECTING_BANNER_DELAY = 1_000;

function isSameRemoteConnectionStatus(a: SessionRemoteConnectionStatus | undefined, b: SessionRemoteConnectionStatus | undefined): boolean {
	if (!a || !b) {
		return a === b;
	}
	if (a.kind === 'disconnected' && b.kind === 'disconnected') {
		return a.reason === b.reason;
	}
	return a.kind === b.kind;
}

type ConnectAttempt =
	| { readonly kind: 'active'; readonly session: IActiveSession; readonly message: string | undefined; readonly statusBefore: SessionRemoteConnectionStatus | undefined }
	| { readonly kind: 'failed'; readonly session: IActiveSession; readonly statusBefore: SessionRemoteConnectionStatus | undefined };

/**
 * Connection presentation and recovery state for the session rendered by a chat group.
 */
export class SessionRemoteConnection extends Disposable {

	private readonly _session = observableValue<IActiveSession | undefined>(this, undefined);
	private readonly _attempt = observableValue<ConnectAttempt | undefined>(this, undefined);
	private readonly _progressListener = this._register(new MutableDisposable());
	private readonly _deadlineSignal = observableSignal(this);
	// Kept separate so countdown ticks cannot restart the reconnecting-banner delay.
	private readonly _reconnectCountdownSignal = observableSignal(this);
	/**
	 * The session an automatic start has already been triggered for, cleared
	 * once the host is reachable again so each outage gets its own attempt.
	 * Latched separately from {@link _attempt} because a completed attempt
	 * clears that back to `undefined`; keying the gate on it would let a connect
	 * that resolves without reaching the host retrigger forever.
	 *
	 * Scoped to this view. A split session has one instance per chat group, so
	 * an outage can produce one attempt per group. That stays bounded — each
	 * instance latches independently — and providers collapse the duplicates:
	 * `connect()` joins an in-flight dial rather than starting a second one.
	 */
	private readonly _autoConnected = observableValue<IActiveSession | undefined>(this, undefined);
	/**
	 * Whether the host should be started without waiting for a click. Gated on a
	 * stopped host the provider can start, and on not having tried yet — one
	 * automatic try per outage, after which the user gets the button.
	 */
	private readonly _autoConnectPending = derived(this, reader => {
		const session = this._session.read(reader);
		const provider = session && this._sessionsProvidersService.getProvider(session.providerId);
		const status = this._getEffectiveStatus(reader);
		if (!session || !provider || !isAgentHostProvider(provider) || !provider.connect || !provider.autoConnect) {
			return false;
		}
		return provider.autoConnect.enabled.read(reader)
			&& status?.kind === 'disconnected'
			&& status.reason === SessionRemoteConnectionFailureReason.HostNotRunning
			&& this._autoConnected.read(reader) !== session
			&& this._attempt.read(reader) === undefined;
	});

	private readonly _reconnectingSince = derivedObservableWithCache<{ readonly session: IActiveSession; readonly since: number } | undefined>(this, (reader, last) => {
		const session = this._session.read(reader);
		const status = this._getEffectiveStatus(reader);
		const attempt = this._attempt.read(reader);
		if (!session || status?.kind !== 'reconnecting' || attempt?.kind === 'active') {
			return undefined;
		}
		// Keyed by session only to guard future reuse: a ChatGroupView is currently
		// created per session, so the cache cannot outlive the session it belongs to.
		return last?.session === session ? last : { session, since: Date.now() };
	});

	private readonly _reconnectingBannerVisible = derived(this, reader => {
		const reconnecting = this._reconnectingSince.read(reader);
		if (reconnecting === undefined) {
			return false;
		}

		const remaining = reconnecting.since + RECONNECTING_BANNER_DELAY - Date.now();
		if (remaining <= 0) {
			return true;
		}

		this._deadlineSignal.read(reader);
		// The fixed deadline prevents unrelated observable updates from restarting the delay.
		reader.store.add(new TimeoutTimer(() => this._deadlineSignal.trigger(undefined), remaining));
		return false;
	});

	private readonly _reconnectCountdownSeconds = derived(this, reader => {
		const status = this._getEffectiveStatus(reader);
		if (status?.kind !== 'reconnecting' || status.nextAttemptAt === undefined) {
			return undefined;
		}

		this._reconnectCountdownSignal.read(reader);
		const now = Date.now();
		const remaining = status.nextAttemptAt - now;
		if (remaining <= 0) {
			return undefined;
		}

		reader.store.add(new TimeoutTimer(() => this._reconnectCountdownSignal.trigger(undefined), 1_000 - now % 1_000));
		return Math.ceil(remaining / 1_000);
	});

	readonly bannerContent: IObservable<ISessionReadOnlyBannerContent | undefined> = derived(this, reader => this._getRemoteConnectionBannerContent(reader));
	readonly recoveryContent: IObservable<IRemoteHostUnavailableEmptyStateContent | undefined> = derived(this, reader => this._getRemoteHostUnavailableContent(reader));

	constructor(
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register(autorun(reader => {
			// A host that came back releases the latch, so a later outage gets its
			// own automatic attempt instead of the session being limited to one.
			if (this._getEffectiveStatus(reader)?.kind === 'connected' && this._autoConnected.read(reader) !== undefined) {
				this._autoConnected.set(undefined, undefined);
			}
			if (!this._autoConnectPending.read(reader)) {
				return;
			}
			const session = this._session.read(reader);
			this._logService.info(`[SessionRemoteConnection] auto-connect triggered for ${session?.providerId}`);
			this._autoConnected.set(session, undefined);
			this.connect();
		}));
	}

	setSession(session: IActiveSession | undefined): void {
		this._progressListener.clear();
		// One transaction: these writes notify autoruns synchronously, and
		// clearing the gates while the previous session is still selected would
		// let the automatic start fire for the host being switched away from.
		transaction(tx => {
			this._session.set(session, tx);
			this._attempt.set(undefined, tx);
			this._autoConnected.set(undefined, tx);
		});
	}

	connect(): void {
		const session = this._session.get();
		if (!session) {
			this._logService.info('[SessionRemoteConnection] connect: no session');
			return;
		}

		const attempt = this._attempt.get();
		if (attempt?.kind === 'active' && attempt.session === session) {
			this._logService.info('[SessionRemoteConnection] connect: attempt already active');
			return;
		}
		if (attempt?.kind === 'failed') {
			this._attempt.set(undefined, undefined);
		}

		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.connect) {
			this._logService.info(`[SessionRemoteConnection] connect: ${session.providerId} cannot connect on demand`);
			return;
		}

		const statusBefore = session.remoteConnectionStatus?.get();
		this._logService.info(`[SessionRemoteConnection] connect: starting ${provider.remoteAddress ?? provider.id}, statusBefore=${statusBefore?.kind}`);
		this._attempt.set({ kind: 'active', session, message: undefined, statusBefore }, undefined);
		const remoteAddress = provider.remoteAddress;
		if (remoteAddress && provider.onDidReportConnectProgress) {
			this._progressListener.value = provider.onDidReportConnectProgress(progress => {
				if (progress.connectionKey !== remoteAddress) {
					return;
				}
				const currentAttempt = this._attempt.get();
				if (currentAttempt?.kind === 'active' && currentAttempt.session === session) {
					this._attempt.set({ ...currentAttempt, message: progress.message }, undefined);
				}
			});
		}

		void this._runConnect(session, statusBefore, () => provider.connect!());
	}

	private async _runConnect(session: IActiveSession, statusBefore: SessionRemoteConnectionStatus | undefined, connect: () => Promise<void>): Promise<void> {
		try {
			await connect();
			this._logService.info(`[SessionRemoteConnection] connect resolved, status=${session.remoteConnectionStatus?.get()?.kind}`);
			this._finishAttempt(session);
		} catch (error) {
			this._logService.info(`[SessionRemoteConnection] connect rejected: ${error}`);
			this._failAttempt(session, statusBefore);
			onUnexpectedError(error);
		}
	}

	private _finishAttempt(session: IActiveSession): void {
		const attempt = this._attempt.get();
		if (attempt?.kind !== 'active' || attempt.session !== session) {
			return;
		}

		this._progressListener.clear();
		this._attempt.set(undefined, undefined);
	}

	private _failAttempt(session: IActiveSession, statusBefore: SessionRemoteConnectionStatus | undefined): void {
		const attempt = this._attempt.get();
		if (attempt?.kind !== 'active' || attempt.session !== session) {
			return;
		}

		this._progressListener.clear();
		this._attempt.set({ kind: 'failed', session, statusBefore }, undefined);
	}

	private _getEffectiveStatus(reader: IReader): SessionRemoteConnectionStatus | undefined {
		const session = this._session.read(reader);
		const status = session?.remoteConnectionStatus?.read(reader);
		const attempt = this._attempt.read(reader);
		return attempt?.kind === 'failed' && attempt.session === session && status?.kind === 'connecting'
			? attempt.statusBefore
			: status;
	}

	private _getRemoteHostConnectProgress(session: IActiveSession, status: SessionRemoteConnectionStatus | undefined, reader: IReader): string | undefined {
		const attempt = this._attempt.read(reader);
		if (attempt?.kind !== 'active' || attempt.session !== session || status?.kind === 'connected') {
			return undefined;
		}
		if (attempt.message !== undefined) {
			return attempt.message;
		}
		// Between starting an attempt and the host reporting `connecting`, the
		// status is still the one the attempt started from. Treat that window as
		// in flight so the recovery action cannot flash back into view. A status
		// that actually changed means the host reported something newer — a fresh
		// failure, say — which wins over this placeholder.
		const settling = status?.kind === 'connecting'
			|| status?.kind === 'reconnecting'
			|| isSameRemoteConnectionStatus(status, attempt.statusBefore);
		return settling
			? localize('sessionRemoteHost.waitingForConnection', "Waiting for agent host connection...")
			: undefined;
	}

	private _getRemoteHostUnavailableContent(reader: IReader): IRemoteHostUnavailableEmptyStateContent | undefined {
		const session = this._session.read(reader);
		if (!session) {
			return undefined;
		}

		const status = this._getEffectiveStatus(reader);
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		const hostLabel = provider?.label ?? localize('sessionRemoteHost.unknown', "The remote host");
		if (status?.kind === 'connected') {
			return undefined;
		}
		if (status?.kind === 'incompatible') {
			return {
				title: localize('sessionRemoteHost.incompatibleTitle', "Cannot Connect to {0}", hostLabel),
				description: localize('sessionRemoteHost.incompatibleDescription', "{0} is incompatible with this version of Visual Studio Code.", hostLabel),
			};
		}
		const progressMessage = this._getRemoteHostConnectProgress(session, status, reader);
		const autoConnectPending = this._autoConnectPending.read(reader);
		const canStartHost = !!provider && isAgentHostProvider(provider) && !!provider.connect;
		const autoConnect = canStartHost && provider.autoConnect
			? {
				label: provider.autoConnect.label,
				checked: provider.autoConnect.enabled.read(reader),
				onChange: (checked: boolean) => provider.autoConnect!.setEnabled(checked),
			}
			: undefined;
		const attempt = this._attempt.read(reader);
		const startedFromStoppedHost = autoConnectPending
			|| (attempt?.kind === 'active'
				&& attempt.session === session
				&& attempt.statusBefore?.kind === 'disconnected'
				&& attempt.statusBefore.reason === SessionRemoteConnectionFailureReason.HostNotRunning);
		if (progressMessage || autoConnectPending) {
			return {
				title: localize('sessionRemoteHost.connectingTitle', "Connecting to {0}", hostLabel),
				description: localize('sessionRemoteHost.startingDescription', "Starting {0}.", hostLabel),
				progress: progressMessage ?? localize('sessionRemoteHost.waitingForConnection', "Waiting for agent host connection..."),
				autoConnect: startedFromStoppedHost ? autoConnect : undefined,
			};
		}
		if (!status || status.kind !== 'disconnected') {
			return undefined;
		}
		if (status.reason === SessionRemoteConnectionFailureReason.HostNotRunning) {
			return {
				title: localize('sessionRemoteHost.notRunningTitle', "Unable to Connect to {0}", hostLabel),
				description: localize('sessionRemoteHost.notRunning', "{0} is not running.", hostLabel),
				action: provider && isAgentHostProvider(provider) && provider.connect
					? {
						label: localize('sessionRemoteHost.start', "Start {0}", hostLabel),
						run: () => this.connect(),
					}
					: undefined,
				autoConnect,
			};
		}
		return {
			title: localize('sessionRemoteHost.disconnectedTitle', "Cannot Connect to {0}", hostLabel),
			description: localize('sessionRemoteHost.disconnected', "Cannot reach {0}.", hostLabel),
			// An unreachable host is often transient — a dropped tunnel, a sleeping
			// machine — so offer a manual retry even though there is nothing local
			// to start and so nothing to do automatically.
			action: canStartHost
				? {
					label: localize('sessionRemoteHost.retry', "Retry"),
					run: () => this.connect(),
				}
				: undefined,
		};
	}

	private _getRemoteConnectionBannerContent(reader: IReader): ISessionReadOnlyBannerContent | undefined {
		const session = this._session.read(reader);
		if (!session) {
			return undefined;
		}

		const status = this._getEffectiveStatus(reader);
		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		const hostLabel = provider?.label ?? localize('sessionRemoteHost.unknown', "The remote host");
		const progressMessage = this._getRemoteHostConnectProgress(session, status, reader);
		// Mirror the recovery state: while an automatic start is pending the
		// action must not appear, even for the frame before the attempt registers.
		if (progressMessage || this._autoConnectPending.read(reader)) {
			return {
				icon: Codicon.sync,
				message: progressMessage ?? localize('sessionRemoteHost.waitingForConnection', "Waiting for agent host connection..."),
			};
		}

		if (!status || status.kind === 'connected' || status.kind === 'connecting') {
			return undefined;
		}

		if (status.kind === 'incompatible') {
			// The centered recovery state is skipped once a transcript is rendered,
			// so this banner is the only place the incompatibility can be explained.
			return {
				icon: Codicon.debugDisconnect,
				message: localize('sessionRemoteHost.incompatibleDescription', "{0} is incompatible with this version of Visual Studio Code.", hostLabel),
			};
		}

		if (status.kind === 'reconnecting') {
			const seconds = this._reconnectCountdownSeconds.read(reader);
			return this._reconnectingBannerVisible.read(reader)
				? {
					icon: Codicon.sync,
					message: seconds === undefined
						? localize('sessionRemoteHost.reconnecting', "Reconnecting to {0}...", hostLabel)
						: localize('sessionRemoteHost.reconnectingIn', "Reconnecting to {0} in {1}s", hostLabel, seconds),
					// The banner is a live region, so the per-second countdown would
					// otherwise queue an announcement every tick. Keep the spoken
					// text stable and let only the visible text count down.
					ariaLabel: localize('sessionRemoteHost.reconnecting', "Reconnecting to {0}...", hostLabel),
					action: seconds !== undefined && provider && isAgentHostProvider(provider) && provider.reconnectNow
						? {
							label: localize('sessionRemoteHost.tryNow', "Try Now"),
							run: () => provider.reconnectNow?.(),
						}
						: undefined,
				}
				: undefined;
		}
		if (status.reason === SessionRemoteConnectionFailureReason.HostNotRunning) {
			return {
				icon: Codicon.debugDisconnect,
				message: localize('sessionRemoteHost.notRunning', "{0} is not running.", hostLabel),
				action: provider && isAgentHostProvider(provider) && provider.connect
					? {
						label: localize('sessionRemoteHost.start', "Start {0}", hostLabel),
						run: () => this.connect(),
					}
					: undefined,
			};
		}
		return {
			icon: Codicon.debugDisconnect,
			message: localize('sessionRemoteHost.disconnected', "Cannot reach {0}.", hostLabel),
			// A dropped tunnel or a sleeping machine is usually transient, so a
			// manual retry is worth offering even with nothing local to start.
			action: provider && isAgentHostProvider(provider) && provider.connect
				? {
					label: localize('sessionRemoteHost.retry', "Retry"),
					run: () => this.connect(),
				}
				: undefined,
		};
	}
}
