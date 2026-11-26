/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/defaultNewSessionPresentation.css';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { logSettingExperimentTrigger } from '../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { AgentsWindowUsage } from '../../../chat/common/agentsWindowUsage.js';
import { COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING } from '../../common/chatConstants.js';
import { FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID } from '../../common/sessionCommands.js';
import { INewSessionPresentation, INewSessionPresentationController, INewSessionWorkspaceOptions, INewSessionWorkspacePresentation } from '../newSessionPresentation.js';
import { IconOnlySessionPickers } from './iconOnlySessionPickers.js';
import { getStoredSessionOptionsExpanded, SessionOptionsRow, storeSessionOptionsExpanded } from './sessionOptionsRow.js';

const STORAGE_KEY_NESTED_SESSION_OPTIONS_EXPANDED = 'sessions.nestedSession.sessionOptionsExpanded';

export const defaultNewSessionPresentation: INewSessionPresentation = {
	getAccessibilityHelp: (screenReaderOptimized, agentPickerInAttachContextMenu) => [
		localize('sessionsChat.disabledPickerNavigation', "The Left and Right arrow keys also reach disabled session controls, such as Copilot when Cloud is selected, so you can inspect their current value. Disabled controls cannot be activated and are skipped by Tab."),
		agentPickerInAttachContextMenu
			? localize('sessionsChat.newSessionInputControls.agentInAttachContext', "When an Agent picker is available in a new or running session, it appears in Add Context when the default agent is selected. Open Add Context and choose Agent to select an agent. A one-time spotlight may explain this change. Activate Understood or press Escape to dismiss it, or activate the highlighted Add Context action to open the menu and dismiss the tip. While a custom agent is selected, the Agent picker appears in its usual position. Selecting the default agent moves it back into Add Context. Other new-session controls remain in their layout-specific positions. Use Tab to reach toolbar controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker.")
			: localize('sessionsChat.newSessionInputControls.experimental', "Inside the new-session prompt, the controls appear in this order: Add Context, Agent, Mode and Permissions, and Model. Which controls are available depends on the selected harness. Use Tab to reach the controls, arrow keys to navigate toolbar items, and Enter or Space to open a picker."),
		localize('sessionsChat.compactSessionPickers', "When space is limited, the new-session pickers show icons instead of labels without moving to another row. The workspace name remains visible. Icon-only pickers retain their accessible names and tooltips; activate them to view and change the current selection."),
		localize('sessionsChat.newSessionPickers', "While focus is in a new-session composer or its pickers, open and focus the workspace picker{0} or the harness picker{1}. Focus either picker control and open its context menu{2} to configure its keybinding. The context menu also offers Collapse to Icon and Show Session Options Toggle. Hiding the toggle keeps the session options available, and the same context menu restores it. These choices persist after restarting.", `<keybinding:${FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID}>`, `<keybinding:${FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID}>`, '<keybinding:editor.action.showContextMenu>'),
		localize('sessionsChat.pickerShortcuts', "While the new-session input has focus, open the environment picker{0}, branch picker{1}, or Branch/New Worktree picker{2}. Focus Sync Changes{3}, then press Enter to synchronize. These shortcuts are available only when the corresponding control is available and expand hidden session options before focusing them.", '<keybinding:sessions.focusNewSessionEnvironmentPicker>', '<keybinding:sessions.focusNewSessionBranchPicker>', '<keybinding:sessions.focusNewSessionWorktreePicker>', '<keybinding:sessions.focusSessionSyncAction>'),
		screenReaderOptimized
			? localize('sessionsChat.sessionOptions.screenReader', "Above the new-session input, the workspace, repository and harness pickers are shown. As the chat narrows, picker labels are replaced by icons one at a time from right to left, except for the workspace name. Labels return when more space is available. Use Tab and Shift+Tab, or the Left and Right Arrow keys, to move between these controls. Press Enter or Space to open a picker, use the Up and Down Arrow keys to navigate its options, and press Escape to close it and return focus to its control. The isolation picker offers New Worktree to create a separate copy for the session, or Branch to work in the existing repository. The branch picker chooses the base branch for a new worktree or checks out a branch in the existing repository. These controls stay expanded while a screen reader is active.")
			: localize('sessionsChat.sessionOptions', "Above the new-session input, the workspace, repository and harness pickers are shown initially. As the chat narrows, picker labels are replaced by icons one at a time from right to left, except for the workspace name. Labels return when more space is available. Use Tab and Shift+Tab, or the Left and Right Arrow keys, to move between these controls. Press Enter or Space to open a picker, use the Up and Down Arrow keys to navigate its options, and press Escape to close it and return focus to its control. The isolation picker offers New Worktree to create a separate copy for the session, or Branch to work in the existing repository. The branch picker chooses the base branch for a new worktree or checks out a branch in the existing repository. Hide Session Options collapses these controls without changing your selections. Show Session Options or the Focus New Session Harness Picker command expands the controls again."),
	],
	create: (isNewChatInSession, instantiationService) => instantiationService.createInstance(DefaultNewSessionPresentation, isNewChatInSession),
};

export class DefaultNewSessionPresentation extends Disposable implements INewSessionPresentationController {
	private readonly _sessionOptionsExpanded = observableValue(this, true);
	private readonly _usage: AgentsWindowUsage;

	constructor(
		private readonly isNewChatInSession: boolean,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IAccessibilityService private readonly accessibilityService: IAccessibilityService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this._usage = new AgentsWindowUsage(storageService);
		if (isNewChatInSession) {
			this._sessionOptionsExpanded.set(storageService.getBoolean(STORAGE_KEY_NESTED_SESSION_OPTIONS_EXPANDED, StorageScope.PROFILE)
				?? getStoredSessionOptionsExpanded(storageService) ?? true, undefined);
		} else {
			this._restoreSessionOptionsExpanded();
		}
	}

	render(container: HTMLElement, content: HTMLElement): void {
		container.classList.add('default-new-session');
		content.classList.add('experimental-new-session-composer');
	}

	renderWorkspaceOptions(container: HTMLElement, row: HTMLElement, options: INewSessionWorkspaceOptions): INewSessionWorkspacePresentation {
		const store = new DisposableStore();
		const sessionOptions = store.add(new SessionOptionsRow(row, container, {
			user: this.isNewChatInSession ? 'NewChatInSessionWidget.sessionOptions' : 'NewChatWidget.sessionOptions',
			hoverDelegate: options.hoverDelegate,
			screenReaderOptimized: observableFromEvent(this, this.accessibilityService.onDidChangeScreenReaderOptimized, () => this.accessibilityService.isScreenReaderOptimized()),
			expanded: this._sessionOptionsExpanded,
			collapsedShowIcons: observableFromEvent(this,
				Event.filter(this.configurationService.onDidChangeConfiguration, event => event.affectsConfiguration(COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING)),
				() => this.configurationService.getValue<boolean>(COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING)),
			hasDetails: options.hasDetails,
			setExpanded: expanded => this._setSessionOptionsExpandedFromUser(expanded),
			onDidCollapse: this.isNewChatInSession ? undefined : () => logSettingExperimentTrigger(this.telemetryService, COLLAPSED_SESSION_OPTIONS_SHOW_ICONS_SETTING),
			onDidChangeLayout: options.onDidChangeLayout,
			iconOnlyPickers: this.isNewChatInSession ? undefined : store.add(this.instantiationService.createInstance(IconOnlySessionPickers, element => options.getRepositoryControlId(element))),
		}));
		return {
			sessionTypePickerHost: sessionOptions.details,
			repositoryControlsHost: sessionOptions.repositoryControlsHost,
			layout: () => sessionOptions.layout(),
			dispose: () => store.dispose(),
		};
	}

	revealOptions(): void {
		this._sessionOptionsExpanded.set(true, undefined);
	}

	private _restoreSessionOptionsExpanded(): void {
		const storedExpanded = getStoredSessionOptionsExpanded(this.storageService);
		let initialExpanded = storedExpanded ?? true;
		if (storedExpanded === undefined && !(this._usage.createdSessionCount > 0)) {
			logSettingExperimentTrigger(this.telemetryService, NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING);
			initialExpanded = this.configurationService.getValue<boolean>(NEW_SESSION_COMPOSER_OPTIONS_EXPANDED_SETTING) ?? true;
		}
		this._sessionOptionsExpanded.set(initialExpanded, undefined);
	}

	private _setSessionOptionsExpandedFromUser(expanded: boolean): void {
		this._sessionOptionsExpanded.set(expanded, undefined);
		if (this.isNewChatInSession) {
			this.storageService.store(STORAGE_KEY_NESTED_SESSION_OPTIONS_EXPANDED, expanded, StorageScope.PROFILE, StorageTarget.USER);
		} else {
			storeSessionOptionsExpanded(this.storageService, expanded);
		}
	}
}
