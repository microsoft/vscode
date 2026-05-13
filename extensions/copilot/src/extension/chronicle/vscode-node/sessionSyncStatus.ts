/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';
import { ConfigKey, IConfigurationService } from '../../../platform/configuration/common/configurationService';
import { IExperimentationService } from '../../../platform/telemetry/common/nullExperimentationService';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import { ISessionSyncStateService, type SessionSyncState } from '../common/sessionSyncStateService';

const statusTitle = l10n.t('Session Sync');
const sessionSyncDocsLink = 'https://aka.ms/vscode-copilot-session-sync';

/**
 * Shows session sync status in the chat status bar popup.
 *
 * Renders a contributed chat status item that displays the current
 * cloud sync state — not enabled, on, syncing, up to date, error, etc.
 * Follows the same pattern as ChatStatusWorkspaceIndexingStatus.
 */
export class SessionSyncStatus extends Disposable {

	private readonly _statusItem: vscode.ChatStatusItem;

	constructor(
		private readonly _syncStateService: ISessionSyncStateService,
		private readonly _configService: IConfigurationService,
		private readonly _expService: IExperimentationService,
	) {
		super();

		this._statusItem = this._register(vscode.window.createChatStatusItem('copilot.sessionSyncStatus'));
		this._statusItem.title = statusTitle;

		// Listen for sync state changes
		this._register(this._syncStateService.onDidChangeSyncState(state => this._renderState(state)));

		// Listen for config changes to show/hide
		this._register(vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('chat.localIndex.enabled')) {
				this._updateVisibility();
			}
		}));

		this._updateVisibility();
		this._renderState(this._syncStateService.syncState);
	}

	private _updateVisibility(): void {
		const localEnabled = this._configService.getExperimentBasedConfig(ConfigKey.LocalIndexEnabled, this._expService);
		if (!localEnabled || vscode.workspace.isAgentSessionsWorkspace) {
			this._statusItem.hide();
		} else {
			this._statusItem.show();
			this._renderState(this._syncStateService.syncState);
		}
	}

	private _renderState(state: SessionSyncState): void {
		// Don't render if localIndex is off — item should stay hidden
		const localEnabled = this._configService.getExperimentBasedConfig(ConfigKey.LocalIndexEnabled, this._expService);
		if (!localEnabled) {
			return;
		}

		this._statusItem.title = {
			label: statusTitle,
			link: sessionSyncDocsLink,
			helpText: l10n.t('Syncs session data to your GitHub.com account.'),
		};

		// description → shown as badge in collapsed header (icon + message)
		// detail → shown when expanded

		switch (state.kind) {
			case 'not-enabled':
				this._statusItem.description = l10n.t('Not enabled');
				this._statusItem.detail = `[${l10n.t('Enable?')}](command:workbench.action.openSettings?%5B%22chat.sessionSync.enabled%22%5D)`;
				this._statusItem.tooltip = l10n.t('Session sync is not enabled. Your data stays local to this device.');
				break;

			case 'disabled-by-policy':
				this._statusItem.description = `$(warning) ${l10n.t('Disabled by policy')}`;
				this._statusItem.detail = '';
				this._statusItem.tooltip = l10n.t('Session sync is disabled by your organization\'s policy.');
				break;

			case 'on':
				this._statusItem.description = `$(check) ${l10n.t('Enabled')}`;
				this._statusItem.detail = `[${l10n.t('Show insights?')}](command:workbench.action.chat.open?%7B%22query%22%3A%22%2Fchronicle%3Atips%22%7D)`;
				this._statusItem.tooltip = l10n.t('Your sessions are being synced and available across devices.');
				break;

			case 'up-to-date':
				this._statusItem.description = `$(check) ${l10n.t('{0} sessions synced', state.syncedCount)}`;
				this._statusItem.detail = `[${l10n.t('Show insights?')}](command:workbench.action.chat.open?%7B%22query%22%3A%22%2Fchronicle%3Atips%22%7D)`;
				this._statusItem.tooltip = l10n.t('Your sessions are being synced and available across devices.');
				break;

			case 'syncing':
				this._statusItem.description = `$(loading~spin) ${l10n.t('Syncing {0} session(s)\u2026', state.sessionCount)}`;
				this._statusItem.detail = '';
				this._statusItem.tooltip = l10n.t('Syncing {0} session(s)\u2026', state.sessionCount);
				break;

			case 'deleting':
				this._statusItem.description = `$(loading~spin) ${l10n.t('Deleting {0} session(s)\u2026', state.sessionCount)}`;
				this._statusItem.detail = '';
				this._statusItem.tooltip = l10n.t('Deleting {0} session(s)\u2026', state.sessionCount);
				break;

			case 'error':
				this._statusItem.description = `$(error) ${l10n.t('Sync error')}`;
				this._statusItem.detail = '';
				this._statusItem.tooltip = l10n.t('Something went wrong during the last sync. Try again later.');
				break;
		}
	}
}
