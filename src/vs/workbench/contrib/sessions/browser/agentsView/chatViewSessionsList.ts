/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItem } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { IDropdownMenuActionViewItemOptions } from '../../../../../base/browser/ui/dropdown/dropdownActionViewItem.js';
import { IAction } from '../../../../../base/common/actions.js';
import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStyleOverride } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IAgentSession } from '../../../chat/browser/agentSessions/agentSessionsModel.js';
import { IChatViewSessionsList, IChatViewSessionsListControl, IChatViewSessionsListProvider } from '../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { SessionsView } from '../views/sessionsView.js';
import { createEditorWindowSessionsScope, createEditorWindowSessionsView } from './editorWindowSessionsList.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { localize } from '../../../../../nls.js';
import { IDisposable } from '../../../../../base/common/lifecycle.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { ChatViewSessionsListHelpHint } from '../chatView/chatViewSessionsListAccessibilityHelp.js';

/** The shared sessions list of an editor window, embedded in the Chat view, as the Chat view acts on it. */
class ChatViewSessionsListControl implements IChatViewSessionsListControl {

	constructor(
		private readonly _view: SessionsView,
		private readonly _helpHint: IDisposable | undefined,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
	) { }

	setVisible(visible: boolean): void { this._view.setVisible(visible); }
	layout(height: number, width: number): void {
		this._view.orthogonalSize = width;
		this._view.layout(height);
	}
	focus(): void { this._view.focus(); }
	scrollToTop(): void { this._view.focus(); }
	refresh(): void { this._view.sessionsControl?.refresh(); }
	async update(): Promise<boolean> {
		this._view.sessionsControl?.update();
		return true;
	}
	/** Reveals the session of `resource`, which the Chat view gives as the chat it shows, such as a peer chat of a session. */
	reveal(resource: URI): boolean {
		const sessionResource = this._sessionsManagementService.getSessionForChatResource(resource)?.session.resource ?? resource;
		return this._view.sessionsControl?.reveal(sessionResource) ?? false;
	}
	clearFocus(): void { this._view.sessionsControl?.clearFocus(); }
	hasFocusOrSelection(): boolean { return this._view.sessionsControl?.hasFocusOrSelection() ?? false; }
	/** The sessions of the Chat view's own list that have focus: none of those here. */
	getFocus(): IAgentSession[] { return []; }
	openFind(): void { this._view.openFind(); }
	createActionViewItem(action: IAction, options?: IDropdownMenuActionViewItemOptions): IActionViewItem | undefined { return this._view.createActionViewItem(action, options); }
	dispose(): void {
		this._helpHint?.dispose();
		this._view.dispose();
	}
}

/**
 * Gives the Chat view the sessions of the Agents window as its sessions list. Its sessions open where the window presents them:
 * in the Chat view, or in the chat part while the Chat view shows only the sessions. The Chat view keeps its own chat input, for
 * new chats and the chats it shows.
 */
export class ChatViewSessionsListProvider implements IChatViewSessionsListProvider {

	constructor(
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	create(container: HTMLElement, instantiationService: IInstantiationService, _options: { readonly overrideStyles: IStyleOverride<IListStyles> }): IChatViewSessionsList {
		// The Sessions view of an editor window, as the Agents viewlet shows it, with the actions of its header in the title of the
		// Chat view: embedded in the Chat view, whose id it takes, and found by the actions of the list through the locator it registers with
		const view = instantiationService.createInstance(createEditorWindowSessionsView(createEditorWindowSessionsScope(this, this._workspaceContextService), 'title'), {
			id: ChatViewId,
			title: localize('chatViewSessions.title', "Sessions"),
			expanded: true,
		});
		view.headerVisible = false;
		view.render();
		container.appendChild(view.element);
		view.setVisible(true);
		// How to open the list's accessibility help, which screen readers tell in the list
		const sessionsList = view.sessionsControl;
		const helpHint = sessionsList && instantiationService.createInstance(ChatViewSessionsListHelpHint, sessionsList);
		return {
			control: instantiationService.createInstance(ChatViewSessionsListControl, view, helpHint),
			hasHeader: true,
		};
	}
}
