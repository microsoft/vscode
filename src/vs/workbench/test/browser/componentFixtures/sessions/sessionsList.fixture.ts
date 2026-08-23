/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { IMarkdownString, MarkdownString } from '../../../../../base/common/htmlContent.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { ThemeIcon, themeColorFromId } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
// eslint-disable-next-line local/code-import-patterns
import { IAgentHostFilterService } from '../../../../../sessions/services/agentHostFilter/common/agentHostFilter.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionGroup, ISessionGroupsService } from '../../../../../sessions/services/sessions/browser/sessionGroupsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionSectionOrderService } from '../../../../../sessions/services/sessions/browser/sessionSectionOrderService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsListModelService } from '../../../../../sessions/services/sessions/browser/sessionsListModelService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsProvidersService } from '../../../../../sessions/services/sessions/browser/sessionsProvidersService.js';
// eslint-disable-next-line local/code-import-patterns
import { ISessionsService } from '../../../../../sessions/services/sessions/browser/sessionsService.js';
// eslint-disable-next-line local/code-import-patterns
import { ICustomViewService } from '../../../../../sessions/services/customView/browser/customViewService.js';
// eslint-disable-next-line local/code-import-patterns
import { IChat, ISession, ISessionChangesSummary, ISessionFolder, ISessionWorkspace, SessionStatus } from '../../../../../sessions/services/sessions/common/session.js';
// eslint-disable-next-line local/code-import-patterns
import { IActiveSession, ISessionsManagementService } from '../../../../../sessions/services/sessions/common/sessionsManagement.js';
// eslint-disable-next-line local/code-import-patterns
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../../../../sessions/contrib/sessions/browser/views/sessionsList.js';
import { IAgentSessionsService } from '../../../../contrib/chat/browser/agentSessions/agentSessionsService.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAutomationService } from '../../../../contrib/chat/common/automations/automationService.js';
import { IChatService } from '../../../../contrib/chat/common/chatService/chatService.js';
import { IChatModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { IVoicePlaybackService } from '../../../../contrib/chat/common/voicePlaybackService.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

// eslint-disable-next-line local/code-import-patterns
import '../../../../../sessions/contrib/sessions/browser/media/sessionsList.css';

interface ISessionSpec {
	readonly id: string;
	readonly title: string;
	readonly workspace?: string;
	readonly status?: SessionStatus;
	readonly description?: string;
	readonly minutesAgo: number;
	readonly changesSummary?: ISessionChangesSummary;
	readonly group?: string;
}

function createWorkspace(label: string): ISessionWorkspace {
	const root = URI.file(`/home/user/projects/${label}`);
	const folder: ISessionFolder = { root, workingDirectory: root, name: label, description: undefined };
	return {
		uri: root,
		label,
		icon: Codicon.folder,
		folders: [folder],
		requiresWorkspaceTrust: false,
		isVirtualWorkspace: false,
	};
}

function createSession(spec: ISessionSpec): ISession {
	const updatedAt = new Date(Date.now() - spec.minutesAgo * 60 * 1000);
	const description: IMarkdownString | undefined = spec.description ? new MarkdownString(spec.description) : undefined;
	return new class extends mock<ISession>() {
		override readonly sessionId = spec.id;
		override readonly resource = URI.parse(`vscode-session://session/${spec.id}`);
		override readonly providerId = 'local';
		override readonly sessionType = 'local';
		override readonly icon = Codicon.account;
		override readonly createdAt = updatedAt;
		override readonly title: IObservable<string> = constObservable(spec.title);
		override readonly updatedAt: IObservable<Date> = constObservable(updatedAt);
		override readonly status: IObservable<SessionStatus> = constObservable(spec.status ?? SessionStatus.Completed);
		override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(spec.workspace ? createWorkspace(spec.workspace) : undefined);
		override readonly isQuickChat: IObservable<boolean> = constObservable(!spec.workspace);
		override readonly isArchived: IObservable<boolean> = constObservable(false);
		override readonly isRead: IObservable<boolean> = constObservable(true);
		override readonly changes: IObservable<readonly never[]> = constObservable([]);
		override readonly changesSummary: IObservable<ISessionChangesSummary | undefined> = constObservable(spec.changesSummary);
		override readonly description: IObservable<IMarkdownString | undefined> = constObservable(description);
		override readonly chats: IObservable<readonly IChat[]> = constObservable([]);
		override readonly capabilities = constObservable({ supportsMultipleChats: false });
	}();
}

interface IRenderOptions {
	readonly sessions: readonly ISessionSpec[];
	readonly groups?: readonly ISessionGroup[];
	readonly grouping?: SessionsGrouping;
	readonly width?: number;
	readonly phone?: boolean;
}

function renderSessionsList(ctx: ComponentFixtureContext, options: IRenderOptions): void {
	const { container, disposableStore } = ctx;
	const sessions = options.sessions.map(createSession);
	const groups = options.groups ?? [];
	const membership = new Map<string, string>();
	for (const spec of options.sessions) {
		if (spec.group) {
			membership.set(spec.id, spec.group);
		}
	}

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: ctx.theme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.define(IListService, ListService);
			reg.define(IMarkdownRendererService, MarkdownRendererService);
			reg.defineInstance(IChatService, new class extends mock<IChatService>() {
				override readonly chatModels: IObservable<Iterable<IChatModel>> = constObservable([]);
			}());
			reg.defineInstance(IAgentSessionsService, new class extends mock<IAgentSessionsService>() {
				override readonly model = new class extends mock<IAgentSessionsModel>() {
					override observeSession(): IObservable<IAgentSession | undefined> {
						return constObservable(undefined);
					}
				}();
			}());
			reg.defineInstance(ISessionsManagementService, new class extends mock<ISessionsManagementService>() {
				override readonly onDidChangeSessions = Event.None;
				override getSessions(): ISession[] { return [...sessions]; }
				override markRead(): Promise<void> { return Promise.resolve(); }
			}());
			reg.defineInstance(ISessionsService, new class extends mock<ISessionsService>() {
				override readonly visibleSessions: IObservable<readonly (IActiveSession | undefined)[]> = constObservable([]);
				override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(undefined);
			}());
			reg.defineInstance(ISessionsListModelService, new class extends mock<ISessionsListModelService>() {
				override readonly onDidChange = Event.None;
				override isSessionPinned(): boolean { return false; }
				override migrateLegacyReadState(): void { }
				override getSortKey(session: ISession): number { return session.createdAt.getTime(); }
				override getStatusIcon(status: SessionStatus): ThemeIcon {
					switch (status) {
						case SessionStatus.InProgress:
							return { ...Codicon.sessionInProgress, color: themeColorFromId('textLink.foreground') };
						case SessionStatus.NeedsInput:
							return { ...Codicon.circleFilled, color: themeColorFromId('list.warningForeground') };
						default:
							return { ...Codicon.circleSmallFilled, color: themeColorFromId('agentSessionReadIndicator.foreground') };
					}
				}
			}());
			reg.defineInstance(ISessionGroupsService, new class extends mock<ISessionGroupsService>() {
				override readonly onDidChange = Event.None;
				override getGroups(): ISessionGroup[] { return [...groups]; }
				override getGroup(groupId: string): ISessionGroup | undefined { return groups.find(group => group.id === groupId); }
				override getGroupOfSession(sessionId: string): string | undefined { return membership.get(sessionId); }
				override getSessionIdsInGroup(groupId: string): string[] {
					return [...membership].filter(([, id]) => id === groupId).map(([sessionId]) => sessionId);
				}
			}());
			reg.defineInstance(ISessionSectionOrderService, new class extends mock<ISessionSectionOrderService>() {
				override readonly onDidChange = Event.None;
				override resolveOrder(ids: readonly string[]) { return [...ids]; }
				override isPromoted() { return false; }
				override retain(): void { }
			}());
			reg.defineInstance(IAgentHostFilterService, new class extends mock<IAgentHostFilterService>() {
				override readonly onDidChange = Event.None;
				override readonly selectedProviderId = undefined;
			}());
			reg.defineInstance(ISessionsProvidersService, new class extends mock<ISessionsProvidersService>() {
				override readonly onDidChangeProviders = Event.None;
				override getProviders() { return []; }
				override getProvider() { return undefined; }
			}());
			reg.defineInstance(IVoicePlaybackService, new class extends mock<IVoicePlaybackService>() {
				override readonly pendingResponseVersion: IObservable<number> = constObservable(0);
				override hasPendingResponse() { return false; }
			}());
			reg.defineInstance(IAutomationService, new class extends mock<IAutomationService>() {
				override readonly runs = constObservable([]);
			}());
			reg.defineInstance(IWorkbenchAssignmentService, new class extends mock<IWorkbenchAssignmentService>() {
				override readonly onDidRefetchAssignments = Event.None;
				override async getTreatment<T extends string | number | boolean>(): Promise<T | undefined> { return undefined; }
			}());
			reg.defineInstance(IUriIdentityService, new class extends mock<IUriIdentityService>() {
				override readonly extUri = new ExtUri(() => true);
			}());
			reg.defineInstance(ICustomViewService, new class extends mock<ICustomViewService>() { }());
		},
	});

	const width = options.width ?? 340;
	container.style.width = `${width}px`;
	container.style.height = options.phone ? '260px' : '220px';
	container.style.backgroundColor = 'var(--vscode-sideBar-background, var(--vscode-editor-background))';
	if (options.phone) {
		container.classList.add('agent-sessions-workbench', 'phone-layout');
	}

	const listHost = container.ownerDocument.createElement('div');
	container.appendChild(listHost);
	const list = disposableStore.add(instantiationService.createInstance(SessionsList, listHost, {
		grouping: () => options.grouping ?? SessionsGrouping.Workspace,
		sorting: () => SessionsSorting.Created,
		onSessionOpen: () => { },
	}));
	list.layout(options.phone ? 260 : 220, width);
}

const GROUP: ISessionGroup = { id: 'group-1', name: 'Release work', createdAt: Date.now() };
const GROUPED_SESSIONS: readonly ISessionSpec[] = [
	{ id: 'a', title: 'Fix authentication redirect loop', workspace: 'vscode', minutesAgo: 12, group: GROUP.id, changesSummary: { files: 4, additions: 132, deletions: 18 } },
	{ id: 'b', title: 'Add reconnect backoff', workspace: 'agent-host-protocol', minutesAgo: 64, group: GROUP.id },
	{ id: 'c', title: 'Update onboarding copy', workspace: 'vscode-docs', minutesAgo: 180 },
];

export default defineThemedFixtureGroup({ path: 'sessions/' }, {
	SessionsList_CustomGroup: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, { sessions: GROUPED_SESSIONS, groups: [GROUP] }),
	}),
	SessionsList_CustomGroup_LongWorkspaceNarrow: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, {
			sessions: [
				{ id: 'a', title: 'Fix authentication redirect loop', workspace: 'an-extremely-long-workspace-name-that-must-truncate', minutesAgo: 12, group: GROUP.id, changesSummary: { files: 4, additions: 132, deletions: 18 } },
				...GROUPED_SESSIONS.slice(1),
			],
			groups: [GROUP],
			width: 260,
		}),
	}),
	SessionsList_CustomGroup_InProgress: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, {
			sessions: [
				{ id: 'a', title: 'Fix authentication redirect loop', workspace: 'agent-host-protocol', minutesAgo: 1, group: GROUP.id, status: SessionStatus.InProgress, description: 'Running the integration suite' },
				...GROUPED_SESSIONS.slice(1),
			],
			groups: [GROUP],
			width: 260,
		}),
	}),
	SessionsList_WorkspaceSection: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, {
			sessions: [{ id: 'c', title: 'Update onboarding copy', workspace: 'vscode-docs', minutesAgo: 180 }],
		}),
	}),
	SessionsList_CustomGroup_Phone: defineComponentFixture({
		render: ctx => renderSessionsList(ctx, { sessions: GROUPED_SESSIONS, groups: [GROUP], phone: true, width: 340 }),
	}),
});
