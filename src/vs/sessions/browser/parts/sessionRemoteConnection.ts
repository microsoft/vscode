/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TimeoutTimer } from '../../../base/common/async.js';
import { Codicon } from '../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../base/common/errors.js';
import { Disposable, MutableDisposable } from '../../../base/common/lifecycle.js';
import { derived, derivedObservableWithCache, IObservable, IReader, observableSignal, observableValue } from '../../../base/common/observable.js';
import { localize } from '../../../nls.js';
import { isAgentHostProvider } from '../../common/agentHostSessionsProvider.js';
import { SessionRemoteConnectionFailureReason, SessionRemoteConnectionStatus } from '../../services/sessions/common/session.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../services/sessions/browser/sessionsProvidersService.js';
import { IRemoteHostUnavailableEmptyStateContent } from './remoteHostUnavailableEmptyState.js';
import { ISessionReadOnlyBannerContent } from './sessionReadOnlyBanner.js';

const RECONNECTING_BANNER_DELAY = 1_000;

type ConnectAttempt =
	| { readonly kind: 'active'; readonly session: IActiveSession; readonly message: string | undefined }
	| { readonly kind: 'failed'; readonly session: IActiveSession; readonly statusBefore: SessionRemoteConnectionStatus | undefined };

/**
 * Connection presentation and recovery state for the session rendered by a chat group.
 */
export class SessionRemoteConnection extends Disposable {

	private readonly _session = observableValue<IActiveSession | undefined>(this, undefined);
	private readonly _attempt = observableValue<ConnectAttempt | undefined>(this, undefined);
	private readonly _progressListener = this._register(new MutableDisposable());
	private readonly _deadlineSignal = observableSignal(this);

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

	readonly bannerContent: IObservable<ISessionReadOnlyBannerContent | undefined> = derived(this, reader => this._getRemoteConnectionBannerContent(reader));
	readonly recoveryContent: IObservable<IRemoteHostUnavailableEmptyStateContent | undefined> = derived(this, reader => this._getRemoteHostUnavailableContent(reader));

	constructor(
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
	) {
		super();
	}

	setSession(session: IActiveSession | undefined): void {
		this._progressListener.clear();
		this._attempt.set(undefined, undefined);
		this._session.set(session, undefined);
	}

	connect(): void {
		const session = this._session.get();
		if (!session) {
			return;
		}

		const attempt = this._attempt.get();
		if (attempt?.kind === 'active' && attempt.session === session) {
			return;
		}
		if (attempt?.kind === 'failed') {
			this._attempt.set(undefined, undefined);
		}

		const provider = this._sessionsProvidersService.getProvider(session.providerId);
		if (!provider || !isAgentHostProvider(provider) || !provider.connect) {
			return;
		}

		const statusBefore = session.remoteConnectionStatus?.get();
		this._attempt.set({ kind: 'active', session, message: undefined }, undefined);
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
			this._finishAttempt(session);
		} catch (error) {
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
		if (attempt?.kind !== 'active' || attempt.session !== session) {
			return undefined;
		}
		return attempt.message
			?? (status?.kind === 'connecting' || status?.kind === 'reconnecting'
				? localize('sessionRemoteHost.waitingForConnection', "Waiting for agent host connection...")
				: undefined);
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
		if (progressMessage) {
			return {
				title: localize('sessionRemoteHost.connectingTitle', "Connecting to {0}", hostLabel),
				description: localize('sessionRemoteHost.startingDescription', "Starting {0}.", hostLabel),
				progress: progressMessage,
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
			};
		}
		return {
			title: localize('sessionRemoteHost.disconnectedTitle', "Cannot Connect to {0}", hostLabel),
			description: localize('sessionRemoteHost.disconnected', "Cannot reach {0}.", hostLabel),
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
		if (progressMessage) {
			return { icon: Codicon.sync, message: progressMessage };
		}

		if (!status || status.kind === 'connected' || status.kind === 'connecting' || status.kind === 'incompatible') {
			return undefined;
		}

		if (status.kind === 'reconnecting') {
			return this._reconnectingBannerVisible.read(reader)
				? {
					icon: Codicon.sync,
					message: localize('sessionRemoteHost.reconnecting', "Reconnecting to {0}...", hostLabel),
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
		};
	}
}
