/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { IMenuService } from '../../../../../platform/actions/common/actions.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { IOpenerService, OpenExternalOptions, OpenInternalOptions } from '../../../../../platform/opener/common/opener.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IPreferencesService, IOpenSettingsOptions } from '../../../../../workbench/services/preferences/common/preferences.js';
import { getSessionChatDragData, isSessionChatDrag, SessionsDataTransfers } from '../../../../browser/dnd.js';
import { IsPhoneLayoutContext } from '../../../../common/contextkeys.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { ISessionsListModelService } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ChatInteractivity, ChatOriginKind, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { computeReorderSortChanges, groupByDate, groupByWorkspace, groupSessionsForList, ISessionSection, limitSessionsForList, SessionSectionRenderer, SessionsFlatList, SessionsList, sortSessions, SessionsGrouping, SessionsSorting } from '../../browser/views/sessionsList.js';
import { AgentSessionApprovalKind, AgentSessionApprovalModel, IAgentSessionApprovalInfo } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionApprovalModel.js';
import { getSessionSummaryHoverData } from '../../browser/sessionHoverContent.js';
import { createListHarness, createTestSession } from './sessionsListTestUtils.js';
import '../../browser/views/sessionsViewActions.js';

function createSession(id: string, opts: {
	workspaceLabel?: string;
	createdAt?: Date;
	updatedAt?: Date;
	isArchived?: boolean;
	isRead?: boolean;
	isAutomation?: boolean;
	isExternal?: boolean;
	resource?: URI;
}): ISession {
	const createdAt = opts.createdAt ?? new Date();
	const updatedAt = opts.updatedAt ?? createdAt;
	return {
		sessionId: id,
		resource: opts.resource ?? URI.parse(`session://${id}`),
		providerId: 'test',
		sessionType: 'test',
		icon: Codicon.account,
		createdAt,
		workspace: observableValue(`workspace-${id}`, opts.workspaceLabel !== undefined ? {
			uri: URI.parse(`session://workspace/${id}`),
			label: opts.workspaceLabel,
			icon: Codicon.folder,
			folders: [],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		} : undefined),
		isQuickChat: observableValue(`isQuickChat-${id}`, opts.workspaceLabel === undefined),
		isAutomation: observableValue(`isAutomation-${id}`, opts.isAutomation === true),
		isExternal: observableValue(`isExternal-${id}`, opts.isExternal === true),
		title: observableValue(`title-${id}`, id),
		updatedAt: observableValue(`updatedAt-${id}`, updatedAt),
		status: observableValue(`status-${id}`, SessionStatus.Completed),
		changesets: observableValue(`changesets-${id}`, []),
		changes: observableValue(`changes-${id}`, []),
		modelId: observableValue(`modelId-${id}`, undefined),
		mode: observableValue(`mode-${id}`, undefined),
		loading: observableValue(`loading-${id}`, false),
		isArchived: observableValue(`isArchived-${id}`, opts.isArchived ?? false),
		isRead: observableValue(`isRead-${id}`, opts.isRead ?? true),
		description: observableValue(`description-${id}`, undefined),
		lastTurnEnd: observableValue(`lastTurnEnd-${id}`, undefined),
		chats: observableValue<readonly IChat[]>(`chats-${id}`, []),
		mainChat: observableValue<IChat>(`mainChat-${id}`, undefined!),
		capabilities: constObservable({ supportsMultipleChats: false }),
	};
}

suite('Sessions - SessionsList', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('SessionSectionRenderer', () => {

		test('selects the rendered section before the toolbar handles its context menu', () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stubInstance(MenuWorkbenchToolBar, new class extends mock<MenuWorkbenchToolBar>() {
				override set context(_context: unknown) { }
				override dispose(): void { }
			});
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = constObservable<readonly IAutomationRun[]>([]);
			};
			const selectedSections: ISessionSection[] = [];
			const renderer = new SessionSectionRenderer(
				true,
				section => selectedSections.push(section),
				instantiationService,
				contextKeyService,
				automationService,
				constObservable([]),
				new class extends mock<IUriIdentityService>() {
					override readonly extUri = new ExtUri(() => true);
				},
				new class extends mock<ICustomViewService>() { },
				new class extends mock<IMenuService>() { },
			);
			const container = document.createElement('div');
			const template = renderer.renderTemplate(container);
			disposables.add(template.disposables);
			const section: ISessionSection = { id: 'workspace:test', label: 'Test', sessions: [] };
			renderer.renderElement(upcastPartial<Parameters<SessionSectionRenderer['renderElement']>[0]>({
				element: section,
				collapsible: true,
				collapsed: false,
			}), 0, template);
			const action = document.createElement('a');
			template.toolbarContainer.append(action);
			action.addEventListener('contextmenu', event => event.stopPropagation());

			action.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));

			assert.deepStrictEqual(selectedSections, [section]);
		});

		test('renders in-progress automation status in the leading icon slot', () => {
			const instantiationService = disposables.add(new TestInstantiationService());
			instantiationService.stubInstance(MenuWorkbenchToolBar, new class extends mock<MenuWorkbenchToolBar>() {
				override set context(_context: unknown) { }
				override dispose(): void { }
			});
			instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
				override isMotionReduced(): boolean { return false; }
			}());
			instantiationService.stub(ISessionsListModelService, new class extends mock<ISessionsListModelService>() { });
			const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = constObservable<readonly IAutomationRun[]>([{
					id: 'pending',
					automationId: 'automation',
					status: 'pending',
					trigger: 'schedule',
					startedAt: '2026-08-14T00:00:00.000Z',
					leaderWindowId: 1,
				}]);
			};
			const renderer = new SessionSectionRenderer(
				true,
				() => { },
				instantiationService,
				contextKeyService,
				automationService,
				constObservable([]),
				new class extends mock<IUriIdentityService>() {
					override readonly extUri = new ExtUri(() => true);
				},
				new class extends mock<ICustomViewService>() {
					override readonly activeCustomView = constObservable(undefined);
				},
				new class extends mock<IMenuService>() { },
			);
			const container = document.createElement('div');
			const template = renderer.renderTemplate(container);
			disposables.add(template.disposables);

			renderer.renderElement(upcastPartial<Parameters<SessionSectionRenderer['renderElement']>[0]>({
				element: { id: 'automations', label: 'Automations', sessions: [] },
				collapsible: false,
				collapsed: false,
			}), 0, template);

			const spinner = container.querySelector('.monaco-pixel-spinner');
			assert.deepStrictEqual({
				watchIcon: !!container.querySelector('.session-section-icon.codicon-watch'),
				spinnerParent: spinner?.parentElement?.className,
				trailingStatusIndicator: !!container.querySelector('.session-section-status-indicator'),
			}, {
				watchIcon: false,
				spinnerParent: 'session-section-icon',
				trailingStatusIndicator: false,
			});
		});

		test('derives terminal automation status from the supplied session snapshot', () => {
			const session = createSession('automation', {
				isRead: false,
				resource: URI.parse('test-session:/Workspace/Automation'),
			});
			const managementCalls: string[] = [];
			const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
				override getSessions(): ISession[] {
					managementCalls.push('getSessions');
					return [session];
				}

				override getSession(resource: URI): ISession | undefined {
					managementCalls.push(`getSession:${resource.toString()}`);
					return session;
				}
			};
			const automationSessions = constObservable(sessionsManagementService.getSessions());
			managementCalls.length = 0;
			const runs = observableValue<readonly IAutomationRun[]>('automationRuns', []);
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = runs;
			};
			const uriIdentityService = new class extends mock<IUriIdentityService>() {
				override readonly extUri = new ExtUri(() => true);
			};
			const renderer = new SessionSectionRenderer(
				true,
				() => { },
				new class extends mock<IInstantiationService>() { },
				new class extends mock<IContextKeyService>() { },
				automationService,
				automationSessions,
				uriIdentityService,
				new class extends mock<ICustomViewService>() { },
				new class extends mock<IMenuService>() { },
			);
			const runResource = URI.parse('test-session:/workspace/automation');
			const statuses: (SessionStatus | undefined)[] = [];
			for (const status of ['completed', 'failed'] as const) {
				runs.set([{
					id: status,
					automationId: 'automation',
					status,
					trigger: 'schedule',
					sessionResource: runResource,
					startedAt: '2026-08-10T00:00:00.000Z',
					leaderWindowId: 1,
				}], undefined);
				statuses.push(renderer.automationStatus.get());
			}

			assert.deepStrictEqual({
				resourcesAreDistinct: session.resource.toString() !== runResource.toString(),
				resourcesAreEquivalent: uriIdentityService.extUri.isEqual(session.resource, runResource),
				statuses,
				managementCalls,
			}, {
				resourcesAreDistinct: true,
				resourcesAreEquivalent: true,
				statuses: [SessionStatus.Completed, SessionStatus.Completed],
				managementCalls: [],
			});
		});

		test('needs-input automation status takes priority over other running runs', () => {
			const runningSession = createSession('automation-running', {
				resource: URI.parse('test-session:/Workspace/Automation-Running'),
			});
			const needsInputSession = createSession('automation-needs-input', {
				resource: URI.parse('test-session:/Workspace/Automation-Needs-Input'),
			});
			const runningStatus = runningSession.status as ReturnType<typeof observableValue<SessionStatus>>;
			const needsInputStatus = needsInputSession.status as ReturnType<typeof observableValue<SessionStatus>>;
			runningStatus.set(SessionStatus.InProgress, undefined);
			needsInputStatus.set(SessionStatus.InProgress, undefined);
			const runs = observableValue<readonly IAutomationRun[]>('automationRuns', []);
			const automationService = new class extends mock<IAutomationService>() {
				override readonly runs = runs;
			};
			const uriIdentityService = new class extends mock<IUriIdentityService>() {
				override readonly extUri = new ExtUri(() => true);
			};
			const renderer = new SessionSectionRenderer(
				true,
				() => { },
				new class extends mock<IInstantiationService>() { },
				new class extends mock<IContextKeyService>() { },
				automationService,
				constObservable([runningSession, needsInputSession]),
				uriIdentityService,
				new class extends mock<ICustomViewService>() { },
				new class extends mock<IMenuService>() { },
			);
			runs.set([
				{
					id: 'running',
					automationId: 'automation',
					status: 'running',
					trigger: 'schedule',
					sessionResource: runningSession.resource,
					startedAt: '2026-08-10T00:00:00.000Z',
					leaderWindowId: 1,
				},
				{
					id: 'needs-input',
					automationId: 'automation',
					status: 'running',
					trigger: 'schedule',
					sessionResource: needsInputSession.resource,
					startedAt: '2026-08-10T00:00:00.000Z',
					leaderWindowId: 1,
				},
			], undefined);

			assert.strictEqual(renderer.automationStatus.get(), SessionStatus.InProgress);

			needsInputStatus.set(SessionStatus.NeedsInput, undefined);
			assert.strictEqual(renderer.automationStatus.get(), SessionStatus.NeedsInput);

			needsInputStatus.set(SessionStatus.InProgress, undefined);
			assert.strictEqual(renderer.automationStatus.get(), SessionStatus.InProgress);
		});
	});

	suite('groupByWorkspace', () => {

		test('groups are sorted alphabetically regardless of insertion order', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Zebra' }),
				createSession('2', { workspaceLabel: 'Apple' }),
				createSession('3', { workspaceLabel: 'Mango' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Apple', 'Mango', 'Zebra']);
		});

		test('sessions without workspace are grouped under "Unknown"', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Beta' }),
				createSession('2', {}),
				createSession('3', { workspaceLabel: 'Alpha' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Beta', 'Unknown']);
		});

		test('multiple sessions in same workspace are grouped together', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Repo-B' }),
				createSession('2', { workspaceLabel: 'Repo-A' }),
				createSession('3', { workspaceLabel: 'Repo-B' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Repo-A', 'Repo-B']);
			assert.strictEqual(groups[0].sessions.length, 1);
			assert.strictEqual(groups[1].sessions.length, 2);
		});

		test('"No Workspace" appears after workspaces that sort alphabetically later', () => {
			const sessions = [
				createSession('1', {}),
				createSession('2', { workspaceLabel: 'Zulu' }),
				createSession('3', { workspaceLabel: 'Alpha' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Alpha', 'Zulu', 'Unknown']);
		});

		test('empty workspace label is treated as "Unknown"', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'Zulu' }),
				createSession('2', { workspaceLabel: '' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.deepStrictEqual(groups.map(g => g.label), ['Zulu', 'Unknown']);
			assert.strictEqual(groups[1].sessions.length, 1);
		});

		test('group ids are prefixed with workspace:', () => {
			const sessions = [
				createSession('1', { workspaceLabel: 'MyProject' }),
			];

			const groups = groupByWorkspace(sessions);

			assert.strictEqual(groups[0].id, 'workspace:MyProject');
		});
	});

	suite('groupByDate', () => {

		const DAY_MS = 86_400_000;

		// `groupByDate` expects sessions pre-sorted most-recent-first.
		function minutesAgo(minutes: number): Date {
			return new Date(Date.now() - minutes * 60_000);
		}

		function daysAgo(days: number): Date {
			return new Date(Date.now() - days * DAY_MS);
		}

		test('sessions within the last 7 days go to "Recent", older ones to "Older"', () => {
			const sessions = [
				createSession('recent-1', { createdAt: minutesAgo(5) }),
				createSession('recent-2', { createdAt: daysAgo(3) }),
				createSession('old-1', { createdAt: daysAgo(10) }),
				createSession('old-2', { createdAt: daysAgo(30) }),
			];

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => ({ id: s.id, sessions: s.sessions.map(session => session.sessionId) })), [
				{ id: 'recent', sessions: ['recent-1', 'recent-2'] },
				{ id: 'older', sessions: ['old-1', 'old-2'] },
			]);
		});

		test('"Recent" is capped at 10 sessions; the overflow within 7 days falls into "Older"', () => {
			const sessions = Array.from({ length: 13 }, (_, i) =>
				createSession(`s${i}`, { createdAt: minutesAgo(i + 1) }));

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => ({ id: s.id, sessions: s.sessions.map(session => session.sessionId) })), [
				{ id: 'recent', sessions: ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'] },
				{ id: 'older', sessions: ['s10', 's11', 's12'] },
			]);
		});

		test('empty sections are omitted', () => {
			const sessions = [
				createSession('only-old', { createdAt: daysAgo(20) }),
			];

			const sections = groupByDate(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sections.map(s => s.id), ['older']);
		});
	});

	suite('sortSessions', () => {

		test('sorts by createdAt descending when sorting is Created', () => {
			const sessions = [
				createSession('old', { createdAt: new Date('2024-01-01') }),
				createSession('new', { createdAt: new Date('2024-06-01') }),
				createSession('mid', { createdAt: new Date('2024-03-01') }),
			];

			const sorted = sortSessions(sessions, SessionsSorting.Created);

			assert.deepStrictEqual(sorted.map(s => s.sessionId), ['new', 'mid', 'old']);
		});

		test('sorts by updatedAt descending when sorting is Updated', () => {
			const sessions = [
				createSession('a', { createdAt: new Date('2024-06-01'), updatedAt: new Date('2024-07-01') }),
				createSession('b', { createdAt: new Date('2024-01-01'), updatedAt: new Date('2024-09-01') }),
				createSession('c', { createdAt: new Date('2024-03-01'), updatedAt: new Date('2024-08-01') }),
			];

			const sorted = sortSessions(sessions, SessionsSorting.Updated);

			assert.deepStrictEqual(sorted.map(s => s.sessionId), ['b', 'c', 'a']);
		});
	});

	suite('limitSessionsForList', () => {

		test('caps sessions and returns a show more item', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: true,
				expanded: false,
				sectionId: 'group:alpha',
				sectionLabel: 'Alpha',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2'],
				showMore: {
					showMore: true,
					kind: 'sessions',
					mode: 'more',
					sectionId: 'group:alpha',
					sectionLabel: 'Alpha',
					remainingCount: 1,
				},
			});
		});

		test('returns all sessions and a show less item when expanded', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: true,
				expanded: true,
				sectionId: 'group:alpha',
				sectionLabel: 'Alpha',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2', '3'],
				showMore: {
					showMore: true,
					kind: 'sessions',
					mode: 'less',
					sectionId: 'group:alpha',
					sectionLabel: 'Alpha',
					remainingCount: 0,
				},
			});
		});

		test('does not cap when disabled', () => {
			const sessions = ['1', '2', '3'].map(id => createSession(id, {}));
			const result = limitSessionsForList(sessions, 2, {
				enabled: false,
				expanded: false,
				sectionId: 'group:alpha',
				sectionLabel: 'Alpha',
			});

			assert.deepStrictEqual({
				sessions: result.sessions.map(session => session.sessionId),
				showMore: result.showMore,
			}, {
				sessions: ['1', '2', '3'],
				showMore: undefined,
			});
		});
	});

	test('created session hover includes its creator action', () => {
		const createdSession = createSession('Created', { workspaceLabel: 'Workspace' });
		const onOpen = () => { };
		const hover = getSessionSummaryHoverData(
			createdSession,
			new class extends mock<ISessionsProvidersService>() {
				override getProvider() { return undefined; }
			},
			new class extends mock<IOpenerService>() { },
			new class extends mock<ILabelService>() { },
			new class extends mock<IPreferencesService>() { },
			{
				title: 'Creator session',
				onOpen,
			},
		);

		assert.deepStrictEqual(hover.createdBy, {
			title: 'Creator session',
			onOpen,
		});
	});

	test('external session hover leads to the setting that governs external sessions', () => {
		const queries: (string | undefined)[] = [];
		const hoverFor = (isExternal: boolean) => getSessionSummaryHoverData(
			createSession(isExternal ? 'External' : 'Local', { workspaceLabel: 'Workspace', isExternal }),
			new class extends mock<ISessionsProvidersService>() {
				override getProvider() { return undefined; }
			},
			new class extends mock<IOpenerService>() { },
			new class extends mock<ILabelService>() { },
			new class extends mock<IPreferencesService>() {
				override async openSettings(options?: IOpenSettingsOptions): Promise<undefined> {
					queries.push(options?.query);
					return undefined;
				}
			},
		);
		const externalHover = hoverFor(true);
		externalHover.externalSession?.onOpen();

		assert.deepStrictEqual({
			external: !!externalHover.externalSession,
			local: !!hoverFor(false).externalSession,
			queries,
		}, {
			external: true,
			local: false,
			queries: ['@id:chat.agentSessions.showExternal'],
		});
	});

	test('session hover links each pull request and opens it externally', () => {
		const pullRequestUri = URI.parse('https://github.com/microsoft/vscode/pull/241533');
		const root = URI.file('/home/user/projects/vscode');
		const session = upcastPartial<ISession>({
			providerId: 'test',
			sessionType: 'test',
			title: constObservable('Fix the redirect loop'),
			isQuickChat: constObservable(false),
			worktreePending: constObservable(false),
			changes: constObservable([]),
			workspace: constObservable({
				uri: root,
				label: 'vscode',
				icon: Codicon.folder,
				requiresWorkspaceTrust: false,
				isVirtualWorkspace: false,
				folders: [{
					root,
					workingDirectory: root,
					name: 'vscode',
					description: undefined,
					gitRepository: {
						uri: root,
						workTreeUri: undefined,
						baseBranchName: 'main',
						gitHubInfo: constObservable({
							owner: 'microsoft',
							repo: 'vscode',
							pullRequests: [
								{ owner: 'microsoft', repo: 'vscode', number: 241533, uri: pullRequestUri, title: 'Fix the redirect loop', createdByThisSession: true },
								// Inherited from the checkout, so never listed.
								{ owner: 'microsoft', repo: 'vscode', number: 9001, uri: URI.parse('https://github.com/microsoft/vscode/pull/9001'), createdByThisSession: false },
							],
						}),
					},
				}],
			}),
		});
		const opened: { resource: URI | string; openExternal: boolean | undefined }[] = [];
		const hover = getSessionSummaryHoverData(
			session,
			new class extends mock<ISessionsProvidersService>() {
				override getProvider() { return undefined; }
			},
			new class extends mock<IOpenerService>() {
				override async open(resource: URI | string, options?: OpenInternalOptions | OpenExternalOptions): Promise<boolean> {
					opened.push({ resource, openExternal: (options as OpenExternalOptions | undefined)?.openExternal });
					return true;
				}
			},
			new class extends mock<ILabelService>() {
				override getUriLabel(resource: URI): string { return resource.path; }
			},
			new class extends mock<IPreferencesService>() { },
		);
		hover.pullRequests?.forEach(pullRequest => pullRequest.onOpen?.());

		assert.deepStrictEqual({
			pullRequests: hover.pullRequests?.map(pullRequest => ({ title: pullRequest.title, uri: pullRequest.uri?.toString() })),
			opened,
		}, {
			pullRequests: [{ title: 'Fix the redirect loop', uri: pullRequestUri.toString() }],
			opened: [{ resource: pullRequestUri, openExternal: true }],
		});
	});

	suite('groupSessionsForList', () => {

		test('shows pinned sessions in a dedicated top section', () => {
			const pinned = createSession('pinned', { workspaceLabel: 'Alpha', createdAt: new Date('2024-06-01') });
			const regular = createSession('regular', { workspaceLabel: 'Beta', createdAt: new Date('2024-05-01') });
			const sections = groupSessionsForList(
				[pinned, regular],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				session => session.sessionId === pinned.sessionId,
			);

			assert.deepStrictEqual(sections.map(section => section.id), ['pinned', 'workspace:Beta']);
			assert.deepStrictEqual(sections[0].sessions.map(session => session.sessionId), ['pinned']);
		});

		test('keeps archived sessions in Done even when pinned', () => {
			const archivedPinned = createSession('archived-pinned', { workspaceLabel: 'Alpha', isArchived: true, createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[archivedPinned],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => true,
			);

			assert.deepStrictEqual(sections.map(section => section.id), ['archived']);
			assert.deepStrictEqual(sections[0].sessions.map(session => session.sessionId), ['archived-pinned']);
		});

		test('sorts pinned sessions using supplied sort keys', () => {
			const first = createSession('first', { createdAt: new Date('2024-01-01') });
			const second = createSession('second', { createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[first, second],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => true,
				session => session.sessionId === first.sessionId ? 200 : 100,
			);

			assert.deepStrictEqual(sections.map(section => ({ id: section.id, sessions: section.sessions.map(session => session.sessionId) })), [
				{ id: 'pinned', sessions: ['first', 'second'] },
			]);
		});

		test('workspace-less sessions form a Chats section directly below Pinned (above groups)', () => {
			const pinned = createSession('pinned', { workspaceLabel: 'Alpha', createdAt: new Date('2024-06-03') });
			const quick = createSession('quick', { createdAt: new Date('2024-06-02') });
			const regular = createSession('regular', { workspaceLabel: 'Beta', createdAt: new Date('2024-06-01') });
			const archived = createSession('archived', { workspaceLabel: 'Gamma', isArchived: true, createdAt: new Date('2024-05-01') });
			const sections = groupSessionsForList(
				[pinned, quick, regular, archived],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				session => session.sessionId === pinned.sessionId,
			);

			assert.deepStrictEqual(sections.map(section => ({ id: section.id, sessions: section.sessions.map(s => s.sessionId) })), [
				{ id: 'pinned', sessions: ['pinned'] },
				{ id: 'quickchats', sessions: ['quick'] },
				{ id: 'workspace:Beta', sessions: ['regular'] },
				{ id: 'archived', sessions: ['archived'] },
			]);
		});

		test('pinned quick chat stays in Pinned, not Quick Chats', () => {
			const quick = createSession('quick', { createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[quick],
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				() => true,
			);

			assert.deepStrictEqual(sections.map(section => section.id), ['pinned']);
		});

		test('Chats section sits directly below Pinned when grouping by date', () => {
			const pinned = createSession('pinned', { createdAt: new Date('2024-06-03') });
			const quick = createSession('quick', { createdAt: new Date('2024-06-02') });
			const regular = createSession('regular', { workspaceLabel: 'Beta', createdAt: new Date('2024-06-01') });
			const sections = groupSessionsForList(
				[pinned, quick, regular],
				SessionsGrouping.Date,
				SessionsSorting.Created,
				session => session.sessionId === pinned.sessionId,
			);

			assert.strictEqual(sections[0].id, 'pinned');
			assert.strictEqual(sections[1].id, 'quickchats');
			assert.deepStrictEqual(sections[1].sessions.map(s => s.sessionId), ['quick']);
		});

		test('excludes automation sessions from every section', () => {
			const sessions = [
				createSession('workspace-automation', { workspaceLabel: 'Alpha', isAutomation: true }),
				createSession('quick-automation', { isAutomation: true }),
				createSession('archived-automation', { workspaceLabel: 'Beta', isArchived: true, isAutomation: true }),
				createSession('visible', { workspaceLabel: 'Gamma' }),
			];
			const sections = groupSessionsForList(
				sessions,
				SessionsGrouping.Workspace,
				SessionsSorting.Created,
				session => session.sessionId === 'workspace-automation',
			);

			assert.deepStrictEqual(sections.map(section => ({
				id: section.id,
				sessions: section.sessions.map(session => session.sessionId),
			})), [
				{ id: 'workspace:Gamma', sessions: ['visible'] },
			]);
		});
	});

	suite('workspace badge on custom-group rows', () => {
		const group = { id: 'group-1', name: 'My Group', createdAt: 1 };

		function renderList(
			sessions: ISession[],
			grouping: SessionsGrouping,
			options: { memberships?: ReadonlyMap<string, string>; pinnedSessionIds?: ReadonlySet<string>; expandSections?: readonly string[] } = {},
		): { readonly list: SessionsList; readonly container: HTMLElement } {
			const harness = createListHarness(disposables, sessions, {
				groups: [group],
				memberships: options.memberships,
				pinnedSessionIds: options.pinnedSessionIds,
			});
			if (options.expandSections) {
				harness.instantiationService.get(IStorageService).store(
					'sessionsListControl.sectionCollapseState',
					JSON.stringify(Object.fromEntries(options.expandSections.map(section => [section, false]))),
					StorageScope.PROFILE,
					StorageTarget.USER,
				);
			}
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => grouping,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			return { list, container };
		}

		function rowSnapshot(container: HTMLElement): { title: string; badge: string | undefined; ariaLabel: string | null; details: string }[] {
			return [...container.querySelectorAll<HTMLElement>('.session-item')].map(item => ({
				title: item.querySelector('.session-title')?.textContent ?? '',
				badge: item.querySelector('.session-badge')?.textContent ?? undefined,
				ariaLabel: item.closest('.monaco-list-row')?.getAttribute('aria-label') ?? null,
				details: item.querySelector('.session-details-row')?.textContent ?? '',
			}));
		}

		test('workspace grouping shows a badge only under a custom group', () => {
			const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
			const ordinary = createTestSession('Ordinary', { workspaceLabel: 'vscode' }).session;
			const { container } = renderList([grouped, ordinary], SessionsGrouping.Workspace, {
				memberships: new Map([[grouped.sessionId, group.id]]),
			});

			assert.deepStrictEqual(rowSnapshot(container).map(row => ({ title: row.title, badge: row.badge })), [
				{ title: 'Grouped', badge: 'vscode' },
				{ title: 'Ordinary', badge: undefined },
			]);
		});

		test('date grouping keeps workspace badges on grouped and ordinary rows', () => {
			const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
			const ordinary = createTestSession('Ordinary', { workspaceLabel: 'monaco' }).session;
			const { container } = renderList([grouped, ordinary], SessionsGrouping.Date, {
				memberships: new Map([[grouped.sessionId, group.id]]),
			});

			assert.deepStrictEqual(rowSnapshot(container).map(row => ({ title: row.title, badge: row.badge })), [
				{ title: 'Grouped', badge: 'vscode' },
				{ title: 'Ordinary', badge: 'monaco' },
			]);
		});

		test('pin and archive take precedence over group membership and retain their badges', () => {
			const pinned = createTestSession('Pinned', { workspaceLabel: 'vscode' }).session;
			const archived = createTestSession('Archived', { workspaceLabel: 'monaco', isArchived: true }).session;
			const memberships = new Map([[pinned.sessionId, group.id], [archived.sessionId, group.id]]);
			const { list, container } = renderList([pinned, archived], SessionsGrouping.Workspace, {
				memberships,
				pinnedSessionIds: new Set([pinned.sessionId]),
				expandSections: ['pinned', 'archived'],
			});
			list.setExcludeArchived(false);
			list.layout(300, 400);

			assert.deepStrictEqual({
				renderedGroups: [list.getRenderedSessionGroup(pinned)?.id, list.getRenderedSessionGroup(archived)?.id],
				rows: rowSnapshot(container).map(row => ({ title: row.title, badge: row.badge })),
			}, {
				renderedGroups: [undefined, undefined],
				rows: [
					{ title: 'Pinned', badge: 'vscode' },
					{ title: 'Archived', badge: 'monaco' },
				],
			});
		});

		test('quick chats never show a workspace badge', () => {
			const quickChat = createTestSession('Quick Chat', { isQuickChat: true }).session;
			const { container } = renderList([quickChat], SessionsGrouping.Date, {
				memberships: new Map([[quickChat.sessionId, group.id]]),
			});

			assert.deepStrictEqual(rowSnapshot(container).map(row => ({ title: row.title, badge: row.badge, details: row.details })), [
				{ title: 'Quick Chat', badge: undefined, details: '' },
			]);
		});

		test('in-progress and needs-input grouped rows suppress the workspace badge', () => {
			const inProgress = createTestSession('Working', { workspaceLabel: 'vscode', status: SessionStatus.InProgress }).session;
			const needsInput = createTestSession('Needs Input', { workspaceLabel: 'monaco', status: SessionStatus.NeedsInput }).session;
			const { container } = renderList([inProgress, needsInput], SessionsGrouping.Workspace, {
				memberships: new Map([[inProgress.sessionId, group.id], [needsInput.sessionId, group.id]]),
			});

			assert.deepStrictEqual(Object.fromEntries(rowSnapshot(container).map(row => [row.title, {
				badge: row.badge,
				ariaHasWorkspace: row.ariaLabel?.includes(' in ') ?? false,
			}])), {
				Working: { badge: undefined, ariaHasWorkspace: false },
				'Needs Input': { badge: undefined, ariaHasWorkspace: false },
			});
		});

		test('accessible names include workspace exactly when the badge is visible', () => {
			const grouped = createTestSession('Grouped', { workspaceLabel: 'vscode' }).session;
			const ordinary = createTestSession('Ordinary', { workspaceLabel: 'monaco' }).session;
			const workspaceRows = renderList([grouped, ordinary], SessionsGrouping.Workspace, {
				memberships: new Map([[grouped.sessionId, group.id]]),
			}).container;
			const dateRows = renderList([ordinary], SessionsGrouping.Date).container;

			assert.deepStrictEqual({
				workspace: rowSnapshot(workspaceRows).map(row => ({ title: row.title, badge: row.badge, ariaLabel: row.ariaLabel })),
				date: rowSnapshot(dateRows).map(row => ({ title: row.title, badge: row.badge, ariaLabel: row.ariaLabel })),
			}, {
				workspace: [
					{ title: 'Grouped', badge: 'vscode', ariaLabel: 'Grouped, updated now, State: Completed, in vscode' },
					{ title: 'Ordinary', badge: undefined, ariaLabel: 'Ordinary, updated now, State: Completed' },
				],
				date: [
					{ title: 'Ordinary', badge: 'monaco', ariaLabel: 'Ordinary, updated now, State: Completed, in monaco' },
				],
			});
		});
	});

	suite('session row spacing', () => {
		test('reserves spacing only in the main sessions list', () => {
			const sessions = [
				createTestSession('First').session,
				createTestSession('Second').session,
			];

			const mainHarness = createListHarness(disposables, sessions);
			const mainContainer = mainHarness.createContainer();
			const mainList = mainHarness.store.add(mainHarness.instantiationService.createInstance(SessionsList, mainContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			mainList.layout(300, 400);

			const flatHarness = createListHarness(disposables, sessions);
			const flatContainer = flatHarness.createContainer();
			const flatList = flatHarness.store.add(flatHarness.instantiationService.createInstance(SessionsFlatList, flatContainer, {
				showSessionHover: false,
				onSessionOpen: () => { },
			}));
			flatList.setSessions(sessions);
			flatList.layout(300, 400);

			const mainRows = [...mainContainer.querySelectorAll<HTMLElement>('.session-item')]
				.map(item => item.closest<HTMLElement>('.monaco-list-row')!);
			const flatRows = [...flatContainer.querySelectorAll<HTMLElement>('.session-item')]
				.map(item => item.closest<HTMLElement>('.monaco-list-row')!);
			assert.deepStrictEqual({
				mainHasSpacingClass: mainContainer.querySelector('.sessions-list-control')?.classList.contains('session-list-row-spacing'),
				mainRowHeight: mainRows[0].style.height,
				mainRowOffset: parseInt(mainRows[1].style.top) - parseInt(mainRows[0].style.top),
				flatHasSpacingClass: flatContainer.querySelector('.sessions-list-control')?.classList.contains('session-list-row-spacing'),
				flatRowHeight: flatRows[0].style.height,
				flatRowOffset: parseInt(flatRows[1].style.top) - parseInt(flatRows[0].style.top),
			}, {
				mainHasSpacingClass: true,
				mainRowHeight: '56px',
				mainRowOffset: 56,
				flatHasSpacingClass: false,
				flatRowHeight: '54px',
				flatRowOffset: 54,
			});
		});
	});

	suite('session chat rows', () => {

		function createChat(title: string, origin?: ChatOriginKind, interactivity = ChatInteractivity.Full, status = SessionStatus.Completed): IChat {
			return upcastPartial<IChat>({
				resource: URI.parse(`test-chat://${title.replaceAll(' ', '-')}`),
				title: constObservable(title),
				updatedAt: constObservable(new Date()),
				status: constObservable(status),
				interactivity: constObservable(interactivity),
				origin: origin ? { kind: origin } : undefined,
			});
		}

		function renderSessionChats(session: ISession, onChatOpen?: (session: ISession, chat: IChat, preserveFocus: boolean, sideBySide: boolean) => void, enableMotion = false): HTMLElement {
			const harness = createListHarness(disposables, [session], enableMotion
				? instantiationService => instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
					override isMotionReduced(): boolean { return false; }
				})
				: {});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				onChatOpen,
			}));
			list.layout(300, 400);
			return container;
		}

		function chatRowTitles(container: HTMLElement): string[] {
			return [...container.querySelectorAll<HTMLElement>('.session-chat-title')].map(element => element.textContent ?? '');
		}

		test('shows non-main chats and excludes side chats, subagents, and hidden chats', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const fork = createChat('Forked chat', ChatOriginKind.Fork);
			const subagent = createChat('Subagent chat', ChatOriginKind.Tool);
			const side = createChat('Side chat', ChatOriginKind.SideChat);
			const hidden = createChat('Hidden chat', undefined, ChatInteractivity.Hidden);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer, fork, subagent, side, hidden]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);

			assert.deepStrictEqual(
				[...container.querySelectorAll<HTMLElement>('.session-chat-item')].map(item => ({
					title: item.querySelector('.session-chat-title')?.textContent,
					last: item.classList.contains('last-chat'),
				})),
				[
					{ title: 'Peer chat', last: false },
					{ title: 'Forked chat', last: true },
				]
			);
		});

		test('updates nested chat rows when the session chat catalog changes', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const chats = observableValue<readonly IChat[]>('session-chats', [main]);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats,
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const container = renderSessionChats(session);
			const before = chatRowTitles(container);

			chats.set([main, peer], undefined);

			assert.deepStrictEqual({
				before,
				after: chatRowTitles(container),
			}, {
				before: [],
				after: ['Peer chat'],
			});
		});

		test('hides the main chat even when its title matches the session title', () => {
			const main = createChat('Session');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);

			assert.deepStrictEqual({
				chats: chatRowTitles(container),
				hasTwistie: container.querySelector('.session-chat-twistie')?.classList.contains('collapsible'),
			}, {
				chats: ['Peer chat'],
				hasTwistie: true,
			});
		});

		test('shows progress for active chats and a dot for inactive chats', () => {
			const main = createChat('Main chat');
			const active = createChat('Active chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.InProgress);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, active]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const container = renderSessionChats(session, undefined, true);

			assert.deepStrictEqual(Object.fromEntries(
				[...container.querySelectorAll<HTMLElement>('.session-chat-item')].map(item => [
					item.querySelector('.session-chat-title')?.textContent,
					{
						hasProgress: !!item.querySelector('.session-chat-icon > .monaco-pixel-spinner'),
						hasDot: !!item.querySelector('.session-chat-icon > .codicon-circle-small-filled'),
						hasDiscussion: !!item.querySelector('.session-chat-icon > .codicon-comment-discussion'),
						ariaLabel: item.closest('.monaco-list-row')?.getAttribute('aria-label'),
					},
				])
			), {
				'Active chat': { hasProgress: true, hasDot: false, hasDiscussion: false, ariaLabel: 'Active chat, chat, updated now, State: In Progress' },
			});
		});

		test('needs-input chat row gets the same accent-pulse feedback class as a needs-input session row', () => {
			const main = createChat('Main chat');
			const waiting = createChat('Waiting chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, waiting]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);

			const waitingRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent?.includes('Waiting chat'));
			assert.ok(waitingRow);

			assert.strictEqual(waitingRow.classList.contains('needs-input'), true);
		});

		function sessionRowSnapshot(container: HTMLElement) {
			const row = container.querySelector<HTMLElement>('.session-item');
			assert.ok(row);
			return {
				inProgress: row.classList.contains('in-progress'),
				needsInput: row.classList.contains('needs-input'),
				ariaLabel: row.closest('.monaco-list-row')?.getAttribute('aria-label') ?? null,
			};
		}

		test('parent session row reflects the main chat status, not a non-main chat NeedsInput that drives the aggregate session status', () => {
			const main = createChat('Main chat', undefined, ChatInteractivity.Full, SessionStatus.Completed);
			const peer = createChat('Peer chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: constObservable(SessionStatus.NeedsInput),
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);

			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent?.includes('Peer chat'));
			assert.ok(peerRow);

			assert.deepStrictEqual({
				session: sessionRowSnapshot(container),
				peerChatNeedsInput: peerRow.closest('.monaco-list-row')?.getAttribute('aria-label'),
				aggregateStatus: session.status.get(),
			}, {
				session: { inProgress: false, needsInput: false, ariaLabel: 'Session, updated now, State: Completed, in Workspace' },
				peerChatNeedsInput: 'Peer chat, chat, updated now, State: Input Needed',
				aggregateStatus: SessionStatus.NeedsInput,
			});
		});

		test('parent session row still shows NeedsInput when the main chat itself needs input', () => {
			const main = createChat('Main chat', undefined, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const peer = createChat('Peer chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.Completed);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: constObservable(SessionStatus.NeedsInput),
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);

			assert.deepStrictEqual(sessionRowSnapshot(container), {
				inProgress: false,
				needsInput: true,
				ariaLabel: 'Session, updated now, State: Input Needed',
			});
		});

		test('parent session row updates reactively when the main chat status changes independently of a non-main chat', () => {
			const mainStatus = observableValue('main-status', SessionStatus.Completed);
			const main = upcastPartial<IChat>({
				resource: URI.parse('test-chat://Main-chat'),
				title: constObservable('Main chat'),
				updatedAt: constObservable(new Date()),
				status: mainStatus,
				interactivity: constObservable(ChatInteractivity.Full),
			});
			const peer = createChat('Peer chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.NeedsInput);
			const aggregateStatus = observableValue('aggregate-status', SessionStatus.NeedsInput);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				status: aggregateStatus,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);
			const before = sessionRowSnapshot(container);

			mainStatus.set(SessionStatus.NeedsInput, undefined);

			assert.deepStrictEqual({ before, after: sessionRowSnapshot(container) }, {
				before: { inProgress: false, needsInput: false, ariaLabel: 'Session, updated now, State: Completed, in Workspace' },
				after: { inProgress: false, needsInput: true, ariaLabel: 'Session, updated now, State: Input Needed' },
			});
		});

		test('failed non-main chat shows an error icon on its own row', () => {
			const main = createChat('Main chat', undefined, ChatInteractivity.Full, SessionStatus.Completed);
			const peer = createChat('Failed chat', ChatOriginKind.User, ChatInteractivity.Full, SessionStatus.Error);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};

			const container = renderSessionChats(session);
			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent?.includes('Failed chat'));
			assert.ok(peerRow);

			assert.deepStrictEqual({
				errorIcon: !!peerRow.querySelector('.codicon-error'),
				ariaLabel: peerRow.closest('.monaco-list-row')?.getAttribute('aria-label'),
			}, {
				errorIcon: true,
				ariaLabel: 'Failed chat, chat, updated now, State: Failed',
			});
		});

		test('updates rendered chat row heights across phone layout changes', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = { ...base, chats: constObservable([main, peer]), mainChat: constObservable(main) };
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(IContextKeyService, disposables.add(new ContextKeyService(new TestConfigurationService())));
			});
			const phoneLayout = IsPhoneLayoutContext.bindTo(harness.instantiationService.get(IContextKeyService));
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const chatRow = container.querySelector<HTMLElement>('.session-chat-item')?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(chatRow);
			const desktopHeight = chatRow.style.height;

			phoneLayout.set(true);
			const phoneChatRow = container.querySelector<HTMLElement>('.session-chat-item')?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(phoneChatRow);

			assert.deepStrictEqual({ desktopHeight, phoneHeight: phoneChatRow.style.height }, {
				desktopHeight: '30px',
				phoneHeight: '46px',
			});
		});

		test('opens the selected nested chat', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const opened: { session: ISession; chat: IChat; preserveFocus: boolean; sideBySide: boolean }[] = [];
			const container = renderSessionChats(session, (openedSession, chat, preserveFocus, sideBySide) => {
				opened.push({ session: openedSession, chat, preserveFocus, sideBySide });
			});
			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent === 'Peer chat');
			assert.ok(peerRow);

			peerRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

			assert.deepStrictEqual(opened, [{
				session,
				chat: peer,
				preserveFocus: false,
				sideBySide: false,
			}]);
		});

		test('opens a nested chat to the side with the session row modifier gesture', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const opened: { chat: IChat; preserveFocus: boolean; sideBySide: boolean }[] = [];
			const container = renderSessionChats(session, (_session, chat, preserveFocus, sideBySide) => {
				opened.push({ chat, preserveFocus, sideBySide });
			});
			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent === 'Peer chat');
			assert.ok(peerRow);

			peerRow.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, altKey: true }));

			assert.deepStrictEqual(opened, [{
				chat: peer,
				preserveFocus: false,
				sideBySide: true,
			}]);
		});

		test('coalesces restored active chat selection without flashing the parent session', async () => {
			const main = createChat('Main chat');
			const first = createChat('First chat', ChatOriginKind.User);
			const second = createChat('Second chat', ChatOriginKind.User);
			const side = createChat('Side chat', ChatOriginKind.SideChat);
			const activeChat = observableValue<IChat>('active-chat', first);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, first, second, side]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const activeSession = upcastPartial<IActiveSession>({
				...session,
				activeChat,
				sticky: constObservable(false),
				isCreated: constObservable(true),
				visibleChatTabs: constObservable([main, first, second, side]),
			});
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
					override readonly activeSession = constObservable(activeSession);
					override readonly visibleSessions = constObservable([activeSession]);
				});
			});

			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const initiallySelected = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			const twistie = container.querySelector<HTMLElement>('.session-chat-twistie');
			assert.ok(twistie);
			twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			const focusTarget = mainWindow.document.createElement('button');
			mainWindow.document.body.appendChild(focusTarget);
			disposables.add({ dispose: () => focusTarget.remove() });
			focusTarget.focus();

			activeChat.set(main, undefined);
			const selectionDuringRestore = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			const parentDuringRestore = container.querySelector('.monaco-list-row.selected .session-title')?.textContent;
			activeChat.set(second, undefined);
			const selectionBeforeFrame = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			const parentBeforeFrame = container.querySelector('.monaco-list-row.selected .session-title')?.textContent;
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			const selectedChat = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			activeChat.set(side, undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			// Side chats are not shown as nested rows, so activating one falls
			// back to selecting the parent session rather than a chat row.
			const selectedSideChat = container.querySelector('.monaco-list-row.selected .session-chat-title')?.textContent;
			const parentDuringSideChat = container.querySelector('.monaco-list-row.selected .session-title')?.textContent;
			activeChat.set(main, undefined);
			await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));

			assert.deepStrictEqual({
				initiallySelected,
				selectionDuringRestore,
				parentDuringRestore,
				selectionBeforeFrame,
				parentBeforeFrame,
				selectedChat,
				selectedSideChat,
				parentDuringSideChat,
				mainSelection: container.querySelector('.monaco-list-row.selected .session-title')?.textContent,
				expanded: twistie.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
				activeElement: mainWindow.document.activeElement,
			}, {
				initiallySelected: 'First chat',
				selectionDuringRestore: undefined,
				parentDuringRestore: undefined,
				selectionBeforeFrame: undefined,
				parentBeforeFrame: undefined,
				selectedChat: 'Second chat',
				selectedSideChat: undefined,
				parentDuringSideChat: 'Session',
				mainSelection: 'Session',
				expanded: 'true',
				activeElement: focusTarget,
			});
		});

		test('ordinary list updates preserve a collapsed active session and user selection', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const activeSessionBase = createTestSession('Session').session;
			const session: ISession = { ...activeSessionBase, chats: constObservable([main, peer]), mainChat: constObservable(main) };
			const activeSession = upcastPartial<IActiveSession>({
				...session,
				activeChat: constObservable(peer),
				sticky: constObservable(false),
				isCreated: constObservable(true),
				visibleChatTabs: constObservable([main, peer]),
			});
			const harness = createListHarness(disposables, [session], instantiationService => {
				instantiationService.stub(ISessionsService, new class extends mock<ISessionsService>() {
					override readonly activeSession = constObservable(activeSession);
					override readonly visibleSessions = constObservable([activeSession]);
				});
			});
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			list.reveal(session.resource);
			const twistie = container.querySelector<HTMLElement>('.session-chat-twistie');
			assert.ok(twistie);
			twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

			list.update();

			assert.deepStrictEqual({
				expanded: twistie.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
				selected: container.querySelector('.monaco-list-row.selected .session-title')?.textContent,
			}, {
				expanded: 'false',
				selected: 'Session',
			});
		});

		test('drags a nested chat with the chat-group payload instead of a session payload', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const container = renderSessionChats(session);
			const peerRow = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(element => element.textContent === 'Peer chat')
				?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(peerRow);
			const dataTransfer = new DataTransfer();
			const dragStart = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer });

			peerRow.dispatchEvent(dragStart);

			assert.deepStrictEqual({
				isChatDrag: isSessionChatDrag(dragStart),
				isSameSessionDrag: isSessionChatDrag(dragStart, session.sessionId),
				sessionPayload: dataTransfer.getData(SessionsDataTransfers.SESSION),
				chatPayload: getSessionChatDragData(dragStart),
			}, {
				isChatDrag: true,
				isSameSessionDrag: true,
				sessionPayload: '',
				chatPayload: { sessionId: session.sessionId, resource: peer.resource.toString() },
			});
		});

		test('uses the native twistie only for sessions with nested chats', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const multiChatBase = createTestSession('Multi-chat session').session;
			const multiChatSession: ISession = {
				...multiChatBase,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const singleChatBase = createTestSession('Single-chat session').session;
			const singleChatSession: ISession = {
				...singleChatBase,
				chats: constObservable([main]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const harness = createListHarness(disposables, [multiChatSession, singleChatSession]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const rows = Object.fromEntries([...container.querySelectorAll<HTMLElement>('.session-item')].map(item => {
				const row = item.closest<HTMLElement>('.monaco-list-row');
				const twistie = row?.querySelector<HTMLElement>('.monaco-tl-twistie');
				const icon = item.querySelector<HTMLElement>('.session-icon');
				const twistieStyle = twistie?.classList.contains('session-chat-twistie')
					? mainWindow.getComputedStyle(twistie)
					: undefined;
				return [item.querySelector('.session-title')?.textContent, {
					expanded: row?.getAttribute('aria-expanded'),
					hasSessionChatTwistie: twistie?.classList.contains('session-chat-twistie'),
					hasHiddenTwistie: twistie?.classList.contains('force-no-twistie'),
					hasNativeGlyph: twistie?.classList.contains('codicon-tree-item-expanded'),
					isCollapsible: twistie?.classList.contains('collapsible'),
					isCollapsed: twistie?.classList.contains('collapsed'),
					fontSize: twistieStyle?.fontSize,
					opacity: twistieStyle?.opacity,
					paddingLeft: twistie?.style.paddingLeft,
					pointerEvents: twistieStyle?.pointerEvents,
					iconVisibility: icon ? mainWindow.getComputedStyle(icon).visibility : undefined,
				}];
			}));

			assert.deepStrictEqual(rows, {
				'Multi-chat session': {
					expanded: 'true',
					hasSessionChatTwistie: true,
					hasHiddenTwistie: false,
					hasNativeGlyph: true,
					isCollapsible: true,
					isCollapsed: false,
					fontSize: '16px',
					opacity: '0',
					paddingLeft: '0px',
					pointerEvents: 'none',
					iconVisibility: 'visible',
				},
				'Single-chat session': {
					expanded: null,
					hasSessionChatTwistie: false,
					hasHiddenTwistie: true,
					hasNativeGlyph: false,
					isCollapsible: false,
					isCollapsed: false,
					fontSize: undefined,
					opacity: undefined,
					paddingLeft: '0px',
					pointerEvents: undefined,
					iconVisibility: 'visible',
				},
			});

			const multiChatItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
				.find(item => item.querySelector('.session-title')?.textContent === 'Multi-chat session');
			assert.ok(multiChatItem);
			multiChatItem.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 1 }));
			multiChatItem.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, detail: 2 }));
			assert.strictEqual(multiChatItem.closest('.monaco-list-row')?.getAttribute('aria-expanded'), 'true');

			const twistie = multiChatItem.closest('.monaco-list-row')?.querySelector<HTMLElement>('.monaco-tl-twistie');
			assert.ok(twistie);
			twistie.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

			assert.deepStrictEqual({
				expanded: twistie.closest('.monaco-list-row')?.getAttribute('aria-expanded'),
				isCollapsed: twistie.classList.contains('collapsed'),
				visibleChats: chatRowTitles(container),
			}, {
				expanded: 'false',
				isCollapsed: true,
				visibleChats: [],
			});
		});

		test('reveals the twistie only on real pointer hover, never on keyboard focus or selection alone', () => {
			const main = createChat('Main chat');
			const peer = createChat('Peer chat', ChatOriginKind.User);
			const base = createTestSession('Multi-chat session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);

			const item = container.querySelector<HTMLElement>('.session-item');
			assert.ok(item);
			const row = item.closest<HTMLElement>('.monaco-list-row');
			assert.ok(row);
			const twistie = row.querySelector<HTMLElement>('.monaco-tl-twistie');
			assert.ok(twistie);
			const icon = item.querySelector<HTMLElement>('.session-icon');
			assert.ok(icon);

			const snapshot = () => ({
				opacity: mainWindow.getComputedStyle(twistie).opacity,
				pointerEvents: mainWindow.getComputedStyle(twistie).pointerEvents,
				iconVisibility: mainWindow.getComputedStyle(icon).visibility,
			});

			row.classList.add('focused');
			assert.deepStrictEqual(snapshot(), { opacity: '0', pointerEvents: 'none', iconVisibility: 'visible' });
			row.classList.remove('focused');

			row.classList.add('selected');
			assert.deepStrictEqual(snapshot(), { opacity: '0', pointerEvents: 'none', iconVisibility: 'visible' });

			row.classList.add('focused');
			assert.deepStrictEqual(snapshot(), { opacity: '0', pointerEvents: 'none', iconVisibility: 'visible' });
			row.classList.remove('focused', 'selected');
		});

		suite('hierarchy indent/connector guides', () => {

			function twoSessionContainer(): { readonly container: HTMLElement; readonly session: ISession; readonly other: ISession } {
				const main = createChat('Main chat');
				const peer = createChat('Peer chat', ChatOriginKind.User);
				const base = createTestSession('Session').session;
				const session: ISession = {
					...base,
					chats: constObservable([main, peer]),
					mainChat: constObservable(main),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
				const otherBase = createTestSession('Other session').session;
				const other: ISession = {
					...otherBase,
					chats: constObservable([createChat('Other main chat'), createChat('Other peer chat', ChatOriginKind.User)]),
					mainChat: constObservable(createChat('Other main chat')),
					capabilities: constObservable({ supportsMultipleChats: true }),
				};
				const harness = createListHarness(disposables, [session, other]);
				const container = harness.createContainer();
				const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
					grouping: () => SessionsGrouping.Date,
					sorting: () => SessionsSorting.Created,
					onSessionOpen: () => { },
					onChatOpen: () => { },
				}));
				list.layout(300, 400);
				return { container, session, other };
			}

			/** Reads guide visibility for a session row and the run of chat rows immediately following it. */
			function guidesVisible(container: HTMLElement, title: string): { session: boolean; chats: boolean[] } {
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === title);
				const sessionRow = sessionItem?.closest<HTMLElement>('.monaco-list-row');
				const sessionIndex = sessionRow ? Number(sessionRow.getAttribute('data-index')) : -1;

				const ownChats: HTMLElement[] = [];
				for (const row of [...container.querySelectorAll<HTMLElement>('.monaco-list-row')]) {
					if (Number(row.getAttribute('data-index')) <= sessionIndex) {
						continue;
					}
					const chatItem = row.querySelector<HTMLElement>('.session-chat-item');
					if (!chatItem) {
						break;
					}
					ownChats.push(chatItem);
				}

				return {
					session: !!sessionItem?.classList.contains('session-hierarchy-guides-visible'),
					chats: ownChats.map(chatItem => chatItem.classList.contains('session-hierarchy-guides-visible')),
				};
			}

			test('guides are hidden at rest', () => {
				const { container } = twoSessionContainer();
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: false, chats: [false] });
			});

			test('hovering the parent session row reveals its own guides only', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);

				sessionItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('hovering a chat child reveals its parent session hierarchy guides only', () => {
				const { container } = twoSessionContainer();
				const chatItem = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
					.find(item => item.textContent === 'Peer chat');
				assert.ok(chatItem);

				chatItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('moving the pointer away hides the guides again', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);
				const sessionRow = sessionItem.closest<HTMLElement>('.monaco-list-row');
				assert.ok(sessionRow);

				sessionItem.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });

				sessionRow.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: false, chats: [false] });
			});

			test('selecting the parent session keeps guides visible without hover', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);

				sessionItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
				sessionItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
				sessionItem.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('selecting a chat child keeps only its parent session guides visible', () => {
				const { container } = twoSessionContainer();
				const chatItem = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
					.find(item => item.textContent === 'Peer chat');
				assert.ok(chatItem);

				chatItem.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
				chatItem.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
				chatItem.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			/** Moves tree focus without changing selection, matching keyboard navigation. */
			function focusOnly(element: HTMLElement): void {
				element.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 2 }));
			}

			test('keyboard/focus-only navigation to the parent session row reveals its own guides only', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);
				const sessionRow = sessionItem.closest<HTMLElement>('.monaco-list-row');
				assert.ok(sessionRow);

				focusOnly(sessionItem);

				assert.deepStrictEqual({
					guides: guidesVisible(container, 'Session'),
					// Focus-only navigation must not also select the row.
					isSelected: sessionRow.classList.contains('selected'),
				}, {
					guides: { session: true, chats: [true] },
					isSelected: false,
				});
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('keyboard/focus-only navigation to a chat child reveals its parent session hierarchy guides only', () => {
				const { container } = twoSessionContainer();
				const chatItem = [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
					.find(item => item.textContent === 'Peer chat');
				assert.ok(chatItem);

				focusOnly(chatItem);

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: false, chats: [false] });
			});

			test('moving focus-only navigation away hides the previous guides', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				const otherItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Other session');
				assert.ok(sessionItem);
				assert.ok(otherItem);

				focusOnly(sessionItem);
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: true, chats: [true] });

				focusOnly(otherItem);
				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: false, chats: [false] });
				assert.deepStrictEqual(guidesVisible(container, 'Other session'), { session: true, chats: [true] });
			});

			test('blurring the list hides focus-only guides', () => {
				const { container } = twoSessionContainer();
				const sessionItem = [...container.querySelectorAll<HTMLElement>('.session-item')]
					.find(item => item.querySelector('.session-title')?.textContent === 'Session');
				assert.ok(sessionItem);

				focusOnly(sessionItem);
				const tree = container.querySelector<HTMLElement>('.monaco-list');
				assert.ok(tree);
				tree.dispatchEvent(new FocusEvent('blur'));

				assert.deepStrictEqual(guidesVisible(container, 'Session'), { session: false, chats: [false] });
			});
		});

		function createApprovalModel(approvals: ReadonlyMap<string, IAgentSessionApprovalInfo>): AgentSessionApprovalModel {
			return new class extends mock<AgentSessionApprovalModel>() {
				override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
					return constObservable(approvals.get(resource.toString()));
				}
			}();
		}

		function terminalApproval(chat: IChat, command: string): IAgentSessionApprovalInfo {
			return { approvalId: chat.resource.toString(), kind: AgentSessionApprovalKind.Terminal, label: command, languageId: 'shellscript', since: new Date(), confirm: () => { } };
		}

		function renderSessionChatsWithApprovals(session: ISession, approvalModel: AgentSessionApprovalModel): { container: HTMLElement; list: SessionsList } {
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				approvalModel,
			}));
			list.layout(400, 400);
			return { container, list };
		}

		function approvalRowFor(container: HTMLElement, title: string): HTMLElement | undefined {
			return [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(item => item.querySelector('.session-chat-title')?.textContent === title)
				?.querySelector<HTMLElement>('.session-approval-row') ?? undefined;
		}

		test('renders a pending approval on the owning chat row only, not on its siblings', () => {
			const main = createChat('Main chat');
			const withApproval = createChat('Task A', ChatOriginKind.User);
			const withoutApproval = createChat('Task B', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, withApproval, withoutApproval]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const approvals = new Map([[withApproval.resource.toString(), terminalApproval(withApproval, 'npm run build')]]);
			const { container } = renderSessionChatsWithApprovals(session, createApprovalModel(approvals));

			const taskA = approvalRowFor(container, 'Task A');
			const taskB = approvalRowFor(container, 'Task B');
			assert.deepStrictEqual({
				taskAVisible: taskA?.classList.contains('visible'),
				taskAHasAllow: taskA?.querySelector('.session-approval-button .monaco-button')?.textContent,
				taskBVisible: taskB?.classList.contains('visible'),
				sessionRowApprovalVisible: container.querySelector<HTMLElement>('.session-item .session-approval-row')?.classList.contains('visible'),
			}, {
				taskAVisible: true,
				taskAHasAllow: 'Allow',
				taskBVisible: false,
				sessionRowApprovalVisible: false,
			});
		});

		test('renders the main chat approval on the session row, not on any chat row', () => {
			const main = createChat('Main chat');
			const peer = createChat('Task A', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const approvals = new Map([[main.resource.toString(), terminalApproval(main, 'git push --force')]]);
			const { container } = renderSessionChatsWithApprovals(session, createApprovalModel(approvals));

			assert.deepStrictEqual({
				sessionRowApprovalVisible: container.querySelector<HTMLElement>('.session-item .session-approval-row')?.classList.contains('visible'),
				chatRowApprovalVisible: approvalRowFor(container, 'Task A')?.classList.contains('visible'),
			}, {
				sessionRowApprovalVisible: true,
				chatRowApprovalVisible: false,
			});
		});

		test('reserves extra row height for a chat with a pending approval', () => {
			const main = createChat('Main chat');
			const withApproval = createChat('Task A', ChatOriginKind.User);
			const withoutApproval = createChat('Task B', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, withApproval, withoutApproval]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const approvals = new Map([[withApproval.resource.toString(), terminalApproval(withApproval, 'npm run build')]]);
			const { container } = renderSessionChatsWithApprovals(session, createApprovalModel(approvals));

			const rowHeight = (title: string) => [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(item => item.querySelector('.session-chat-title')?.textContent === title)
				?.closest<HTMLElement>('.monaco-list-row')?.style.height;

			const heights = { taskA: rowHeight('Task A'), taskB: rowHeight('Task B') };
			assert.ok(heights.taskA && heights.taskB && parseInt(heights.taskA) > parseInt(heights.taskB), `expected Task A (${heights.taskA}) taller than Task B (${heights.taskB})`);
		});

		test('confirms the chat approval when its Allow button is clicked', () => {
			const main = createChat('Main chat');
			const peer = createChat('Task A', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			let confirmed = 0;
			const approval: IAgentSessionApprovalInfo = { ...terminalApproval(peer, 'npm run build'), confirm: () => { confirmed++; } };
			const { container } = renderSessionChatsWithApprovals(session, createApprovalModel(new Map([[peer.resource.toString(), approval]])));

			const allow = approvalRowFor(container, 'Task A')?.querySelector<HTMLElement>('.session-approval-button .monaco-button');
			assert.ok(allow);
			allow.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			assert.strictEqual(confirmed, 1);
		});

		test('grows a chat row height when its approval is replaced with a taller one', () => {
			const main = createChat('Main chat');
			const peer = createChat('Task A', ChatOriginKind.User);
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable([main, peer]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			// A settable approval so we can swap one pending approval directly for
			// another with a taller (multi-line) label — the row must re-reserve
			// height on that change, not only when an approval appears/clears.
			const pending = observableValue<IAgentSessionApprovalInfo | undefined>('pending', terminalApproval(peer, 'npm run build'));
			const approvalModel = new class extends mock<AgentSessionApprovalModel>() {
				override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
					return resource.toString() === peer.resource.toString() ? pending : constObservable(undefined);
				}
			}();
			const { container } = renderSessionChatsWithApprovals(session, approvalModel);

			const taskARowHeight = () => [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(item => item.querySelector('.session-chat-title')?.textContent === 'Task A')
				?.closest<HTMLElement>('.monaco-list-row')?.style.height;

			const singleLineHeight = taskARowHeight();
			pending.set(terminalApproval(peer, 'line one\nline two\nline three'), undefined);
			const multiLineHeight = taskARowHeight();

			assert.ok(singleLineHeight && multiLineHeight && parseInt(multiLineHeight) > parseInt(singleLineHeight), `expected taller row after multi-line approval (${singleLineHeight} -> ${multiLineHeight})`);
		});

		test('reconciles a chat row height for an approval that changed while virtualized offscreen', () => {
			const main = createChat('Main chat');
			// Enough chats that, with a short viewport, the target row is
			// virtualized offscreen (its template disposed) after initial render.
			const chats = [main, ...Array.from({ length: 24 }, (_, i) => createChat(`Task ${String(i).padStart(2, '0')}`, ChatOriginKind.User))];
			const targetTitle = 'Task 20';
			const target = chats.find(chat => chat.title.get() === targetTitle)!;
			const base = createTestSession('Session').session;
			const session: ISession = {
				...base,
				chats: constObservable(chats),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			// Approval starts absent, so the target's height is cached at its base
			// (title-only) height when it is first spliced into the tree.
			const pending = observableValue<IAgentSessionApprovalInfo | undefined>('pending', undefined);
			const approvalModel = new class extends mock<AgentSessionApprovalModel>() {
				override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
					return resource.toString() === target.resource.toString() ? pending : constObservable(undefined);
				}
			}();

			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: () => { },
				approvalModel,
			}));
			// Short viewport so only the top rows render; the target is offscreen.
			list.layout(120, 400);

			const targetRow = () => [...container.querySelectorAll<HTMLElement>('.session-chat-item')]
				.find(item => item.querySelector('.session-chat-title')?.textContent === targetTitle)
				?.closest<HTMLElement>('.monaco-list-row');
			assert.strictEqual(targetRow(), undefined, 'target row should start virtualized offscreen');

			// Approval appears while the row is virtualized offscreen (its template
			// disposed). The list-owned reconcile watches the approval model
			// independently of the row template, so it must correct the cached
			// height even while offscreen.
			pending.set(terminalApproval(target, 'line one\nline two\nline three'), undefined);

			// Grow the viewport so the target enters the render range. This renders
			// the newly-visible row from its cached height (no re-splice recomputes
			// it), so the row is only sized correctly if the offscreen reconcile
			// already corrected the cache.
			list.layout(1000, 400);

			const row = targetRow();
			assert.ok(row, 'target row should render after growing the viewport');
			// Base chat rows reserve 30px including spacing; an approval must reserve more.
			assert.ok(parseInt(row.style.height) > 30, `expected reconciled height to reserve the approval row, got ${row.style.height}`);
			assert.ok(row.querySelector('.session-approval-row.visible'), 'approval row should be visible on the re-rendered target');
		});
	});

	suite('SessionsFlatList quick-chat presentation', () => {

		function renderQuickChat(useCompactQuickChatRows: boolean) {
			const quickChat = createTestSession('Investigate failure', { isQuickChat: true }).session;
			const harness = createListHarness(disposables, [quickChat]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
				showSessionHover: false,
				useCompactQuickChatRows,
				onSessionOpen: () => { },
			}));
			list.setSessions([quickChat]);
			const contentHeight = list.getContentHeight();
			list.layout(contentHeight, 400);

			const item = container.querySelector<HTMLElement>('.session-item');
			assert.ok(item);
			return {
				usesStandardRowHeight: contentHeight === list.getRowHeight(),
				isShorterThanStandardRow: contentHeight < list.getRowHeight(),
				hasCompactClass: item.classList.contains('quick-chat'),
				hasChatIcon: item.querySelector('.session-details-icon > .codicon')?.classList.contains('codicon-comment-discussion') ?? false,
				badge: item.querySelector('.session-badge')?.textContent ?? undefined,
				time: item.querySelector('.session-time')?.textContent ?? undefined,
				hasDiff: !!item.querySelector('.session-diff'),
				ariaLabel: item.closest('.monaco-list-row')?.getAttribute('aria-label') ?? null,
			};
		}

		test('renders compact and regular quick-chat rows consistently', () => {
			assert.deepStrictEqual({
				compact: renderQuickChat(true),
				regular: renderQuickChat(false),
			}, {
				compact: {
					usesStandardRowHeight: false,
					isShorterThanStandardRow: true,
					hasCompactClass: true,
					hasChatIcon: false,
					badge: undefined,
					time: undefined,
					hasDiff: false,
					ariaLabel: 'Investigate failure, updated now',
				},
				regular: {
					usesStandardRowHeight: true,
					isShorterThanStandardRow: false,
					hasCompactClass: false,
					hasChatIcon: true,
					badge: 'No workspace',
					time: 'now',
					hasDiff: false,
					ariaLabel: 'Investigate failure, chat, updated now',
				},
			});
		});

		function createChat(id: string): IChat {
			return upcastPartial<IChat>({
				resource: URI.parse(`test-chat://${id}`),
				title: constObservable(id),
				updatedAt: constObservable(new Date()),
				status: constObservable(SessionStatus.Completed),
				interactivity: constObservable(ChatInteractivity.Full),
			});
		}

		function flatApprovalModel(approvals: ReadonlyMap<string, IAgentSessionApprovalInfo>): AgentSessionApprovalModel {
			return new class extends mock<AgentSessionApprovalModel>() {
				override getApproval(resource: URI): IObservable<IAgentSessionApprovalInfo | undefined> {
					return constObservable(approvals.get(resource.toString()));
				}
			}();
		}

		test('aggregates a non-main chat approval onto the flat session row and reserves height', () => {
			// The blocked-sessions / automations flat list renders no nested chat
			// rows, so an approval on any of a session's chats — including a
			// non-main one — must surface on the session row itself.
			const main = createChat('main');
			const worker = createChat('worker');
			const base = createTestSession('Session', { isQuickChat: false }).session;
			const session: ISession = {
				...base,
				chats: constObservable([main, worker]),
				mainChat: constObservable(main),
				capabilities: constObservable({ supportsMultipleChats: true }),
			};
			const approval: IAgentSessionApprovalInfo = { approvalId: worker.resource.toString(), kind: AgentSessionApprovalKind.Terminal, label: 'npm run build', languageId: 'shellscript', since: new Date(), confirm: () => { } };
			const approvalModel = flatApprovalModel(new Map([[worker.resource.toString(), approval]]));

			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsFlatList, container, {
				showSessionHover: false,
				onSessionOpen: () => { },
				approvalModel,
			}));
			list.setSessions([session]);
			const contentHeight = list.getContentHeight();
			list.layout(contentHeight, 400);

			const approvalRow = container.querySelector<HTMLElement>('.session-item .session-approval-row');
			assert.deepStrictEqual({
				approvalVisible: approvalRow?.classList.contains('visible'),
				hasAllowButton: !!approvalRow?.querySelector('.session-approval-button .monaco-button'),
				reservesHeight: contentHeight > list.getRowHeight(),
			}, {
				approvalVisible: true,
				hasAllowButton: true,
				reservesHeight: true,
			});
		});
	});

	suite('computeReorderSortChanges', () => {
		const NOW = 1_000_000;
		const STEP = 60_000;

		test('single drop between two neighbours uses the midpoint', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [10],
				aboveKey: 100,
				belowKey: 50,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual([...set], [['x', 75]]);
			assert.deepStrictEqual(clear, []);
		});

		test('drop above the first session uses the current time', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [10],
				aboveKey: undefined,
				belowKey: 200,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			const value = set.get('x')!;
			assert.ok(value > 200 && value < NOW, `expected ${value} between 200 and ${NOW}`);
		});

		test('drop below the last session steps below the last key', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [500],
				aboveKey: 100,
				belowKey: undefined,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			assert.ok(set.get('x')! < 100);
		});

		test('drops the fake value when the natural key already fits the slot', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['x'],
				naturalKeys: [75],
				aboveKey: 100,
				belowKey: 50,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual([...set], []);
			assert.deepStrictEqual(clear, ['x']);
		});

		test('multi-block gets strictly descending keys inside the gap', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['a', 'b', 'c'],
				naturalKeys: [5, 4, 3],
				aboveKey: 100,
				belowKey: 40,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			const values = ['a', 'b', 'c'].map(id => set.get(id)!);
			assert.deepStrictEqual(values, [85, 70, 55]);
			assert.ok(values.every(v => v > 40 && v < 100));
		});

		test('multi-block clears overrides when all natural keys already fit in order', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['a', 'b'],
				naturalKeys: [80, 60],
				aboveKey: 100,
				belowKey: 40,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual([...set], []);
			assert.deepStrictEqual(clear, ['a', 'b']);
		});

		test('multi-block assigns synthetic keys when natural order does not fit', () => {
			const { set, clear } = computeReorderSortChanges({
				draggedIds: ['a', 'b'],
				naturalKeys: [60, 80], // ascending: does not match descending display order
				aboveKey: 100,
				belowKey: 40,
				now: NOW,
				fallbackStep: STEP,
			});

			assert.deepStrictEqual(clear, []);
			assert.strictEqual(set.size, 2);
			assert.ok(set.get('a')! > set.get('b')!);
		});
	});

	suite('open trust gate', () => {

		function findSessionRow(container: HTMLElement, title: string): HTMLElement {
			const item = [...container.querySelectorAll<HTMLElement>('.session-item')]
				.find(el => el.querySelector('.session-title')?.textContent === title);
			const row = item?.closest<HTMLElement>('.monaco-list-row');
			assert.ok(row, `expected a rendered row for "${title}"`);
			return row;
		}

		// Mirrors the tree's open gesture (see objectTree.test.ts): a plain single
		// left click opens the row under the list's single-click open mode.
		function clickRow(row: HTMLElement): void {
			row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			row.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
		}

		// Drains the microtask queue so the asynchronous open gate settles.
		async function settle(): Promise<void> {
			for (let i = 0; i < 50; i++) {
				await Promise.resolve();
			}
		}

		function renderGatedList(title: string, canOpenSession?: (session: ISession) => Promise<boolean>) {
			const { session } = createTestSession(title);
			const harness = createListHarness(disposables, [session]);
			const container = harness.createContainer();
			const opened: string[] = [];
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				onSessionOpen: (resource: URI) => opened.push(resource.toString()),
				canOpenSession,
			}));
			list.layout(300, 400);
			return { session, harness, container, opened };
		}

		// Control: proves the click gesture actually reaches `onDidOpen`, so the
		// "no side effects" assertions in the gated tests below are meaningful.
		test('opens and marks read when no trust gate is configured', async () => {
			const { session, harness, container, opened } = renderGatedList('Ungated');

			clickRow(findSessionRow(container, 'Ungated'));
			await settle();

			assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
				opened: [session.resource.toString()],
				markedRead: 1,
			});
		});

		test('refuses to open when the trust gate returns false: no mark-read, no open', async () => {
			const { harness, container, opened } = renderGatedList('Untrusted', async () => false);

			clickRow(findSessionRow(container, 'Untrusted'));
			await settle();

			assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
				opened: [],
				markedRead: 0,
			});
		});

		test('marks read and opens only after the trust gate resolves true', async () => {
			let allowOpen: (value: boolean) => void;
			const gate = new Promise<boolean>(resolve => { allowOpen = resolve; });
			const { session, harness, container, opened } = renderGatedList('Deferred', () => gate);

			clickRow(findSessionRow(container, 'Deferred'));
			await settle();

			// Gate still pending — the open must not have produced any side effects.
			assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
				opened: [],
				markedRead: 0,
			});

			allowOpen!(true);
			await settle();

			// Gate resolved true — the session is now marked read and opened.
			assert.deepStrictEqual({ opened, markedRead: harness.managementService.readSessions.length }, {
				opened: [session.resource.toString()],
				markedRead: 1,
			});
		});
	});
});
