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
import { ISessionGroup, ISessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionsListModelService, SessionSortMode } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { IChat, ISession, ISessionCapabilities, ISessionChangesSummary, SessionStatus } from '../../../../services/sessions/common/session.js';

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
	readonly renamedChats: { readonly session: ISession; readonly chatResource: URI; readonly title: string }[] = [];
	readonly deletedChats: { readonly session: ISession; readonly chatResource: URI }[] = [];
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

	override async deleteChat(session: ISession, chatResource: URI): Promise<void> {
		this.deletedChats.push({ session, chatResource });
	}

	override async renameChat(session: ISession, chatResource: URI, title: string): Promise<void> {
		this.renamedChats.push({ session, chatResource, title });
	}
}

export interface ITestSession {
	readonly session: ISession;
	readonly capabilities: ISettableObservable<ISessionCapabilities, void>;
	readonly status: ISettableObservable<SessionStatus, void>;
	readonly isArchived: ISettableObservable<boolean, void>;
}

export interface ITestSessionOptions {
	readonly resourceId?: string;
	readonly workspaceLabel?: string;
	readonly status?: SessionStatus;
	readonly isArchived?: boolean;
	readonly isQuickChat?: boolean;
	readonly changesSummary?: ISessionChangesSummary;
}

export function createTestSession(title: string, options: ITestSessionOptions = {}): ITestSession {
	const resourceId = options.resourceId ?? title;
	const now = new Date();
	const resource = URI.parse(`test-session://${resourceId}`);
	const capabilities = observableValue<ISessionCapabilities>(`capabilities-${resourceId}`, { supportsMultipleChats: false, supportsRename: true });
	const status = observableValue(`status-${resourceId}`, options.status ?? SessionStatus.Completed);
	const mainChat = new class extends mock<IChat>() {
		override readonly resource = resource.with({ fragment: 'main' });
		override readonly status = status;
	}();
	const isArchived = observableValue(`archived-${resourceId}`, options.isArchived ?? false);
	const workspaceLabel = options.workspaceLabel ?? 'Workspace';
	const isQuickChat = options.isQuickChat ?? false;
	const session: ISession = {
		sessionId: resourceId,
		resource,
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt: now,
		workspace: constObservable(isQuickChat ? undefined : {
			uri: URI.parse(`test-workspace://${resourceId}`),
			label: workspaceLabel,
			icon: Codicon.folder,
			folders: [],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		}),
		isQuickChat: constObservable(isQuickChat),
		title: constObservable(title),
		updatedAt: constObservable(now),
		status,
		changesets: constObservable([]),
		changes: constObservable([]),
		changesSummary: constObservable(options.changesSummary),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived,
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		chats: constObservable<readonly IChat[]>([]),
		mainChat: constObservable(mainChat),
		capabilities,
	};
	return { session, capabilities, status, isArchived };
}

export function createSession(title: string, resourceId: string = title): ITestSession {
	return createTestSession(title, { resourceId });
}

export interface IListHarness {
	readonly store: DisposableStore;
	readonly instantiationService: TestInstantiationService;
	readonly managementService: TestSessionsManagementService;
	readonly commandService: TestCommandService;
	createContainer(width?: number, height?: number): HTMLElement;
}

export interface IListHarnessOptions {
	readonly groups?: readonly ISessionGroup[];
	readonly memberships?: ReadonlyMap<string, string>;
	readonly pinnedSessionIds?: ReadonlySet<string>;
}

type ConfigureListHarness = (instantiationService: TestInstantiationService) => void;

export function createListHarness(disposables: Pick<DisposableStore, 'add'>, sessions: ISession[], optionsOrConfigure: IListHarnessOptions | ConfigureListHarness = {}): IListHarness {
	const store = disposables.add(new DisposableStore());
	const instantiationService = workbenchInstantiationService(undefined, store);
	const managementService = new TestSessionsManagementService(sessions);
	const commandService = new TestCommandService();
	const configure = typeof optionsOrConfigure === 'function' ? optionsOrConfigure : undefined;
	const options: IListHarnessOptions = typeof optionsOrConfigure === 'function' ? {} : optionsOrConfigure;
	const groups = options.groups ?? [];
	const memberships = options.memberships ?? new Map();
	const pinnedSessionIds = options.pinnedSessionIds ?? new Set();

	instantiationService.stub(ISessionsManagementService, managementService);
	instantiationService.stub(ICommandService, commandService);
	instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
		override readonly visibleSessions = constObservable<readonly (IActiveSession | undefined)[]>([]);
		override readonly activeSession = constObservable<IActiveSession | undefined>(undefined);
	});
	instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
		override readonly onDidChange = Event.None;
		override isSessionPinned(session: ISession): boolean { return pinnedSessionIds.has(session.sessionId); }
		override migrateLegacyReadState(): void { }
		override getSortKey(session: ISession, mode: SessionSortMode): number {
			return mode === 'created' ? session.createdAt.getTime() : session.updatedAt.get().getTime();
		}
		override getStatusIcon() { return Codicon.circleSmallFilled; }
	});
	instantiationService.stub(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
		override readonly onDidChange = Event.None;
		override getGroups() { return [...groups]; }
		override getGroup(groupId: string) { return groups.find(group => group.id === groupId); }
		override getGroupOfSession(sessionId: string) { return memberships.get(sessionId); }
		override getSessionIdsInGroup(groupId: string) {
			return [...memberships].filter(([, memberGroupId]) => memberGroupId === groupId).map(([sessionId]) => sessionId);
		}
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

	const createContainer = (width = 400, height = 300) => {
		const container = mainWindow.document.createElement('div');
		container.style.width = `${width}px`;
		container.style.height = `${height}px`;
		mainWindow.document.body.appendChild(container);
		store.add({ dispose: () => container.remove() });
		return container;
	};

	return { store, instantiationService, managementService, commandService, createContainer };
}
