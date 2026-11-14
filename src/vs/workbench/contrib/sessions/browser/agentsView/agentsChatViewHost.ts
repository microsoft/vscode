/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, onUnexpectedError } from '../../../../../base/common/errors.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { derived, IObservable } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { IChatWidget, IChatWidgetService } from '../../../chat/browser/chat.js';
import { IChatViewHost, IChatViewHostOpenOptions, IChatViewHostSessionStart, IChatViewHostSessionStartOptions, IChatViewHostShownSession } from '../../../chat/browser/chatViewHost.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { isAgentHostSessionResource, localChatSessionType } from '../../../chat/common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../chat/common/constants.js';
import { getChatSessionType, isUntitledChatSession } from '../../../chat/common/model/chatUri.js';
import { INewSessionTarget } from '../parts/chatView.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { IAgentsChatPartService } from './agentsChatPart.js';
import { getEditorWindowComposerTarget } from '../editorWindow/editorWindowSessionsPresenter.js';
import { AgentsViewAvailable } from './agentsChatPartContext.js';
import { IAgentsChatPartFrame } from './agentsChatPartFrame.js';
import { IAgentsViewProvidersService, waitForAgentsViewSession } from './agentsViewProviders.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';

/** How long it waits for the widget of a chat it shows to be created. */
const WAIT_TIMEOUT = 5_000;

/**
 * The host of the Chat view's chats in an editor window whose chat part replaces the Chat view: it shows in the chat part
 * the window's active chat, a new-session composer, or the chat of a session. It shows the chats of sessions only: it
 * leaves local chat and the chats of other kinds to the Chat view (see {@link canShow}).
 */
export class AgentsChatViewHost implements IChatViewHost {

	constructor(
		@IAgentsChatPartService private readonly _chatPart: IAgentsChatPartService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IAgentsViewProvidersService private readonly _providers: IAgentsViewProvidersService,
		@IEditorService private readonly _editorService: IEditorService,
		@IChatService private readonly _chatService: IChatService,
		@INotificationService private readonly _notificationService: INotificationService,
		@IAgentsChatPartFrame frame: IAgentsChatPartFrame,
	) {
		// Read once the chat part exists: reading it does not create it
		this.shownSession = derived(reader => frame.contentCreated.read(reader) ? this._chatPart.shownSession.read(reader) : undefined);
	}

	/** The chat of the chat part's active tab, and whether the user opened it or the chat part restored it. */
	readonly shownSession: IObservable<IChatViewHostShownSession | undefined>;

	/** Increases as the host is deactivated: what started before then does not open the chat part once it continues. */
	private _generation = 0;

	/**
	 * It no longer replaces the Chat view, such as once chat needs setting up: what it is still doing, such as looking up a
	 * session or starting one, does not open the chat part.
	 */
	deactivate(): void {
		this._generation++;
	}

	/**
	 * The chats of the window's sessions: a chat that a sessions provider resolves, or of a type a provider offers, such as an
	 * untitled new session's, and the chats of the agent host also while its providers are not registered. Not local chat,
	 * nor chats of other kinds, which the Chat view shows.
	 */
	canShow(sessionResource: URI): boolean {
		if (isAgentHostSessionResource(sessionResource)
			|| this._sessionsManagementService.getSessionForChatResource(sessionResource)
			|| this._sessionsManagementService.getSession(sessionResource)) {
			return true;
		}
		const type = getChatSessionType(sessionResource);
		return type !== localChatSessionType && this._sessionsManagementService.getAllSessionTypes().some(sessionType => (sessionType.chatSessionType ?? sessionType.id) === type);
	}

	/** New Chat, such as + in the title of the Chat view, opens a new-session composer in the chat part. */
	newChat(): boolean {
		if (!this._available) {
			return false;
		}
		this._chatPart.openComposer(this._composerTarget(), { newComposer: true }).catch(onUnexpectedError);
		return true;
	}

	/** Whether it shows anything: not while chat is hidden or disabled, such as with AI features off. */
	private get _available(): boolean {
		return this._contextKeyService.contextMatchesRules(AgentsViewAvailable);
	}

	async reveal(preserveFocus?: boolean): Promise<IChatWidget | undefined> {
		if (!this._available) {
			return undefined;
		}
		await this._chatPart.show(this._composerTarget(), { preserveFocus });
		const active = this._chatPart.activeChat.get();
		return active ? this._waitForWidget(active.chat.resource) : this._chatPart.getComposerWidget();
	}

	async revealIfShowing(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		return this._chatPart.isShowing(sessionResource) ? this.openSession(sessionResource, options) : undefined;
	}

	async openSession(sessionResource: URI, options?: IChatViewHostOpenOptions): Promise<IChatWidget | undefined> {
		if (!this._available) {
			return undefined;
		}
		// Its session is known only while the providers are held: until it shows in the chat part, which holds them then
		const generation = this._generation;
		const hold = this._providers.acquire();
		try {
			const owner = await waitForAgentsViewSession(this._sessionsManagementService, sessionResource, () => this._sessionsManagementService.getSessionForChatResource(sessionResource));
			if (!owner || generation !== this._generation) {
				return undefined;
			}
			await this._chatPart.openChat(owner.session, owner.chat.resource, { preserveFocus: options?.preserveFocus });
			return await this._waitForWidget(owner.chat.resource);
		} finally {
			hold.dispose();
		}
	}

	async toggle(): Promise<boolean> {
		if (this._layoutService.isVisible(Parts.CHAT_PART)) {
			this._layoutService.setPartHidden(true, Parts.CHAT_PART);
			return false;
		}
		if (!this._available) {
			return false;
		}
		await this._chatPart.show(this._composerTarget());
		return true;
	}

	/**
	 * Holds the session's model while its first request, if any, is sent, and shows the session in the chat part only once it
	 * runs, became real or was given: a new session that did not run is not listed, so a new-session composer of its type
	 * shows instead, where a request that did not run can be put back.
	 */
	async startSession(sessionResource: URI, options: IChatViewHostSessionStartOptions): Promise<IChatViewHostSessionStart> {
		if (options.local) {
			// It shows sessions, not local chat
			this._notificationService.info(localize('agentsChatViewHost.localChatUnavailable', "Local chat sessions are not available while chats open in the chat part."));
			throw new CancellationError();
		}
		const model = await this._chatService.acquireOrLoadSession(sessionResource, ChatAgentLocation.Chat, CancellationToken.None, 'AgentsChatViewHost#startSession', 'explicitOverride');
		if (!model) {
			throw new Error(`Unable to load the chat session ${sessionResource.toString()}`);
		}
		const sessionType = sessionResource.scheme;
		const generation = this._generation;
		let composer: Promise<IChatWidget | undefined> | undefined;
		return {
			moved: async () => { },
			complete: async (resource, sent) => {
				if (generation !== this._generation) {
					// Deactivated meanwhile: it shows nothing, neither the session nor a composer
					return false;
				}
				const given = !isUntitledChatSession(sessionResource);
				const shown = (sent || given || !isEqual(resource, sessionResource)) && !!await this.openSession(resource);
				if (!shown) {
					// Shown before the start completes, and given back by createComposer
					composer = this._openComposer(sessionType);
					await composer;
				}
				return shown;
			},
			createComposer: () => composer ?? (generation === this._generation ? this._openComposer(sessionType) : Promise.resolve(undefined)),
			dispose: () => model.dispose(),
		};
	}

	/** Shows a new-session composer of `sessionType` and resolves to the widget of its input, whose submits create the session. */
	private async _openComposer(sessionType: string): Promise<IChatWidget | undefined> {
		if (!this._available) {
			return undefined;
		}
		// A composer of its own: the one it shows may aim at sessions of another type
		await this._chatPart.openComposer({ ...this._composerTarget(), sessionTypeId: sessionType }, { newComposer: true });
		return this._chatPart.getComposerWidget();
	}

	private _composerTarget(): INewSessionTarget | undefined {
		return getEditorWindowComposerTarget(this._workspaceContextService, this._editorService);
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
