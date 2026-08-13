/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, ISettableObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/common/assignmentService.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IVoicePlaybackService } from '../../../../../workbench/contrib/chat/common/voicePlaybackService.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IAgentHostFilterService } from '../../../../services/agentHostFilter/common/agentHostFilter.js';
import { ISessionsListModelService, SessionSortMode } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISession, ISessionCapabilities, SessionStatus } from '../../../../services/sessions/common/session.js';

const ITestAgentSessionsService = createDecorator<object>('agentSessions');

export class TestCommandService extends mock<ICommandService>() {
	readonly calls: { readonly commandId: string; readonly args: readonly unknown[] }[] = [];

	override async executeCommand<T = unknown>(commandId: string, ...args: unknown[]): Promise<T | undefined> {
		this.calls.push({ commandId, args });
		return undefined;
	}
}

export class TestSessionsManagementService extends mock<ISessionsManagementService>() {
	override readonly onDidChangeSessions = Event.None;
	sessions: ISession[];
	readonly readSessions: ISession[] = [];
	readonly renamed: { readonly session: ISession; readonly title: string }[] = [];
	renameError: Error | undefined;

	constructor(sessions: ISession[]) {
		super();
		this.sessions = sessions;
	}

	override getSessions(): ISession[] {
		return this.sessions;
	}

	override async markRead(session: ISession): Promise<void> {
		this.readSessions.push(session);
	}

	override async renameSession(session: ISession, title: string): Promise<void> {
		this.renamed.push({ session, title });
		if (this.renameError) {
			throw this.renameError;
		}
	}
}

export function createSession(title: string, resourceId: string = title): { readonly session: ISession; readonly capabilities: ISettableObservable<ISessionCapabilities, void> } {
	const now = new Date();
	const resource = URI.parse(`test-session://${resourceId}`);
	const capabilities = observableValue<ISessionCapabilities>(`capabilities-${resourceId}`, { supportsMultipleChats: false, supportsRename: true });
	const session: ISession = {
		sessionId: resourceId,
		resource,
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt: now,
		workspace: constObservable({
			uri: URI.parse(`test-workspace://${resourceId}`),
			label: 'Workspace',
			icon: Codicon.folder,
			folders: [],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		isQuickChat: constObservable(false),
		title: constObservable(title),
		updatedAt: constObservable(now),
		status: constObservable(SessionStatus.Completed),
		changesets: constObservable([]),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable<readonly IChat[]>([]),
		mainChat: constObservable(new class extends mock<IChat>() { }),
		capabilities,
	};
	return { session, capabilities };
}

export interface IListHarness {
	readonly store: DisposableStore;
	readonly instantiationService: TestInstantiationService;
	readonly managementService: TestSessionsManagementService;
	readonly commandService: TestCommandService;
	createContainer(): HTMLElement;
}

export function createListHarness(disposables: Pick<DisposableStore, 'add'>, sessions: ISession[], configure?: (instantiationService: TestInstantiationService) => void): IListHarness {
	const store = disposables.add(new DisposableStore());
	const instantiationService = workbenchInstantiationService(undefined, store);
	const managementService = new TestSessionsManagementService(sessions);
	const commandService = new TestCommandService();

	instantiationService.stub(ISessionsManagementService, managementService);
	instantiationService.stub(ICommandService, commandService);
	instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([]);
		override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
	});
	instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override isSessionPinned(): boolean { return false; }
		override migrateLegacyReadState(): void { }
		override getSortKey(session: ISession, mode: SessionSortMode): number {
			return mode === 'created' ? session.createdAt.getTime() : session.updatedAt.get().getTime();
		}
		override getStatusIcon() { return Codicon.circleSmallFilled; }
	});
	instantiationService.stub(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
		override readonly onDidChange = Event.None;
		override getGroups() { return []; }
		override getGroupOfSession() { return undefined; }
		override getSessionIdsInGroup() { return []; }
	});
	instantiationService.stub(ISessionSectionOrderService, new class extends mock<ISessionSectionOrderService>() {
		override readonly onDidChange = Event.None;
		override resolveOrder(ids: readonly string[]) { return [...ids]; }
		override isPromoted() { return false; }
		override retain(): void { }
	});
	instantiationService.stub(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
		override readonly onDidChange = Event.None;
		override readonly selectedProviderId = undefined;
	});
	instantiationService.stub(IWorkbenchAssignmentService, new class extends mock<IWorkbenchAssignmentService>() {
		override readonly onDidRefetchAssignments = Event.None;
		override async getTreatment<T extends string | number | boolean>(): Promise<T | undefined> { return undefined; }
	});
	instantiationService.stub(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
		override readonly onDidChangeProviders = Event.None;
		override getProviders() { return []; }
	});
	instantiationService.stub(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
		override readonly pendingResponseVersion = constObservable(0);
		override hasPendingResponse() { return false; }
	});
	instantiationService.stub(ITestAgentSessionsService, {
		model: {
			observeSession: () => constObservable(undefined),
		},
	});
	instantiationService.stub(IChatService, new class extends mock<IChatService>() {
		override readonly chatModels = constObservable([]);
	});
	configure?.(instantiationService);

	const createContainer = () => {
		const container = mainWindow.document.createElement('div');
		container.style.width = '400px';
		container.style.height = '300px';
		mainWindow.document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });
		return container;
	};

	return { store, instantiationService, managementService, commandService, createContainer };
}
