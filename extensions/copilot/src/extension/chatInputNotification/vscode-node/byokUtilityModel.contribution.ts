/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { IAuthenticationService } from '../../../platform/authentication/common/authentication';
import { IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { ILogService } from '../../../platform/log/common/logService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';

const NOTIFICATION_ID = 'copilot.byokUtilityModelHint';
const UTILITY_MODEL_SETTING = 'chat.utilityModel';
const UTILITY_SMALL_MODEL_SETTING = 'chat.utilitySmallModel';
const BYOK_UTILITY_MODEL_DEFAULT_SETTING = 'chat.byokUtilityModelDefault';
const MAIN_AGENT_BYOK_UTILITY_MODEL_DEFAULT = 'mainAgent';

/**
 * Shows a chat input notification in air-gapped BYOK scenarios (no GitHub
 * session) when at least one BYOK model is available but the utility model
 * settings are still defaults. Some utility flows are unavailable until the
 * user points them at a BYOK model or selects the main agent model as the BYOK utility default.
 *
 * The notification hides automatically once the user signs in, BYOK models
 * disappear, both utility settings are configured, or the main agent model is the BYOK utility default.
 */
export class ByokUtilityModelNotificationContribution extends Disposable {

	private _notification: vscode.ChatInputNotification | undefined;
	private _hasByokModels = false;
	private _refreshing = false;

	constructor(
		@IAuthenticationService private readonly _authService: IAuthenticationService,
		@IConfigurationService private readonly _configService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._authService.onDidAuthenticationChange(() => this._update()));
		this._register(vscode.lm.onDidChangeChatModels(() => this._update()));
		this._register(this._configService.onDidChangeConfiguration(e => {
			if (
				e.affectsConfiguration(UTILITY_MODEL_SETTING)
				|| e.affectsConfiguration(UTILITY_SMALL_MODEL_SETTING)
				|| e.affectsConfiguration(BYOK_UTILITY_MODEL_DEFAULT_SETTING)
			) {
				this._update();
			}
		}));

		this._update();
	}

	private async _refreshHasByokModels(): Promise<void> {
		if (this._refreshing) {
			return;
		}
		this._refreshing = true;
		try {
			const models = await vscode.lm.selectChatModels({});
			this._hasByokModels = models.some(m => m.vendor !== 'copilot');
		} catch (err) {
			this._logService.warn(`[ByokUtilityModelNotification] Failed to query language models: ${err}`);
		} finally {
			this._refreshing = false;
		}
	}

	private async _update(): Promise<void> {
		await this._refreshHasByokModels();

		const signedOut = !this._authService.anyGitHubSession;
		const utilityUnset = !this._isUtilityOverrideSet(UTILITY_MODEL_SETTING);
		const utilitySmallUnset = !this._isUtilityOverrideSet(UTILITY_SMALL_MODEL_SETTING);
		const byokUtilityModelDefault = this._configService.getNonExtensionConfig<unknown>(BYOK_UTILITY_MODEL_DEFAULT_SETTING);

		if (!signedOut || !this._hasByokModels || byokUtilityModelDefault === MAIN_AGENT_BYOK_UTILITY_MODEL_DEFAULT || (!utilityUnset && !utilitySmallUnset)) {
			this._hideNotification();
			return;
		}

		this._showNotification(utilityUnset, utilitySmallUnset);
	}

	private _isUtilityOverrideSet(configKey: string): boolean {
		const raw = this._configService.getNonExtensionConfig<unknown>(configKey);
		return typeof raw === 'string' && raw.length > 0;
	}

	private _showNotification(utilityUnset: boolean, utilitySmallUnset: boolean): void {
		const notification = this._ensureNotification();
		notification.severity = vscode.ChatInputNotificationSeverity.Info;
		notification.dismissible = true;
		notification.autoDismissOnMessage = false;

		if (utilityUnset && utilitySmallUnset) {
			notification.message = vscode.l10n.t('Set BYOK utility models');
			notification.description = vscode.l10n.t('Unlocks full AI features.');
			notification.actions = [
				{ label: vscode.l10n.t('Configure'), commandId: 'workbench.action.openSettings', commandArgs: [BYOK_UTILITY_MODEL_DEFAULT_SETTING] },
			];
		} else if (utilityUnset) {
			notification.message = vscode.l10n.t('Set BYOK utility model');
			notification.description = vscode.l10n.t('Unlocks full AI features.');
			notification.actions = [
				{ label: vscode.l10n.t('Configure'), commandId: 'workbench.action.openSettings', commandArgs: [UTILITY_MODEL_SETTING] },
			];
		} else {
			notification.message = vscode.l10n.t('Set BYOK small utility model');
			notification.description = vscode.l10n.t('Unlocks full AI features.');
			notification.actions = [
				{ label: vscode.l10n.t('Configure'), commandId: 'workbench.action.openSettings', commandArgs: [UTILITY_SMALL_MODEL_SETTING] },
			];
		}

		notification.show();
	}

	private _ensureNotification(): vscode.ChatInputNotification {
		if (!this._notification) {
			this._notification = vscode.chat.createInputNotification(NOTIFICATION_ID);
			this._register({ dispose: () => this._notification?.dispose() });
		}
		return this._notification;
	}

	private _hideNotification(): void {
		this._notification?.hide();
	}
}
