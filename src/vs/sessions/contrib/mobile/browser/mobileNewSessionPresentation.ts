/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/mobileNewSessionPresentation.css';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Menus } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { INewSessionPresentation, INewSessionPresentationController, INewSessionWorkspacePresentation } from '../../../../workbench/contrib/sessions/browser/newSessionPresentation.js';
import { FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID, FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID } from '../../../../workbench/contrib/sessions/common/sessionCommands.js';
import { renderMobileSessionToolbar } from './mobileSessionToolbar.js';

export const mobileNewSessionPresentation: INewSessionPresentation = {
	separateSessionControls: true,
	getAccessibilityHelp: () => [
		localize('mobileNewSession.choices', "Choose where the session runs, then choose a repository or workspace above the prompt. Use Tab and Shift+Tab to reach these controls, and Enter or Space to open their sheets. Press Escape to close a sheet and return to its control. Open the workspace picker{0} or the harness picker{1} directly when available. Starting a chat within a session keeps that session's host.", `<keybinding:${FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID}>`, `<keybinding:${FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID}>`),
		localize('mobileNewSession.input', "The prompt stays at the bottom of the welcome view. Use Add Context to attach files or other context. The model button beside Add Context opens Configure Session, where you can choose a model and adjust reasoning effort when supported. When available, mode and permissions can also be opened from the controls row above the prompt, alongside repository controls."),
	],
	create: (isNewChatInSession, instantiationService) => instantiationService.createInstance(MobileNewSessionPresentation, isNewChatInSession),
};

class MobileNewSessionPresentation extends Disposable implements INewSessionPresentationController {
	constructor(
		private readonly isNewChatInSession: boolean,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	render(container: HTMLElement, content: HTMLElement): void {
		container.classList.add('mobile-new-session');
		content.classList.add('mobile-new-session-content');
	}

	renderWorkspaceOptions(container: HTMLElement, row: HTMLElement): INewSessionWorkspacePresentation {
		const store = new DisposableStore();
		row.classList.add('mobile-new-session-choices');
		if (!this.isNewChatInSession) {
			store.add(renderMobileSessionToolbar(this.instantiationService, container, 'sessions-new-session-place-row', Menus.NewSessionPlace, row));
		}
		return { sessionTypePickerHost: row, dispose: () => store.dispose() };
	}
}
