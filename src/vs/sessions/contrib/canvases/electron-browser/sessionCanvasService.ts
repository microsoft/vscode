/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, IReader } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CanvasInput, canvasOwnerKey, ICanvasContext, ICanvasContextService, ICanvasDefinition, ICanvasOwner, ICanvasService, ICanvasWorkingSets } from '../../../../workbench/contrib/canvases/common/canvas.js';
import { CanvasDefinitionStore } from '../../../../workbench/contrib/canvases/common/canvasDefinitionStore.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISessionCanvasDefinition } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionEditorWorkingSetService } from '../../layout/common/sessionEditorWorkingSet.js';
import { createSessionCanvasReference, getSessionCanvasDefinitionInstanceId, ISessionCanvasRegistryService } from '../common/sessionCanvas.js';

export class SessionCanvasContextService extends Disposable implements ICanvasContextService {

	declare readonly _serviceBrand: undefined;
	private readonly removedOwner = this._register(new Emitter<ICanvasOwner>());
	readonly onDidRemoveOwner = this.removedOwner.event;
	readonly contexts;
	readonly workingSets: ICanvasWorkingSets;
	private readonly knownOwners = new Map<string, ICanvasOwner>();

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@IEditorGroupsService private readonly editorGroupsService: IEditorGroupsService,
		@ISessionEditorWorkingSetService editorWorkingSetService: ISessionEditorWorkingSetService,
		@IAgentWorkbenchLayoutService layoutService: IAgentWorkbenchLayoutService,
		@IChatService chatService: IChatService,
	) {
		super();
		this.workingSets = {
			state: editorWorkingSetService.restoreState,
			registerEditorToRetain: input => editorWorkingSetService.registerEditorToRetain(input),
			suppressEditorPartAutoVisibility: () => layoutService.suppressEditorPartAutoVisibility(),
		};
		this.contexts = derived<readonly ICanvasContext[]>(this, reader => {
			const session = sessionsService.activeSession.read(reader);
			const chat = session?.activeChat.read(reader);
			if (!session || !chat) {
				return [];
			}
			const owner: ICanvasOwner = { providerId: session.providerId, session: session.resource, chat: chat.resource };
			this.knownOwners.set(canvasOwnerKey(owner), owner);
			chatService.chatModels.read(reader);
			const openRequests = chatService.getSession(chat.resource)?.canvasContext?.read(reader)?.openRequests;
			const supportsCanvases = session.capabilities.read(reader).supportsCanvases === true;
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

	isOwnerVisible(owner: ICanvasOwner, reader?: IReader): boolean {
		const session = this.sessionsService.activeSession.read(reader);
		return !!session
			&& session.capabilities.read(reader).supportsCanvases === true
			&& ownsSession(owner, session)
			&& isEqual(session.activeChat.read(reader).resource, owner.chat);
	}

	getContext(owner: ICanvasOwner, reader?: IReader): ICanvasContext | undefined {
		const session = this.sessionsService.activeSession.read(reader);
		if (!session || session.capabilities.read(reader).supportsCanvases !== true || !ownsSession(owner, session)) {
			return undefined;
		}
		const activeChat = session.activeChat.read(reader);
		const chat: IChat | undefined = isEqual(activeChat.resource, owner.chat)
			? activeChat
			: session.chats.read(reader).find(candidate => isEqual(candidate.resource, owner.chat));
		return { owner, canvases: chat?.canvases ?? constObservable(undefined) };
	}

	getEditorGroup(_owner: ICanvasOwner, input: CanvasInput, restore: boolean): IEditorGroup | undefined {
		const mainPart = this.editorGroupsService.mainPart;
		if (restore) {
			return mainPart.activeGroup;
		}
		return this.editorGroupsService.activeGroup.windowId === mainPart.windowId
			? undefined
			: mainPart.groups.find(group => group.contains(input)) ?? mainPart.activeGroup;
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
	readonly availableCanvases: IObservable<readonly ISessionCanvasDefinition[]>;

	constructor(
		@ISessionsService private readonly sessionsService: ISessionsService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ICanvasService private readonly canvasService: ICanvasService,
		@ILogService logService: ILogService,
	) {
		super();
		this.availableCanvases = this._register(new CanvasDefinitionStore(reader => {
			const session = sessionsService.activeSession.read(reader);
			const chat = session?.activeChat.read(reader);
			// Hosts republish canvas membership when their registry changes, so refresh on every emission.
			chat?.canvases?.read(reader);
			if (!session || !chat || !canvasService.enabled.read(reader) || session.capabilities.read(reader).supportsCanvases !== true) {
				return undefined;
			}
			return {
				owner: { providerId: session.providerId, session: session.resource, chat: chat.resource },
				listCanvases: () => sessionsManagementService.listCanvases(session, chat),
			};
		}, '[SessionCanvasRegistryService]', logService)).definitions;
	}

	async openCanvas(canvas: ISessionCanvasDefinition): Promise<void> {
		const session = this.sessionsService.activeSession.get();
		if (!session || !this.canvasService.enabled.get() || session.capabilities.get().supportsCanvases !== true) {
			return;
		}
		const chat = session.activeChat.get();
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
