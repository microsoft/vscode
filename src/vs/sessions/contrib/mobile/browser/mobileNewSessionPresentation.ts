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
	searchWorkspaceTargetDirectly: true,
	getAccessibilityHelp: () => [
		localize('mobileNewSession.workspaceSearch', "On a phone, the Cloud workspace picker searches GitHub repositories. On a connected environment it searches folders on that host. Open a folder to browse its children, then use Select to choose it."),
		localize('mobileNewSession.choices', "Choose where the session runs, then choose a repository or workspace above the prompt. Use Tab and Shift+Tab to reach these controls, and Enter or Space to open their sheets. Press Escape to close a sheet and return to its control. Open the workspace picker{0} or the harness picker{1} directly when available. Starting a chat within a session keeps that session's host.", `<keybinding:${FOCUS_NEW_SESSION_WORKSPACE_PICKER_COMMAND_ID}>`, `<keybinding:${FOCUS_NEW_SESSION_HARNESS_PICKER_COMMAND_ID}>`),
		localize('mobileNewSession.input', "The prompt stays at the bottom of the welcome view. Use Add Context to attach files or other context. Open the configuration control beside it to choose the model, reasoning effort, mode, and permissions supported by the selected harness. Repository controls, when available, remain beside the prompt and do not collapse into a session-options tray."),
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
