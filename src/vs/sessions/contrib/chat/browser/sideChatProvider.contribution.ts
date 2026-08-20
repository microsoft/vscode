/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../../base/common/async.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { isRequestVM } from '../../../../workbench/contrib/chat/common/model/chatViewModel.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSideChatOrigin, IChatSideChatProvider, IChatSideChatSelection, IChatSideChatService } from '../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { IWorkbenchEnvironmentService } from '../../../../workbench/services/environment/common/environmentService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ChatOriginKind, IChat, ISession, SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { createAndSendSideChat } from './sideChatOrchestration.js';

const SIDE_CHAT_SOURCE_REVEAL_TIMEOUT = 2_000;

/**
 * Backs the workbench's "Ask in Side Chat" affordance with the Agents window's
 * side chat implementation. The workbench owns the action and its presentation;
 * this provider owns branching a chat from a session turn, which only this layer
 * can do today.
 */
export class SessionsSideChatProviderContribution extends Disposable implements IWorkbenchContribution, IChatSideChatProvider {

	static readonly ID = 'sessions.contrib.sideChatProvider';

	// Cached observables avoid recreating deriveds for every rendered chat row.
	private readonly _sideChatOrigins = new ResourceMap<IObservable<IChatSideChatOrigin | undefined>>();
	private readonly _isSessionsWindow: boolean;

	constructor(
		@IChatSideChatService sideChatService: IChatSideChatService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsPartService private readonly sessionsPartService: ISessionsPartService,
		@IChatService private readonly chatService: IChatService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
	) {
		super();

		this._isSessionsWindow = environmentService.isSessionsWindow;
		if (!this._isSessionsWindow) {
			return;
		}

		this._register(sideChatService.registerProvider(this));
	}

	canAskInSideChat(sessionResource: URI): boolean {
		return !!this._resolveSource(sessionResource);
	}

	async askInSideChat(sessionResource: URI, query: string, selection?: IChatSideChatSelection): Promise<void> {
		const source = this._resolveSource(sessionResource);
		if (!source) {
			throw new Error(`Side chats are not supported for ${sessionResource.toString()}`);
		}
		const { session, chatResource, turnId } = source;
		await createAndSendSideChat(this.sessionsManagementService, this.sessionsService, this.sessionsPartService, session, chatResource, turnId, { query }, selection);
	}

	/** Observes the source metadata for a side chat. */
	observeSideChatOrigin(sessionResource: URI): IObservable<IChatSideChatOrigin | undefined> {
		let sideChatOrigin = this._sideChatOrigins.get(sessionResource);
		if (!sideChatOrigin) {
			sideChatOrigin = derived(this, reader => {
				if (!this._isSessionsWindow) {
					return undefined;
				}

				const resolved = this._resolveSessionChat(sessionResource, reader);
				const origin = resolved?.chat.origin;
				if (!resolved || origin?.kind !== ChatOriginKind.SideChat || !origin.parentChat || !origin.turnId) {
					return undefined;
				}

				const sourceChat = resolved.session.chats.read(reader).find(chat => this.uriIdentityService.extUri.isEqual(chat.resource, origin.parentChat));
				return {
					sourceSessionResource: origin.parentChat,
					sourceTurnId: origin.turnId,
					sourceTitle: sourceChat?.title.read(reader),
					selection: origin.selection ? { text: origin.selection.text } : undefined,
				};
			});
			this._sideChatOrigins.set(sessionResource, sideChatOrigin);
		}
		return sideChatOrigin;
	}

	/** Activates a side chat's source and reveals its originating request. */
	async revealSideChatSource(sessionResource: URI): Promise<void> {
		if (!this._isSessionsWindow) {
			return;
		}

		const origin = this.observeSideChatOrigin(sessionResource).get();
		if (!origin) {
			return;
		}

		const resolved = this._resolveSessionChat(sessionResource);
		if (!resolved) {
			return;
		}

		const widget = this.chatWidgetService.getWidgetBySessionResource(sessionResource);
		await this.sessionsService.openChat(resolved.session, origin.sourceSessionResource);

		if (!widget) {
			return;
		}

		if (!widget.viewModel || !this.uriIdentityService.extUri.isEqual(widget.viewModel.sessionResource, origin.sourceSessionResource)) {
			const viewModelChanged = Event.toPromise(Event.filter(widget.onDidChangeViewModel, event =>
				event.currentSessionResource !== undefined && this.uriIdentityService.extUri.isEqual(event.currentSessionResource, origin.sourceSessionResource)
			), this._store);
			try {
				if (!await raceTimeout(viewModelChanged, SIDE_CHAT_SOURCE_REVEAL_TIMEOUT)) {
					return;
				}
			} finally {
				viewModelChanged.cancel();
			}
		}

		const item = widget.viewModel?.getItems().find(item => item.id === origin.sourceTurnId);
		if (item && isRequestVM(item)) {
			widget.reveal(item);
		}
	}

	private _resolveSessionChat(sessionResource: URI, reader?: IReader): { session: ISession; chat: IChat } | undefined {
		const visibleSessions = reader ? this.sessionsService.visibleSessions.read(reader) : this.sessionsService.visibleSessions.get();
		for (const session of visibleSessions) {
			if (!session) {
				continue;
			}

			const chats = reader ? session.chats.read(reader) : session.chats.get();
			const chat = chats.find(chat => this.uriIdentityService.extUri.isEqual(chat.resource, sessionResource));
			if (chat) {
				return { session, chat };
			}
		}

		// Non-visible chats can resolve here, but this lookup is not reactive.
		return this.sessionsManagementService.getSessionForChatResource(sessionResource);
	}

	/**
	 * Resolves the session, chat and turn a side chat would branch from, or
	 * `undefined` when this conversation cannot produce one — it is untitled,
	 * archived, its provider lacks side chat support, or nothing has been sent
	 * yet so there is no turn to anchor to.
	 */
	private _resolveSource(sessionResource: URI) {
		const found = this.sessionsManagementService.getSessionForChatResource(sessionResource);
		if (!found) {
			return undefined;
		}
		const { session, chat } = found;
		if (session.status.get() === SessionStatus.Untitled || session.isArchived.get() || !session.capabilities.get().supportsSideChat) {
			return undefined;
		}
		const sourceTurn = this.chatService.getSession(chat.resource)?.getRequests().at(-1);
		if (!sourceTurn) {
			return undefined;
		}
		return { session, chatResource: chat.resource, turnId: sourceTurn.id };
	}
}

registerWorkbenchContribution2(SessionsSideChatProviderContribution.ID, SessionsSideChatProviderContribution, WorkbenchPhase.BlockRestore);
