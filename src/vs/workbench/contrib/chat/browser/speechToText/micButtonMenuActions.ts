/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getWindow } from '../../../../../base/browser/dom.js';
import { StandardMouseEvent } from '../../../../../base/browser/mouseEvent.js';
import { IAction, toAction } from '../../../../../base/common/actions.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { createConfigureKeybindingAction } from '../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';

/** Command that opens the microphone picker shared by dictation and Voice Mode. */
export const SELECT_MICROPHONE_COMMAND = 'workbench.action.chat.selectSpeechToTextMicrophone';
/** Command that cancels the active/preparing dictation session. */
const CANCEL_DICTATION_COMMAND = 'workbench.action.chat.cancelSpeechToText';
/** Command that tears down an active Voice Mode session. */
const VOICE_DISCONNECT_COMMAND = 'agentsVoice.disconnect';
/** Command that opens the Voice Mode settings; the affordance that used to live behind the toolbar gear. */
const VOICE_OPEN_SETTINGS_COMMAND = 'agentsVoice.openSettings';
/** Setting that enables dictation; toggled off by "Disable Dictation". */
const DICTATION_ENABLED_SETTING = 'dictation.enabled';
/** Setting that enables Voice Mode; toggled off by "Disable Voice Mode". */
const VOICE_ENABLED_SETTING = 'agents.voice.enabled';

/**
 * "Select Microphone" entry shared by every dictation / Voice Mode mic button
 * context menu. Opens the picker shared by both features.
 */
function createSelectMicrophoneAction(commandService: ICommandService): IAction {
	return toAction({
		id: SELECT_MICROPHONE_COMMAND,
		label: localize('mic.selectMicrophone', "Select Microphone"),
		run: () => commandService.executeCommand(SELECT_MICROPHONE_COMMAND),
	});
}

/**
 * "Disable Dictation" entry. Cancels any active/preparing dictation first so
 * disabling the setting doesn't leave the microphone capturing while the toolbar
 * affordance disappears, then turns off the feature setting.
 */
function createDisableDictationAction(commandService: ICommandService, configurationService: IConfigurationService): IAction {
	return toAction({
		id: 'chat.dictation.disable',
		label: localize('dictation.disable', "Disable Dictation"),
		run: async () => {
			await commandService.executeCommand(CANCEL_DICTATION_COMMAND);
			await configurationService.updateValue(DICTATION_ENABLED_SETTING, false);
		},
	});
}

/**
 * "Disable Voice Mode" entry. Tears down any active session first so disabling
 * the setting doesn't leave the microphone capturing while the toolbar
 * affordance disappears, then turns off the feature setting.
 */
function createDisableVoiceModeAction(commandService: ICommandService, configurationService: IConfigurationService): IAction {
	return toAction({
		id: 'chat.voiceMode.disable',
		label: localize('voiceMode.disable', "Disable Voice Mode"),
		run: async () => {
			await commandService.executeCommand(VOICE_DISCONNECT_COMMAND);
			await configurationService.updateValue(VOICE_ENABLED_SETTING, false);
		},
	});
}

/**
 * Actions for the dictation mic button context menu: "Configure Keybinding"
 * (always enabled so a removed binding can be restored), "Select Microphone"
 * and "Disable Dictation". `keybindingCommandId` is the stable command the
 * keybinding entry targets.
 */
export function getDictationContextMenuActions(commandService: ICommandService, configurationService: IConfigurationService, keybindingService: IKeybindingService, keybindingCommandId: string): IAction[] {
	return [
		createConfigureKeybindingAction(commandService, keybindingService, keybindingCommandId),
		createSelectMicrophoneAction(commandService),
		createDisableDictationAction(commandService, configurationService),
	];
}

/**
 * "Voice Mode Settings" entry. Opens the Voice Mode settings — the affordance
 * that used to live behind the toolbar gear button.
 */
function createVoiceModeSettingsAction(commandService: ICommandService): IAction {
	return toAction({
		id: VOICE_OPEN_SETTINGS_COMMAND,
		label: localize('voiceMode.openSettings', "Open Settings"),
		run: () => commandService.executeCommand(VOICE_OPEN_SETTINGS_COMMAND),
	});
}

/**
 * Actions for the Voice Mode mic button context menu, mirroring
 * {@link getDictationContextMenuActions} but with "Disable Voice Mode". The
 * "Configure Keybinding" entry opens the keybindings editor scoped to the Voice
 * Mode keybinding and "Voice Mode Settings" opens the Voice Mode settings — the
 * affordances that used to live behind the toolbar gear button.
 * `keybindingCommandId` is the stable command the keybinding entry targets.
 */
export function getVoiceModeContextMenuActions(commandService: ICommandService, configurationService: IConfigurationService, keybindingService: IKeybindingService, keybindingCommandId: string): IAction[] {
	return [
		createConfigureKeybindingAction(commandService, keybindingService, keybindingCommandId),
		createVoiceModeSettingsAction(commandService),
		createSelectMicrophoneAction(commandService),
		createDisableVoiceModeAction(commandService, configurationService),
	];
}

/**
 * Wire a right-click context menu onto a mic button. Stops the event before it
 * reaches the toolbar's generic context-menu handler so the mic-specific menu is
 * shown instead. Works for both `MenuEntryActionViewItem` containers and the
 * Agents-window custom mic `<div>`s.
 */
export function addMicButtonContextMenuListener(container: HTMLElement, getActions: () => IAction[], contextMenuService: IContextMenuService): IDisposable {
	return addDisposableListener(container, 'contextmenu', e => {
		e.preventDefault();
		e.stopPropagation();
		const event = new StandardMouseEvent(getWindow(container), e);
		contextMenuService.showContextMenu({
			getAnchor: () => event,
			getActions,
		});
	});
}
