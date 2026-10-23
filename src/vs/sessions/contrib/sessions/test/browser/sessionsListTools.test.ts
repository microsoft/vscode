/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IToolImpl, IToolResult } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IViewsService } from '../../../../../workbench/services/views/common/viewsService.js';
import { SESSIONS_LIST_AGENT_TOOLS_SETTING } from '../../../../common/sessionConfig.js';
import { ISessionGroup, ISessionGroupsService, SessionGroupsService } from '../../../../services/sessions/browser/sessionGroupsService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { OrganizeSessionsListTool, ReadSessionsListTool } from '../../browser/sessionsListTools.js';
import { SessionsGrouping, SessionsSorting } from '../../browser/views/sessionsList.js';
import { SessionsView } from '../../browser/views/sessionsView.js';
import { createListHarness, createTestSession } from './sessionsListTestUtils.js';
import { TestSessionsList } from './testSessionsList.js';

interface ITreeNodeOutput {
	readonly type: string;
	readonly id: string;
	readonly label?: string;
	readonly title?: string;
	readonly collapsed?: boolean;
	readonly current?: boolean;
	readonly children?: readonly ITreeNodeOutput[];
}

/** A compact outline of the tree that readSessionsList reports: `id` for headers (`+` when collapsed, `*` for the current session), with their rows. */
function outline(nodes: readonly ITreeNodeOutput[]): unknown[] {
	return nodes.map(node => node.type === 'session'
		? `${node.title}${node.current ? '*' : ''}`
		: { [`${node.label}${node.collapsed ? '+' : ''}`]: outline(node.children ?? []) });
}

function parse(result: IToolResult): { readonly view: Record<string, unknown>; readonly tree: readonly ITreeNodeOutput[]; readonly results: unknown[]; readonly skippedOperations?: number } {
	const part = result.content[0];
	assert.ok(part?.kind === 'text');
	return JSON.parse(part.value);
}

suite('Sessions - Sessions list tools', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(sessions: ISession[], options: { readonly groups?: readonly ISessionGroup[]; readonly memberships?: Record<string, string>; readonly pinnedSessionIds?: ReadonlySet<string> } = {}) {
		const harness = createListHarness(disposables, sessions, { liveListModel: true, pinnedSessionIds: options.pinnedSessionIds });
		const configurationService = harness.instantiationService.get(IConfigurationService) as TestConfigurationService;
		void configurationService.setUserConfiguration(SESSIONS_LIST_AGENT_TOOLS_SETTING, true);
		const storageService = harness.instantiationService.get(IStorageService);
		storageService.store('sessionsListControl.groups', JSON.stringify({ groups: options.groups ?? [], membership: options.memberships ?? {}, sectionMembership: {} }), StorageScope.PROFILE, StorageTarget.USER);
		const orderService = harness.store.add(new SessionSectionOrderService(storageService));
		harness.instantiationService.stub(ISessionSectionOrderService, orderService);
		harness.instantiationService.stub(ISessionGroupsService, harness.store.add(new SessionGroupsService(storageService, upcastPartial<ISessionsManagementService>({
			onDidChangeSessions: Event.None,
			onDidDeleteSession: Event.None,
			onDidArchiveSession: Event.None,
			onWillSendRequest: Event.None,
			onDidReplaceSession: Event.None,
			onDidReplaceNewDraftSession: Event.None,
			onDidStartSession: Event.None,
			onDidDiscardNewSession: Event.None,
			onDidMoveChat: Event.None,
			getSessions: () => harness.managementService.sessions,
			getInFlightNewSessionRequests: () => [],
			getSession: resource => harness.managementService.getSession(resource),
		}), orderService)));

		const state = { grouping: SessionsGrouping.Workspace, sorting: SessionsSorting.Created, compact: false };
		const list = harness.store.add(harness.instantiationService.createInstance(TestSessionsList, harness.createContainer(400, 800), {
			grouping: () => state.grouping,
			sorting: () => state.sorting,
			onSessionOpen: () => { },
		}));
		list.layout(800, 400);
		const view = upcastPartial<SessionsView>({
			sessionsControl: list,
			get grouping() { return state.grouping; },
			get sorting() { return state.sorting; },
			get compact() { return state.compact; },
			setGrouping: grouping => { state.grouping = grouping; list.update(true); },
			setSorting: sorting => { state.sorting = sorting; list.update(); },
			setCompact: compact => { state.compact = compact; },
			setShowArchived: show => list.setExcludeArchived(!show),
			setWorkspaceGroupCapped: capped => list.setWorkspaceGroupCapped(capped),
			resetFilters: () => { list.resetFilters(); },
		});
		harness.instantiationService.stub(IViewsService, upcastPartial<IViewsService>({ getViewWithId: <T>() => view as T }));

		const invoke = (tool: IToolImpl, parameters: Record<string, unknown>, sessionResource?: URI) => tool.invoke({ callId: 'call', toolId: 'tool', parameters, context: sessionResource && { sessionResource } }, async () => 0, { report: () => { } }, CancellationToken.None);
		const read = harness.instantiationService.createInstance(ReadSessionsListTool);
		const organize = harness.instantiationService.createInstance(OrganizeSessionsListTool);
		return {
			harness,
			list,
			configurationService,
			invokeRaw: (tool: 'read' | 'organize', parameters: Record<string, unknown>) => invoke(tool === 'read' ? read : organize, parameters),
			read: async (parameters: Record<string, unknown> = {}, sessionResource?: URI) => parse(await invoke(read, parameters, sessionResource)),
			organize: async (...operations: Record<string, unknown>[]) => parse(await invoke(organize, { operations })),
		};
	}

	function session(title: string, minutesAgo: number, workspaceLabel = 'vscode'): ISession {
		return createTestSession(title, { workspaceLabel, createdAt: new Date(Date.now() - minutesAgo * 60_000) }).session;
	}

	test('reads the view options and the list as a tree of sections, nested groups, and sessions', async () => {
		const sessions = [session('Ship notes', 1), session('Fix login', 2), session('Ungrouped', 3), session('Pinned one', 4)];
		const { read } = setup(sessions, {
			groups: [{ id: 'release', name: 'Release', createdAt: 1 }, { id: 'hotfixes', name: 'Hotfixes', createdAt: 2, parentId: 'release' }],
			memberships: { 'Ship notes': 'release', 'Fix login': 'hotfixes' },
			pinnedSessionIds: new Set(['Pinned one']),
		});

		const { view, tree } = await read({}, sessions[2].resource);

		assert.deepStrictEqual({ view: { ...view, filters: undefined }, tree: outline(tree), headerIds: tree.map(node => node.id) }, {
			view: { grouping: 'workspace', sorting: 'created', showArchived: false, sessionsPerSection: 'recent', compact: false, externalSection: false, filters: undefined },
			tree: [
				{ 'Pinned+': ['Pinned one'] },
				{ 'Release': [{ 'Hotfixes': ['Fix login'] }, 'Ship notes'] },
				{ 'vscode': ['Ungrouped*'] },
			],
			headerIds: ['pinned', 'group:release', 'workspace:vscode'],
		});
	});

	test('applies a batch that creates nested groups, moves sessions and sections into them, and collapses one', async () => {
		const sessions = [session('Alpha', 1), session('Beta', 2), session('Gamma', 3)];
		const { read, organize, harness } = setup(sessions);

		const { results } = await organize(
			{ action: 'createGroup', name: 'Release', key: 'release', sessions: ['Alpha'] },
			{ action: 'createGroup', name: 'Hotfixes', parent: 'release', key: 'hotfixes', sessions: ['Beta'] },
			{ action: 'moveHeader', id: 'workspace:vscode', parent: 'release', after: 'hotfixes' },
			{ action: 'setCollapsed', id: 'hotfixes', collapsed: true },
			{ action: 'moveSessions', sessions: ['Gamma'], to: 'pinned' },
		);
		const { tree } = await read();

		assert.deepStrictEqual({
			results: results.map(result => ({ ...result as object, id: (result as { id?: string }).id?.replace(/[0-9a-f-]{36}/, '<id>') })),
			tree: outline(tree),
			pinChanges: harness.pinChanges,
		}, {
			results: [
				{ action: 'createGroup', ok: true, id: 'group:<id>' },
				{ action: 'createGroup', ok: true, id: 'group:<id>' },
				{ action: 'moveHeader', ok: true, id: undefined },
				{ action: 'setCollapsed', ok: true, id: undefined },
				{ action: 'moveSessions', ok: true, id: undefined },
			],
			tree: [{ 'Release': [{ 'Hotfixes+': ['Beta'] }, { 'vscode': ['Gamma'] }, 'Alpha'] }],
			pinChanges: [{ sessionId: 'Gamma', pinned: true }],
		});
	});

	test('reorders sessions within their group relative to another session or to an edge', async () => {
		const sessions = [session('Newest', 1), session('Middle', 2), session('Oldest', 3)];
		const { read, organize } = setup(sessions, {
			groups: [{ id: 'release', name: 'Release', createdAt: 1 }],
			memberships: { 'Newest': 'release', 'Middle': 'release', 'Oldest': 'release' },
		});

		const before = outline((await read()).tree);
		await organize({ action: 'moveSessions', sessions: ['Oldest'], before: 'Newest' });
		const anchored = outline((await read()).tree);
		await organize({ action: 'moveSessions', sessions: ['Middle'], to: 'group:release', position: 'top' });
		const topAfterManualOrder = outline((await read()).tree);
		await organize({ action: 'moveSessions', sessions: ['Middle'], to: 'group:release', position: 'bottom' });

		assert.deepStrictEqual({ before, anchored, topAfterManualOrder, bottom: outline((await read()).tree) }, {
			before: [{ 'Release': ['Newest', 'Middle', 'Oldest'] }],
			anchored: [{ 'Release': ['Oldest', 'Newest', 'Middle'] }],
			topAfterManualOrder: [{ 'Release': ['Middle', 'Oldest', 'Newest'] }],
			bottom: [{ 'Release': ['Oldest', 'Newest', 'Middle'] }],
		});
	});

	test('changes grouping, sorting, filters, and archived visibility', async () => {
		const { read, organize, list } = setup([session('Alpha', 1)]);

		const { results } = await organize({ action: 'setView', grouping: 'date', sorting: 'updated', showArchived: true, sessionsPerSection: 'all', filters: [{ kind: 'harness', id: 'claude', included: false }] });
		const { view } = await read();

		assert.deepStrictEqual({ results, view: { ...view, filters: undefined }, claudeExcluded: list.filters.isExcluded({ kind: 'harness', id: 'claude' }) }, {
			results: [{ action: 'setView', ok: true }],
			view: { grouping: 'date', sorting: 'updated', showArchived: true, sessionsPerSection: 'all', compact: false, externalSection: false, filters: undefined },
			claudeExcluded: true,
		});
	});

	test('stops at the first failing operation and reports the rest as skipped', async () => {
		const { organize, harness } = setup([session('Alpha', 1)]);

		const output = await organize(
			{ action: 'setView', filters: [{ kind: 'harness', id: 'unknown-harness', included: false }] },
			{ action: 'createGroup', name: 'Never created' },
		);

		assert.deepStrictEqual({ ...output, groups: harness.instantiationService.get(ISessionGroupsService).getGroups() }, {
			results: [{ action: 'setView', ok: false, error: 'There is no harness filter "unknown-harness". Use the filters that readSessionsList reports.' }],
			skippedOperations: 1,
			hint: 'Operations after the failure did not run. Call readSessionsList to see the current state before retrying.',
			groups: [],
		});
	});

	test('refuses to read or change the list while the setting is off', async () => {
		const { invokeRaw, configurationService, harness } = setup([session('Alpha', 1)]);
		await configurationService.setUserConfiguration(SESSIONS_LIST_AGENT_TOOLS_SETTING, false);

		const results = [await invokeRaw('read', {}), await invokeRaw('organize', { operations: [{ action: 'createGroup', name: 'Never created' }] })];

		assert.deepStrictEqual({
			results: results.map(result => ({ content: result.content, error: result.toolResultError })),
			groups: harness.instantiationService.get(ISessionGroupsService).getGroups(),
		}, {
			results: [0, 1].map(() => ({ content: [{ kind: 'text', value: 'Error: The Sessions list tools are disabled.' }], error: 'The Sessions list tools are disabled.' })),
			groups: [],
		});
	});
});
