/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ExtUri } from '../../../../../base/common/resources.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuWorkbenchToolBar } from '../../../../../platform/actions/browser/toolbar.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { ICustomViewService } from '../../../../services/customView/browser/customViewService.js';
import { IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { computeReorderSortChanges, groupByDate, groupByWorkspace, groupSessionsForList, ISessionSection, limitSessionsForList, SessionSectionRenderer, SessionsList, sortSessions, SessionsGrouping, SessionsSorting } from '../../browser/views/sessionsList.js';
import { createListHarness, createTestSession } from './sessionsListTestUtils.js';
import '../../browser/views/sessionsViewActions.js';

function createSession(id: string, opts: {
	workspaceLabel?: string;
	createdAt?: Date;
	updatedAt?: Date;
	isArchived?: boolean;
	isRead?: boolean;
	isAutomation?: boolean;
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
					{ title: 'Grouped', badge: 'vscode', ariaLabel: 'Grouped, updated now, in vscode' },
					{ title: 'Ordinary', badge: undefined, ariaLabel: 'Ordinary, updated now' },
				],
				date: [
					{ title: 'Ordinary', badge: 'monaco', ariaLabel: 'Ordinary, updated now, in monaco' },
				],
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
});
