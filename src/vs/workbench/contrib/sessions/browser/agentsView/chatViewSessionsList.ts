/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStyleOverride } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IAgentSession } from '../../../chat/browser/agentSessions/agentSessionsModel.js';
import { IChatViewSessionsList, IChatViewSessionsListControl, IChatViewSessionsListProvider } from '../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../views/sessionsList.js';

/** The sessions list of the Chat view, as the Chat view acts on it. */
class ChatViewSessionsListControl implements IChatViewSessionsListControl {

	constructor(private readonly _list: SessionsList) { }

	setVisible(visible: boolean): void { this._list.setVisible(visible); }
	layout(height: number, width: number): void { this._list.layout(height, width); }
	focus(): void { this._list.focus(); }
	scrollToTop(): void { this._list.focus(); }
	refresh(): void { this._list.refresh(); }
	async update(): Promise<boolean> {
		this._list.update();
		return true;
	}
	reveal(sessionResource: URI): boolean { return this._list.reveal(sessionResource); }
	clearFocus(): void { this._list.clearFocus(); }
	hasFocusOrSelection(): boolean { return this._list.hasFocusOrSelection(); }
	/** The sessions of the Chat view's own list that have focus: none of those here. */
	getFocus(): IAgentSession[] { return []; }
	dispose(): void { this._list.dispose(); }
}

/**
 * Gives the Chat view the sessions of the Agents window as its sessions list. A session opens with `open`: in the Chat view,
 * or in the chat part while `sessionsOnly`, when the Chat view shows only the sessions.
 */
export class ChatViewSessionsListProvider implements IChatViewSessionsListProvider {

	constructor(
		private readonly _sessionsOnly: IObservable<boolean>,
		private readonly _open: (session: ISession, chatResource: URI | undefined, preserveFocus: boolean) => Promise<void>,
	) { }

	create(container: HTMLElement, instantiationService: IInstantiationService, options: { readonly overrideStyles: IStyleOverride<IListStyles> }): IChatViewSessionsList {
		const { sessionsManagementService, workspaceContextService } = instantiationService.invokeFunction(accessor => ({
			sessionsManagementService: accessor.get(ISessionsManagementService),
			workspaceContextService: accessor.get(IWorkspaceContextService),
		}));
		// The sessions of the window's folders, while it has some
		const scoped = observableFromEvent(workspaceContextService.onDidChangeWorkspaceFolders, () => workspaceContextService.getWorkspace().folders.length > 0);
		const list = instantiationService.createInstance(SessionsList, container, {
			grouping: () => SessionsGrouping.Date,
			sorting: () => SessionsSorting.Updated,
			overrideStyles: options.overrideStyles,
			scoped,
			onSessionOpen: (resource: URI, preserveFocus: boolean) => {
				const session = sessionsManagementService.getSession(resource);
				return session ? this._open(session, undefined, preserveFocus).catch(onUnexpectedError) : undefined;
			},
			onChatOpen: (session: ISession, chat: IChat, preserveFocus: boolean) => this._open(session, chat.resource, preserveFocus).catch(onUnexpectedError),
		});
		return { control: new ChatViewSessionsListControl(list), hasHeader: false, sessionsOnly: this._sessionsOnly };
	}
}
