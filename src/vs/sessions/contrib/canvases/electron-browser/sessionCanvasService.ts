/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, derivedOpts, IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CanvasInput, canvasOwnerKey, ICanvas, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasOwner, ICanvasReference, ICanvasService, ICanvasWorkingSets, isCanvasOwner } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { CanvasDefinitionStore } from '../../../../workbench/contrib/canvases/common/canvasDefinitionStore.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { getMainWindowHost, getWindowHost, IFocusedSessionHostService, ISessionHost, ISessionHostService, SessionHostKind } from '../../../services/sessions/browser/sessionHost.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { IChat, ISession, ISessionCanvasDefinition } from '../../../services/sessions/common/session.js';
import { IHostSession, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { createSessionCanvasReference, getSessionCanvasDefinitionInstanceId, ISessionCanvasRegistryService } from '../common/sessionCanvas.js';
import { IPinnedCanvasService } from '../browser/pinnedCanvases.js';

export class SessionCanvasContextService extends Disposable implements ICanvasContextService {

	declare readonly _serviceBrand: undefined;
	private readonly removedOwner = this._register(new Emitter<ICanvasOwner>());
	readonly onDidRemoveOwner = this.removedOwner.event;
	readonly contexts;
	readonly workingSets: ICanvasWorkingSets;
	private readonly knownOwners = new Map<string, ICanvasOwner>();
	/** The chats chat windows show: the canvases of these chats show in those windows. */
	private readonly chatWindowChats: IObservable<readonly URI[]>;

	constructor(
		@ISessionHostService private readonly sessionHostService: ISessionHostService,
		@IFocusedSessionHostService private readonly focusedSessionHostService: IFocusedSessionHostService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ISessionEditorWorkingSetService editorWorkingSetService: ISessionEditorWorkingSetService,
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
		@IChatService chatService: IChatService,
		@ICustomViewService private readonly customViewService: ICustomViewService,
		@IPinnedCanvasService private readonly pinnedCanvasService: IPinnedCanvasService,
		@IChatWindowService private readonly chatWindowService: IChatWindowService,
	) {
		super();
		this.workingSets = {
			state: editorWorkingSetService.restoreState,
			registerEditorToRetain: input => editorWorkingSetService.registerEditorToRetain(input),
			suppressEditorPartAutoVisibility: () => layoutService.suppressEditorPartAutoVisibility(),
		};
		this.chatWindowChats = derivedOpts<readonly URI[]>({ owner: this, equalsFn: (a, b) => a.length === b.length && a.every((chat, index) => isEqual(chat, b[index])) },
			reader => this.chatWindowService.windows.read(reader).map(window => window.chat.read(reader)));
		this.contexts = derived<readonly ICanvasContext[]>(this, reader => {
			const focusedHost = focusedSessionHostService.focusedHost.read(reader);
			const session = focusedHost.session.read(reader);
			const chat = focusedHost.chat.read(reader);
			if (!session || !chat) {
				return [];
			}
			const owner: ICanvasOwner = { providerId: session.providerId, session: session.resource, chat: chat.resource };
			this.knownOwners.set(canvasOwnerKey(owner), owner);
			chatService.chatModels.read(reader);
			const supportsCanvases = session.capabilities.read(reader).supportsCanvases === true;
			// Open requests are derived from the chat's canvases, so only read them while the session presents canvases.
			const openRequests = supportsCanvases ? chatService.getSession(chat.resource)?.canvasContext?.read(reader)?.openRequests : undefined;
			const canvases = supportsCanvases ? chat.canvases ?? constObservable(undefined) : constObservable([]);
			const definitionProvider = supportsCanvases ? {
				onDidChangeDefinitions: Event.fromObservableLight(canvases),
				listCanvases: () => this.sessionsManagementService.listCanvases(session, chat),
				openCanvas: (canvas: ICanvasDefinition, instanceId: string) => this.sessionsManagementService.openCanvas(session, chat, canvas, instanceId),
			} : undefined;
			return [{ owner, canvases, openRequests, definitionProvider }];
		});
		this._register(this.sessionsManagementService.onDidChangeSessions(event => {
			const archived = event.changed.filter(session => session.isArchived.read(undefined));
			for (const session of [...event.removed, ...archived]) {
				this.removeOwners(owner => ownsSession(owner, session));
			}
		}));
		this._register(this.sessionsManagementService.onDidDeleteChat(({ session, chatResource }) => {
			this.removeOwners(owner => ownsSession(owner, session) && isEqual(owner.chat, chatResource));
		}));
	}

	/**
	 * The owner shows where its chat does, whichever window has focus: in the chat window that shows its chat, else in
	 * the main window while it shows the chat.
	 */
	isOwnerVisible(owner: ICanvasOwner, reader?: IReader): boolean {
		const shown = this.getShowingWindow(owner, reader);
		if (!shown) {
			return false;
		}
		const { windowHost, session } = shown;
		return session.capabilities.read(reader).supportsCanvases === true
			&& (windowHost.kind !== SessionHostKind.MainWindow || (!this.customViewService.activeCustomView.read(reader) && isEqual(windowHost.chat.read(reader)?.resource, owner.chat)));
	}

	getContext(owner: ICanvasOwner, reader?: IReader): ICanvasContext | undefined {
		const shown = this.getShowingWindow(owner, reader);
		if (!shown || shown.session.capabilities.read(reader).supportsCanvases !== true) {
			return this.getPinnedOwnerContext(owner, reader);
		}
		const hostChat = shown.host.chat.read(reader);
		const chat: IChat | undefined = hostChat && isEqual(hostChat.resource, owner.chat)
			? hostChat
			: shown.session.chats.read(reader).find(candidate => isEqual(candidate.resource, owner.chat));
		return { owner, canvases: chat?.canvases ?? constObservable(undefined) };
	}

	/**
	 * The window that shows the session of the owner: the chat window that shows its chat, else the main window while it
	 * shows the session.
	 */
	private getShowingWindow(owner: ICanvasOwner, reader: IReader | undefined): { readonly host: ISessionHost; readonly windowHost: ISessionHost; readonly session: IHostSession } | undefined {
		const chatHost = this.sessionHostService.getHostOfChat(owner.chat, reader);
		const chatWindowHost = chatHost && getWindowHost(chatHost);
		if (chatHost && chatWindowHost?.kind === SessionHostKind.ChatWindow) {
			const session = chatHost.session.read(reader);
			return session && ownsSession(owner, session) ? { host: chatHost, windowHost: chatWindowHost, session } : undefined;
		}
		const mainWindowHost = getMainWindowHost(this.sessionHostService);
		const session = mainWindowHost.session.read(reader);
		return session && ownsSession(owner, session) ? { host: mainWindowHost, windowHost: mainWindowHost, session } : undefined;
	}

	getTrackedCanvas(reference: ICanvasReference, reader?: IReader): ICanvas | undefined {
		return this.pinnedCanvasService.getTrackedCanvas(reference, reader);
	}

	isCanvasTracked(reference: ICanvasReference, reader?: IReader): boolean {
		return this.pinnedCanvasService.isPinned(reference, reader);
	}

	isPresentedElsewhere(reference: ICanvasReference, reader?: IReader): boolean {
		return this.pinnedCanvasService.isShown(reference, reader);
	}

	/** An owner outside the active session stays resolvable while one of its canvases is pinned. */
	private getPinnedOwnerContext(owner: ICanvasOwner, reader: IReader | undefined): ICanvasContext | undefined {
		const pinned = this.pinnedCanvasService.entries.read(reader).some(entry => isCanvasOwner(entry.identity, owner));
		if (!pinned) {
			return undefined;
		}
		const session = this.sessionsManagementService.getSession(owner.session);
		const chat = session && ownsSession(owner, session)
			? session.chats.read(reader).find(candidate => isEqual(candidate.resource, owner.chat))
			: undefined;
		// Membership of a chat outside the active session is unknown; each pinned canvas is tracked on its own.
		return { owner, canvases: chat?.canvases ?? constObservable(undefined) };
	}

	getFrontendSessionResource(owner: ICanvasOwner, reader?: IReader): URI | undefined {
		const session = this.focusedSessionHostService.focusedHost.read(reader).session.read(reader);
		return session && ownsSession(owner, session) ? session.resource : undefined;
	}

	getEditorGroup(owner: ICanvasOwner, input: CanvasInput, restore: boolean): IEditorGroup | undefined {
		const mainPart = this.editorGroupsService.mainPart;
		if (restore) {
			return mainPart.activeGroup;
		}
		// The window that shows the owner's chat, whichever window has focus: a chat window keeps its canvases in its own
		// main part, as the main window does.
		const host = this.sessionHostService.getHostOfChat(owner.chat);
		const windowHost = host && getWindowHost(host);
		const windowId = windowHost?.kind === SessionHostKind.ChatWindow ? windowHost.windowId.get() : undefined;
		const part = (windowId !== undefined ? this.chatWindowService.getWindow(windowId)?.mainPart : undefined) ?? mainPart;
		if (part === mainPart && this.editorGroupsService.activeGroup.windowId === mainPart.windowId) {
			// The main window is active: its active group is where editors open by default.
			return undefined;
		}
		return part.groups.find(group => group.contains(input)) ?? part.activeGroup;
	}

	/** A chat window shows the canvases of the chat it shows, in any of its groups. */
	canPresentInGroup(owner: ICanvasOwner, group: IEditorGroup): boolean {
		const chat = this.chatWindowService.getWindow(group.windowId)?.chat.get();
		return !!chat && isEqual(chat, owner.chat);
	}

	/** The canvases of a chat a chat window shows are that window's, whichever session the main window shows. */
	presentsOutsideWorkingSets(owner: ICanvasOwner, reader?: IReader): boolean {
		return this.chatWindowChats.read(reader).some(chat => isEqual(chat, owner.chat));
	}

	private removeOwners(owns: (owner: ICanvasOwner) => boolean): void {
		for (const [key, owner] of this.knownOwners) {
			if (owns(owner)) {
				this.knownOwners.delete(key);
				this.removedOwner.fire(owner);
			}
		}
	}
}

export class SessionCanvasRegistryService extends Disposable implements ISessionCanvasRegistryService {

	declare readonly _serviceBrand: undefined;
	readonly supportsCanvases: IObservable<boolean>;
	readonly availableCanvases: IObservable<readonly ISessionCanvasDefinition[]>;

	constructor(
		@IFocusedSessionHostService private readonly focusedSessionHostService: IFocusedSessionHostService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@ILogService logService: ILogService,
	) {
		super();
		this.supportsCanvases = derived(this, reader => {
			const session = focusedSessionHostService.focusedHost.read(reader).session.read(reader);
			return !!session && !!focusedSessionHostService.focusedHost.read(reader).chat.read(reader)
				&& canvasService.enabled.read(reader)
				&& session.capabilities.read(reader).supportsCanvases === true;
		});
		this.availableCanvases = this._register(new CanvasDefinitionStore(reader => {
			const session = focusedSessionHostService.focusedHost.read(reader).session.read(reader);
			const chat = focusedSessionHostService.focusedHost.read(reader).chat.read(reader);
			// Hosts republish canvas membership when their registry changes, so refresh on every emission.
			chat?.canvases?.read(reader);
			if (!session || !chat || !this.supportsCanvases.read(reader)) {
				return undefined;
			}
			return {
				owner: { providerId: session.providerId, session: session.resource, chat: chat.resource },
				listCanvases: () => sessionsManagementService.listCanvases(session, chat),
			};
		}, '[SessionCanvasRegistryService]', logService)).definitions;
	}

	async openCanvas(canvas: ISessionCanvasDefinition): Promise<void> {
		const session = this.focusedSessionHostService.focusedHost.get().session.get();
		if (!session || !this.canvasService.enabled.get() || session.capabilities.get().supportsCanvases !== true) {
			return;
		}
		const chat = this.focusedSessionHostService.focusedHost.get().chat.get();
		if (!chat) {
			return;
		}
		const instanceId = getSessionCanvasDefinitionInstanceId(canvas);
		const existing = chat.canvases?.get()?.find(candidate => candidate.instanceId === instanceId);
		if (existing?.source) {
			await this.canvasService.revealCanvas(createSessionCanvasReference(session, chat, existing));
			return;
		}
		await this.sessionsManagementService.openCanvas(session, chat, canvas, instanceId);
	}
}

function ownsSession(owner: ICanvasOwner, session: ISession): boolean {
	return owner.providerId === session.providerId && isEqual(owner.session, session.resource);
}
