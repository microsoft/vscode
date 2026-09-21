/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IntervalTimer, raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { observableValue, waitForState } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { INativeCliProxyConfiguration, INativeCliProxyModel, INativeCliProxyService, NativeCliProxyKind } from '../../../../../platform/agentHost/common/nativeCliProxy.js';
import { IDefaultAccountService } from '../../../../../platform/defaultAccount/common/defaultAccount.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { isManagedSettingsFreshnessBlocking } from '../../../../../platform/policy/common/managedSettingsFreshness.js';
import { ISessionTerminalAuthentication } from '../../../../services/terminal/browser/sessionTerminalService.js';

const HEARTBEAT_INTERVAL = 30_000;
/** A lease survives this many consecutive failed beats before the CLI is torn down. */
const MAX_HEARTBEAT_FAILURES = 3;

export class NativeCliSessionAuthentication extends Disposable implements ISessionTerminalAuthentication {
	readonly nativeLabel;
	readonly source;
	readonly model;
	private _leaseId: string | undefined;
	private _accountSessionId: string | undefined;
	private _proxy: INativeCliProxyService | undefined;
	private _heartbeatFailures = 0;
	private readonly _heartbeat = this._register(new IntervalTimer());
	private readonly _cancellation = new CancellationTokenSource();

	constructor(
		private readonly _sessionId: string,
		private readonly _kind: NativeCliProxyKind,
		source: 'native' | 'copilot' | undefined,
		model: INativeCliProxyModel | undefined,
		private readonly _canConfigure: () => boolean,
		private readonly _onChange: () => void,
		private readonly _onLeaseLost: (message: string) => void,
		@IAgentHostService private readonly _agentHost: IAgentHostService,
		@IDefaultAccountService private readonly _defaultAccount: IDefaultAccountService,
		@ILogService private readonly _logService: ILogService,
		@INotificationService private readonly _notificationService: INotificationService,
	) {
		super();
		this.nativeLabel = _kind === 'claude' ? localize('cliAccount.claude', "Claude Account") : localize('cliAccount.codex', "OpenAI Account");
		// New drafts supply Copilot explicitly; legacy records keep their original native billing.
		this.source = observableValue<'native' | 'copilot'>(this, source ?? 'native');
		this.model = observableValue(this, model);
		this._register(_agentHost.onAgentHostExit(() => {
			if (this._leaseId) {
				this._leaseId = undefined;
				this._proxy = undefined;
				this._lost(localize('nativeCliProxy.hostRestarted', "The Copilot connection stopped. Resume the CLI to reconnect; the native account was not used."));
			}
		}));
		this._register(_defaultAccount.onDidChangeDefaultAccount(account => {
			if (this._leaseId && account?.sessionId !== this._accountSessionId) {
				this._lost(localize('nativeCliProxy.accountChanged', "The Copilot account changed. Resume the CLI to authenticate again."));
			}
		}));
		this._register(_defaultAccount.onDidChangePolicyData(() => {
			if (this._leaseId && _defaultAccount.policyData?.managedSettingsActive) {
				this._lost(localize('nativeCliProxy.managedSettings', "Copilot-backed terminal sessions cannot apply your organization's managed settings. Use the standard chat harness instead."));
			}
		}));
		this._register(_defaultAccount.onDidChangeManagedSettingsFreshness(freshness => {
			if (this._leaseId && isManagedSettingsFreshnessBlocking(freshness)) {
				this._lost(localize('nativeCliProxy.settingsPending', "Copilot's required managed settings are unavailable. Use the standard chat harness to resolve the configuration before retrying."));
			}
		}));
	}

	get leaseId(): string | undefined {
		return this._leaseId;
	}

	setSource(source: 'native' | 'copilot'): void {
		this._assertConfigurable();
		this.source.set(source, undefined);
		this._onChange();
	}

	setModel(model: INativeCliProxyModel): void {
		this._assertConfigurable();
		this.model.set(model, undefined);
		this._onChange();
	}

	async getCopilotModels(): Promise<readonly INativeCliProxyModel[]> {
		const proxy = await this._resolveProxy(true);
		const models = await proxy.getNativeCliModels(this._kind);
		if (!models.length) {
			throw new Error(localize('nativeCliProxy.noModels', "No compatible models are available through this Copilot account."));
		}
		return models;
	}

	async prepare(): Promise<INativeCliProxyConfiguration | undefined> {
		if (this.source.get() !== 'copilot') {
			return undefined;
		}
		const proxy = await this._resolveProxy(true);
		// Honors a persisted or explicitly chosen model; without this the proxy silently
		// falls back to the first model in the catalog.
		const configuration = await proxy.startNativeCliProxy(this._sessionId, this._kind, this.model.get()?.id);
		this._leaseId = configuration.leaseId;
		if (this._store.isDisposed) {
			await this.release();
			throw new CancellationError();
		}
		this._startHeartbeat();
		return configuration;
	}

	async reconnect(leaseId: string | undefined): Promise<void> {
		if (this.source.get() !== 'copilot') {
			if (leaseId) {
				throw new Error(localize('nativeCliProxy.sourceMismatch', "The terminal authentication source does not match the saved session."));
			}
			return;
		}
		const proxy = await this._resolveProxy(false);
		if (!leaseId || !await proxy.retainNativeCliProxy(this._sessionId, leaseId)) {
			throw new Error(localize('nativeCliProxy.expired', "The Copilot connection for this terminal expired. Resume the CLI to reconnect."));
		}
		this._leaseId = leaseId;
		if (this._store.isDisposed) {
			await this.release();
			throw new CancellationError();
		}
		this._startHeartbeat();
	}

	async release(): Promise<void> {
		this._heartbeat.cancel();
		const leaseId = this._leaseId;
		this._leaseId = undefined;
		if (leaseId) {
			if (!this._proxy) {
				throw new Error('The native CLI proxy connection is unavailable');
			}
			await this._proxy.releaseNativeCliProxy(this._sessionId, leaseId);
		}
	}

	private async _resolveProxy(allowSignIn: boolean): Promise<INativeCliProxyService> {
		let account = await this._defaultAccount.getDefaultAccount();
		if (!account && allowSignIn) {
			account = await this._defaultAccount.signIn();
		}
		if (!account) {
			throw new Error(localize('nativeCliProxy.noAccount', "Sign in to GitHub Copilot in the Agents Window to use this account source."));
		}
		this._accountSessionId = account.sessionId;
		if (isManagedSettingsFreshnessBlocking(this._defaultAccount.managedSettingsFreshness)) {
			throw new Error(localize('nativeCliProxy.settingsPending', "Copilot's required managed settings are unavailable. Use the standard chat harness to resolve the configuration before retrying."));
		}
		if (this._defaultAccount.policyData?.managedSettingsActive) {
			throw new Error(localize('nativeCliProxy.managedSettings', "Copilot-backed terminal sessions cannot apply your organization's managed settings. Use the standard chat harness instead."));
		}
		this._agentHost.startAgentHost();
		// Cancellable: a host that never finishes authenticating would otherwise pin the
		// memoized start promise and wedge the session until the window is reloaded.
		await raceCancellationError(
			waitForState(this._agentHost.authenticationPending, pending => !pending),
			this._store.isDisposed ? CancellationToken.Cancelled : this._cancellation.token,
		);
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		const proxy = this._agentHost.nativeCliProxy;
		if (!proxy) {
			throw new Error(localize('nativeCliProxy.unavailable', "Copilot-backed CLI sessions require a local agent host."));
		}
		this._proxy = proxy;
		return proxy;
	}

	private _startHeartbeat(): void {
		const leaseId = this._leaseId;
		if (!leaseId) {
			return;
		}
		this._heartbeatFailures = 0;
		this._heartbeat.cancelAndSet(() => {
			if (!this._proxy) {
				this._lost(localize('nativeCliProxy.expired', "The Copilot connection for this terminal expired. Resume the CLI to reconnect."));
				return;
			}
			void this._proxy.retainNativeCliProxy(this._sessionId, leaseId).then(alive => {
				if (this._leaseId !== leaseId) {
					return;
				}
				if (alive) {
					this._heartbeatFailures = 0;
				} else {
					this._lost(localize('nativeCliProxy.expired', "The Copilot connection for this terminal expired. Resume the CLI to reconnect."));
				}
			}).catch(error => {
				if (this._leaseId !== leaseId) {
					return;
				}
				// A single failed beat is usually a transient IPC or token gap; tearing the
				// terminal down on the first one loses the user's in-flight work.
				if (++this._heartbeatFailures < MAX_HEARTBEAT_FAILURES) {
					this._logService.warn('Native CLI proxy heartbeat failed; retrying', error);
					return;
				}
				this._lost(toErrorMessage(error));
			});
		}, HEARTBEAT_INTERVAL);
	}

	private _lost(message: string): void {
		this._heartbeat.cancel();
		this._onLeaseLost(message);
		void this.release().catch(error => this._logService.warn('Could not release native CLI proxy', error));
		this._notificationService.error(message);
	}

	private _assertConfigurable(): void {
		if (!this._canConfigure()) {
			throw new Error(localize('nativeCliProxy.alreadyStarted', "Choose the account source when creating a new terminal session."));
		}
	}

	override dispose(): void {
		this._cancellation.dispose(true);
		super.dispose();
	}
}
