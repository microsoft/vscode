/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { AgentHostAhpJsonlLoggingSettingId } from '../../../../../platform/agentHost/common/agentService.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { AgentHostAgentDebugLogEnabledSettingId, AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING } from '../../common/promptSyntax/promptTypes.js';
import { isAgentHostSession } from './agentHostLogSources.js';

const $ = DOM.$;

/**
 * Returns the debug-log enablement setting that governs a given session.
 * Agent host (Copilot CLI) sessions are gated by the agent-host setting; all
 * other sessions use the local file-logging setting.
 */
export function getChatDebugLoggingSettingId(sessionResource: URI | undefined): string {
	return isAgentHostSession(sessionResource)
		? AgentHostAgentDebugLogEnabledSettingId
		: AGENT_DEBUG_LOG_FILE_LOGGING_ENABLED_SETTING;
}

/**
 * Whether agent debug logging is enabled for the given session. When this is
 * `false` no debug data is captured for the session, so the debug views should
 * surface a hint to enable the setting rather than empty content.
 */
export function isChatDebugLoggingEnabledForSession(configurationService: IConfigurationService, sessionResource: URI | undefined): boolean {
	return configurationService.getValue<boolean>(getChatDebugLoggingSettingId(sessionResource));
}

/**
 * Renders an "enable the setting" hint into `container` alongside a button
 * that opens the given setting. Shared by the debug views to explain why no
 * data is shown when the governing setting is turned off.
 */
function renderEnableSettingMessage(
	container: HTMLElement,
	settingId: string,
	message: string,
	preferencesService: IPreferencesService,
	disposables: DisposableStore,
): void {
	const wrapper = DOM.append(container, $('.chat-debug-logging-disabled'));
	DOM.append(wrapper, $('p.chat-debug-logging-disabled-message', undefined, message));

	const enableButton = disposables.add(new Button(wrapper, { ...defaultButtonStyles, secondary: true }));
	enableButton.element.style.width = 'auto';
	enableButton.label = localize('chatDebug.openSetting', "Enable in Settings");
	disposables.add(enableButton.onDidClick(() => {
		preferencesService.openSettings({ jsonEditor: false, query: settingId });
	}));
}

/**
 * Renders a message into `container` explaining that agent debug logging is
 * disabled for the session, alongside a button that opens the relevant setting.
 */
export function renderChatDebugLoggingDisabledMessage(
	container: HTMLElement,
	sessionResource: URI | undefined,
	preferencesService: IPreferencesService,
	disposables: DisposableStore,
): void {
	renderEnableSettingMessage(
		container,
		getChatDebugLoggingSettingId(sessionResource),
		localize('chatDebug.loggingDisabled', "Agent debug logging is turned off. Enable it to capture and view debug logs for this session."),
		preferencesService,
		disposables,
	);
}

/**
 * Whether AHP (client↔host protocol) logging is enabled. When `false` no
 * protocol frames are captured, so the AHP Log view surfaces a hint to enable
 * the setting instead of empty content.
 */
export function isWireLogLoggingEnabled(configurationService: IConfigurationService): boolean {
	return configurationService.getValue<boolean>(AgentHostAhpJsonlLoggingSettingId);
}

/**
 * Renders a message into `container` explaining that AHP logging is disabled,
 * alongside a button that opens the relevant setting.
 */
export function renderWireLogLoggingDisabledMessage(
	container: HTMLElement,
	preferencesService: IPreferencesService,
	disposables: DisposableStore,
): void {
	renderEnableSettingMessage(
		container,
		AgentHostAhpJsonlLoggingSettingId,
		localize('chatDebug.wireLogLoggingDisabled', "AHP logging is turned off. Enable it and reproduce the issue to capture and view client↔host protocol frames for this session."),
		preferencesService,
		disposables,
	);
}
