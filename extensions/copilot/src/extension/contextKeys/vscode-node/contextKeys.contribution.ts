/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commands, extensions, window } from 'vscode';
import { IAuthenticationService, MinimalModeError } from '../../../platform/authentication/common/authentication';
import { ContactSupportError, EnterpriseManagedError, GitHubLoginFailedError, InvalidTokenError, NotSignedUpError, RateLimitedError, SubscriptionExpiredError } from '../../../platform/authentication/vscode-node/copilotTokenManager';
import { SESSION_LOGIN_MESSAGE } from '../../../platform/authentication/vscode-node/session';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../platform/env/common/envService';
import { ILogService } from '../../../platform/log/common/logService';
import { ITelemetryService } from '../../../platform/telemetry/common/telemetry';
import { TelemetryData } from '../../../platform/telemetry/common/telemetryData';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { autorun } from '../../../util/vs/base/common/observableInternal';
import { GHPR_EXTENSION_ID } from '../../chatSessions/vscode/chatSessionsUriHandler';
import { EXTENSION_ID } from '../../common/constants';

const welcomeViewContextKeys = {
	Activated: 'github.copilot-chat.activated',
	Offline: 'github.copilot.offline',
	IndividualDisabled: 'github.copilot.interactiveSession.individual.disabled',
	IndividualExpired: 'github.copilot.interactiveSession.individual.expired',
	ContactSupport: 'github.copilot.interactiveSession.contactSupport',
	EnterpriseDisabled: 'github.copilot.interactiveSession.enterprise.disabled',
	InvalidToken: 'github.copilot.interactiveSession.invalidToken',
	RateLimited: 'github.copilot.interactiveSession.rateLimited',
	GitHubLoginFailed: 'github.copilot.interactiveSession.gitHubLoginFailed',
};

const chatQuotaExceededContextKey = 'github.copilot.chat.quotaExceeded';

const showLogViewContextKey = `github.copilot.chat.showLogView`;
const debugReportFeedbackContextKey = 'github.copilot.debugReportFeedback';

const previewFeaturesDisabledContextKey = 'github.copilot.previewFeaturesDisabled';

const debugContextKey = 'github.copilot.chat.debug';

const missingPermissiveSessionContextKey = 'github.copilot.auth.missingPermissiveSession';

export const prExtensionInstalledContextKey = 'github.copilot.prExtensionInstalled';

export class ContextKeysContribution extends Disposable {

	private _needsOfflineCheck = false;
	private _scheduledOfflineCheck: TimeoutHandle | undefined;
	private _showLogView = false;
	private _lastContextKey: string | undefined;

	constructor(
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
		@ILogService private readonly _logService: ILogService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@IEnvService private readonly _envService: IEnvService
	) {
		super();

		void this._inspectContext().catch(console.error);
		void this._updatePermissiveSessionContext().catch(console.error);
		this._register(_authenticationService.onDidAuthenticationChange(async () => await this._onAuthenticationChange()));
		this._register(commands.registerCommand('github.copilot.refreshToken', async () => await this._inspectContext()));
		this._register(commands.registerCommand('github.copilot.debug.showChatLogView', async () => {
			this._showLogView = true;
			await commands.executeCommand('setContext', showLogViewContextKey, true);
			await commands.executeCommand('copilot-chat.focus');
		}));
		this._register({ dispose: () => this._cancelPendingOfflineCheck() });
		this._register(window.onDidChangeWindowState(() => this._runOfflineCheck('Window state change')));

		this._updateShowLogViewContext();
		this._updateDebugContext();
		this._updatePrExtensionInstalledContext();

		const debugReportFeedback = this._configService.getConfigObservable(ConfigKey.TeamInternal.DebugReportFeedback);
		this._register(autorun(reader => {
			commands.executeCommand('setContext', debugReportFeedbackContextKey, debugReportFeedback.read(reader));
		}));

		// Listen for extension changes to update PR extension installed context
		this._register(extensions.onDidChange(() => {
			this._updatePrExtensionInstalledContext();
		}));
	}

	private _scheduleOfflineCheck() {
		this._cancelPendingOfflineCheck();
		this._needsOfflineCheck = true;
		this._logService.debug(`[context keys] Scheduling offline check. Active: ${window.state.active}, focused: ${window.state.focused}.`);
		if (window.state.active && window.state.focused) {
			const delayInSeconds = 60;
			this._scheduledOfflineCheck = setTimeout(() => {
				this._scheduledOfflineCheck = undefined;
				this._runOfflineCheck('Scheduled offline check');
			}, delayInSeconds * 1000);
		}
	}

	private _runOfflineCheck(trigger: string) {
		this._logService.debug(`[context keys] ${trigger}. Needs offline check: ${this._needsOfflineCheck}, active: ${window.state.active}, focused: ${window.state.focused}.`);
		if (this._needsOfflineCheck && window.state.active && window.state.focused) {
			this._inspectContext()
				.catch(err => this._logService.error(err));
		}
	}

	private _cancelPendingOfflineCheck() {
		this._needsOfflineCheck = false;
		if (this._scheduledOfflineCheck) {
			clearTimeout(this._scheduledOfflineCheck);
			this._scheduledOfflineCheck = undefined;
		}
	}

	private async _inspectContext() {
		this._logService.debug(`[context keys] Updating context keys.`);
		this._cancelPendingOfflineCheck();
		const allKeys = Object.values(welcomeViewContextKeys);
		let error: unknown | undefined = undefined;
		let key: string | undefined;
		try {
			await this._authenticationService.getCopilotToken();
			key = welcomeViewContextKeys.Activated;
		} catch (e: any) {
			error = e;
			const reason = e.message || e;
			const data = TelemetryData.createAndMarkAsIssued({ reason });
			this._telemetryService.sendGHTelemetryErrorEvent('activationFailed', data.properties, data.measurements);
			const message =
				reason === 'GitHubLoginFailed'
					? SESSION_LOGIN_MESSAGE
					: `GitHub Copilot could not connect to server. Extension activation failed: "${reason}"`;
			this._logService.error(message);
		}

		if (error instanceof NotSignedUpError) {
			key = welcomeViewContextKeys.IndividualDisabled;
		} else if (error instanceof SubscriptionExpiredError) {
			key = welcomeViewContextKeys.IndividualExpired;
		} else if (error instanceof EnterpriseManagedError) {
			key = welcomeViewContextKeys.EnterpriseDisabled;
		} else if (error instanceof ContactSupportError) {
			key = welcomeViewContextKeys.ContactSupport;
		} else if (error instanceof InvalidTokenError) {
			key = welcomeViewContextKeys.InvalidToken;
		} else if (error instanceof GitHubLoginFailedError) {
			key = welcomeViewContextKeys.GitHubLoginFailed;
		} else if (error) {
			if (!extensions.getExtension(EXTENSION_ID)?.isActive) {
				if (error instanceof RateLimitedError) {
					key = welcomeViewContextKeys.RateLimited;
				} else {
					key = welcomeViewContextKeys.Offline;
				}
			}
			this._scheduleOfflineCheck();
		}

		if (key) {
			if (key !== this._lastContextKey) {
				this._logService.info(`[context keys] Setting context key: ${key}`);
				this._lastContextKey = key;
			}
			commands.executeCommand('setContext', key, true);
		}

		// Unset all other context keys
		for (const contextKey of allKeys) {
			if (contextKey !== key) {
				commands.executeCommand('setContext', contextKey, false);
			}
		}

		await this._updatePermissiveSessionContext();
	}

	private async _updateQuotaExceededContext() {
		try {
			const copilotToken = await this._authenticationService.getCopilotToken();
			commands.executeCommand('setContext', chatQuotaExceededContextKey, copilotToken.isChatQuotaExceeded);
		} catch (e) {
			commands.executeCommand('setContext', chatQuotaExceededContextKey, false);
		}
	}

	private async _updatePreviewFeaturesDisabledContext() {
		try {
			const copilotToken = await this._authenticationService.getCopilotToken();
			const disabled = !copilotToken.isEditorPreviewFeaturesEnabled();
			if (disabled) {
				this._logService.warn(`Copilot preview features are disabled by organizational policy. Learn more: https://aka.ms/github-copilot-org-enable-features`);
			}
			commands.executeCommand('setContext', previewFeaturesDisabledContextKey, disabled);
		} catch (e) {
			commands.executeCommand('setContext', previewFeaturesDisabledContextKey, undefined);
		}
	}

	private _updateShowLogViewContext() {
		if (this._showLogView) {
			return;
		}

		this._showLogView = !!this._authenticationService.copilotToken?.isInternal || !this._envService.isProduction();
		if (this._showLogView) {
			commands.executeCommand('setContext', showLogViewContextKey, this._showLogView);
		}
	}

	private _updateDebugContext() {
		commands.executeCommand('setContext', debugContextKey, !this._envService.isProduction());
	}

	private _updatePrExtensionInstalledContext() {
		const isPrExtensionInstalled = !!extensions.getExtension(GHPR_EXTENSION_ID);
		commands.executeCommand('setContext', prExtensionInstalledContextKey, isPrExtensionInstalled);
	}

	private async _onAuthenticationChange() {
		this._inspectContext();
		this._updateQuotaExceededContext();
		this._updatePreviewFeaturesDisabledContext();
		this._updateShowLogViewContext();
		this._updatePermissiveSessionContext();
	}

	private async _updatePermissiveSessionContext() {
		let hasPermissiveSession = false;
		let missingPermissiveSession = false;
		if (!this._authenticationService.isMinimalMode) {
			try {
				hasPermissiveSession = !!(await this._authenticationService.getGitHubSession('permissive', { silent: true }));
			} catch (error) {
				if (!(error instanceof MinimalModeError)) {
					this._logService.trace(`[context keys] Failed to resolve permissive session: ${error instanceof Error ? error.message : String(error)}`);
					hasPermissiveSession = !!this._authenticationService.permissiveGitHubSession;
				}
			}
			missingPermissiveSession = !hasPermissiveSession;
		}
		commands.executeCommand('setContext', missingPermissiveSessionContextKey, missingPermissiveSession);
	}
}
