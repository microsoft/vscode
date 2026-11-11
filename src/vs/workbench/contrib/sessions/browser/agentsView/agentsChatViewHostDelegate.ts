/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IChatViewHostDelegate, IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { getAgentsChatPartComposerTarget, IAgentsChatPartService } from './agentsChatPart.js';

/** How long it waits for a session to load, or for the widget of a chat it shows to be created. */
const WAIT_TIMEOUT = 5_000;

/**
 * Shows in the chat part what the Chat view would show, which the chat part replaces in an editor window with the Agents
 * view: the window's active chat, a new-session composer, or the chat of a session. It shows the chats of sessions only:
 * not local chat, which the Agents view does not show.
 */
export class AgentsChatViewHostDelegate implements IChatViewHostDelegate {

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
	) { }

	// The chat part and the sessions start as a request comes, not as the window starts, as an injected delayed service would
	// once the window is idle: until the chat part or the Sessions view first shows, nothing of them runs
	private get _chatPart(): IAgentsChatPartService {
		return this._instantiationService.invokeFunction(accessor => accessor.get(IAgentsChatPartService));
	}

	private get _sessionsManagementService(): ISessionsManagementService {
		return this._instantiationService.invokeFunction(accessor => accessor.get(ISessionsManagementService));
	}

	async reveal(preserveFocus: boolean | undefined): Promise<IChatWidget | undefined> {
		await this._chatPart.show(this._composerTarget(), { preserveFocus });
		const active = this._chatPart.activeChat.get();
		return active && this._waitForWidget(active.chat.resource);
	}

	async openSession(sessionResource: URI, preserveFocus: boolean | undefined): Promise<IChatWidget | undefined> {
		const owner = await this._findSession(sessionResource);
		if (!owner) {
			return undefined;
		}
		await this._chatPart.openChat(owner.session, owner.chat.resource, { preserveFocus });
		return this._waitForWidget(owner.chat.resource);
	}

	async toggle(): Promise<void> {
		if (this._layoutService.isVisible(Parts.CHAT_PART)) {
			this._layoutService.setPartHidden(true, Parts.CHAT_PART);
		} else {
			await this._chatPart.show(this._composerTarget());
		}
	}

	prefillInput(text: string): Promise<void> {
		return this._chatPart.prefillComposer(this._composerTarget(), text);
	}

	private _composerTarget() {
		return getAgentsChatPartComposerTarget(this._workspaceContextService);
	}

	/** The session of the chat of `resource`, as the sessions load: a chat no session has, such as a local chat, has none. */
	private async _findSession(resource: URI) {
		const find = () => this._sessionsManagementService.getSessionForChatResource(resource);
		const found = find();
		if (found) {
			return found;
		}
		const store = new DisposableStore();
		try {
			return await raceTimeout(new Promise<ReturnType<typeof find>>(resolve => {
				store.add(this._sessionsManagementService.onDidChangeSessions(() => {
					const session = find();
					if (session) {
						resolve(session);
					}
				}));
			}), WAIT_TIMEOUT);
		} finally {
			store.dispose();
		}
	}

	/** The widget of the chat of `resource`, once the chat part's view of the chat creates it. */
	private async _waitForWidget(resource: URI): Promise<IChatWidget | undefined> {
		const find = () => this._chatWidgetService.getAllWidgets().find(widget => isEqual(widget.viewModel?.sessionResource, resource));
		const found = find();
		if (found) {
			return found;
		}
		const store = new DisposableStore();
		try {
			return await raceTimeout(new Promise<IChatWidget>(resolve => {
				const check = () => {
					const widget = find();
					if (widget) {
						resolve(widget);
					}
				};
				const watch = (widget: IChatWidget) => store.add(widget.onDidChangeViewModel(check));
				this._chatWidgetService.getAllWidgets().forEach(watch);
				store.add(this._chatWidgetService.onDidAddWidget(widget => {
					watch(widget);
					check();
				}));
			}), WAIT_TIMEOUT);
		} finally {
			store.dispose();
		}
	}
}
