/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IReader, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { isAgentHostProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { getProjectBoardSessionKey } from '../common/projectBoardModel.js';
import { MANAGE_REMOTE_AGENT_HOSTS_COMMAND_ID, SHOW_CONNECTION_DIAGNOSTICS_COMMAND_ID } from '../../../common/sessionCommands.js';

/** One user-initiated connection attempt per provider, shared by every board surface. */
export class ProjectBoardRemoteRecovery extends Disposable {
	private readonly attempts = new Map<string, Promise<void>>();
	private readonly attemptStores = this._register(new DisposableMap<string, DisposableStore>());
	readonly progress = observableValue<ReadonlyMap<string, string>>(this, new Map());
	private readonly providerChanges = observableSignalFromEvent(this, this.providers.onDidChangeProviders);

	constructor(
		@ISessionsProvidersService private readonly providers: ISessionsProvidersService,
		@ICommandService private readonly commands: ICommandService,
		@INotificationService private readonly notifications: INotificationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	includeUnavailableSessions(sessions: readonly ISession[], reader: IReader): ISession[] {
		this.providerChanges.read(reader);
		const result = [...sessions];
		const keys = new Set(result.map(getProjectBoardSessionKey));
		for (const provider of this.providers.getProviders()) {
			if (!isAgentHostProvider(provider) || !provider.connectionStatus || provider.connectionStatus.read(reader).kind === 'connected') {
				continue;
			}
			for (const session of provider.getUnavailableSessions?.() ?? []) {
				const key = getProjectBoardSessionKey(session);
				if (!keys.has(key)) {
					result.push(session);
					keys.add(key);
				}
			}
		}
		return result;
	}

	resolve(providerId: string): Promise<void> {
		const existing = this.attempts.get(providerId);
		if (existing) {
			return existing;
		}
		const attempt = Promise.resolve().then(() => this.connect(providerId)).finally(() => {
			this.attempts.delete(providerId);
			this.setProgress(providerId, undefined);
		});
		this.attempts.set(providerId, attempt);
		this.setProgress(providerId, localize('projectBoard.resolvingRemote', "Resolving remote connection..."));
		return attempt;
	}

	async showDetails(): Promise<void> {
		try {
			await this.commands.executeCommand(SHOW_CONNECTION_DIAGNOSTICS_COMMAND_ID);
		} catch (error) {
			this.logService.error('[ProjectBoard] Could not open remote connection information', error);
			this.notifications.error(localize('projectBoard.connectionDetailsFailed', "Could not open connection information. {0}", toErrorMessage(error)));
		}
	}

	private async connect(providerId: string): Promise<void> {
		if (this._store.isDisposed) {
			return;
		}
		const store = new DisposableStore();
		this.attemptStores.set(providerId, store);
		try {
			const provider = this.providers.getProvider(providerId);
			if (!provider || !isAgentHostProvider(provider) || !provider.connect
				|| provider.connectionStatus?.get().kind === 'connected' || provider.connectionStatus?.get().kind === 'incompatible') {
				// A withdrawn host or a missing chat on a healthy host needs discovery/diagnosis, not a destructive reconnect.
				await this.commands.executeCommand(MANAGE_REMOTE_AGENT_HOSTS_COMMAND_ID);
				return;
			}
			const state = provider.connectionStatus?.get();
			if (state?.kind === 'connecting') {
				return;
			}
			if (state?.kind === 'reconnecting' && provider.reconnectNow) {
				provider.reconnectNow();
				return;
			}
			if (provider.onDidReportConnectProgress && provider.remoteAddress) {
				store.add(provider.onDidReportConnectProgress(progress => {
					if (progress.connectionKey === provider.remoteAddress && this.providers.getProvider(providerId) === provider) {
						this.setProgress(providerId, progress.message);
					}
				}));
			}
			await provider.connect();
			if (!this._store.isDisposed && this.providers.getProvider(providerId) === provider && provider.connectionStatus?.get().kind === 'disconnected') {
				this.notifications.warn(localize('projectBoard.remoteStillUnavailable', "{0} is still unavailable. Check that the remote host and tunnel are running, or use Connection Details. The chat and its placement have not been removed.", provider.label));
			}
		} catch (error) {
			if (!this._store.isDisposed) {
				if (isCancellationError(error)) {
					this.logService.info('[ProjectBoard] Remote connection recovery cancelled');
				} else {
					this.logService.error('[ProjectBoard] Remote connection recovery failed', error);
					this.notifications.error(localize('projectBoard.remoteRecoveryFailed', "Could not restore the remote connection. {0} Use Connection Details to investigate, then try Resolve again.", toErrorMessage(error)));
				}
			}
		} finally {
			this.attemptStores.deleteAndDispose(providerId);
		}
	}

	private setProgress(providerId: string, message: string | undefined): void {
		if (this._store.isDisposed) {
			return;
		}
		const next = new Map(this.progress.get());
		if (message === undefined) {
			next.delete(providerId);
		} else {
			next.set(providerId, message);
		}
		this.progress.set(next, undefined);
	}
}
