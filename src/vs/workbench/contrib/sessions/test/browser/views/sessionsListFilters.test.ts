/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { getSessionApplication } from '../../../../../services/sessions/common/sessionApplication.js';
import { ISession, ISessionEnvironment, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { buildTestSession, buildTestWorkspace } from '../../common/testSessionBuilder.js';
import { getInboxWorkspaceFilter, getInboxWorkspaceOptions, getSessionFilterOptions, sessionFilterKey, SessionsListFilters } from '../../../browser/views/sessionsListFilters.js';

suite('SessionsListFilters', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const listAll = () => true;

	function createFilters(storage = store.add(new InMemoryStorageService())): SessionsListFilters {
		return store.add(new SessionsListFilters(storage, store.add(new NullLogService())));
	}

	test('scheduled-only filtering persists and participates in reset and undo', () => {
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		filters.setScheduledOnly(true);
		const restored = createFilters(storage);
		const persisted = restored.isScheduledOnly();
		const undo = restored.capture();
		restored.reset();
		const reset = restored.isScheduledOnly();
		undo();
		assert.deepStrictEqual({ persisted, reset, undone: restored.isScheduledOnly() }, { persisted: true, reset: false, undone: true });
	});

	test('Inbox scope distinguishes exact workspaces and environments without separating harnesses', () => {
		const filters = createFilters();
		const sessions = [
			buildTestSession({ id: 'local', title: 'Local', workspace: 'app' }).session,
			buildTestSession({ id: 'claude', title: 'Claude', workspace: 'app', harness: 'claude' }).session,
			buildTestSession({ id: 'other-folder', title: 'Other folder', workspace: 'app', workspaceFolders: ['other/app'] }).session,
			buildTestSession({ id: 'remote', title: 'Remote', workspace: 'app', environment: 'ssh:work' }).session,
		];
		const visible = () => sessions.filter(session => filters.matchesInboxScope(session)).map(session => session.sessionId);
		const all = visible();
		filters.setInboxEnvironment({ id: 'ssh:work', label: 'Work' });
		const environmentOnly = visible();
		filters.setInboxEnvironment(undefined);
		filters.setInboxWorkspace(getInboxWorkspaceFilter(sessions[0]));
		const workspaceOnly = visible();
		filters.setInboxEnvironment({ id: 'local', label: 'This Computer' });
		const combined = visible();
		const resetWorkspace = filters.setInboxEnvironment({ id: 'ssh:work', label: 'Work' });
		assert.deepStrictEqual({
			all, environmentOnly, workspaceOnly, combined, resetWorkspace, afterEnvironmentChange: visible(),
			options: getInboxWorkspaceOptions(sessions).map(option => [option.environment, option.resource]),
		}, {
			all: ['local', 'claude', 'other-folder', 'remote'],
			environmentOnly: ['remote'],
			workspaceOnly: ['local', 'claude'],
			combined: ['local', 'claude'],
			resetWorkspace: true,
			afterEnvironmentChange: ['remote'],
			options: [
				['local', 'file:///home/user/projects/app'],
				['ssh:work', 'file:///home/user/projects/app'],
				['local', 'file:///home/user/projects/other/app'],
			],
		});
	});

	test('Inbox scope persists, resets and restores independently of ordinary environment filters', () => {
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		const session = buildTestSession({ id: 'app', title: 'App', workspace: 'app' }).session;
		filters.setExcluded({ kind: 'environment', id: 'local' }, true);
		filters.setInboxWorkspace(getInboxWorkspaceFilter(session));
		filters.setInboxEnvironment({ id: 'local', label: 'This Computer' });
		const reloaded = createFilters(storage);
		const scope = reloaded.inboxScope;
		const undo = reloaded.capture();
		reloaded.reset();
		const reset = { scope: reloaded.inboxScope, ordinary: reloaded.matches(session) };
		undo();
		const restored = { scope: reloaded.inboxScope, ordinary: reloaded.matches(session), inbox: reloaded.matches(session, true) && reloaded.matchesInboxScope(session) };
		reloaded.setInboxWorkspace(undefined);
		reloaded.setInboxEnvironment(undefined);
		const scopeReset = { scope: createFilters(storage).inboxScope, ordinary: reloaded.matches(session) };
		const newEnvironment = buildTestSession({ id: 'new-host', title: 'New host', environment: 'new-host' }).session;
		assert.deepStrictEqual({ reset, restored, scopeReset, newEnvironmentMatchesAll: reloaded.matchesInboxScope(newEnvironment) }, {
			reset: { scope: {}, ordinary: true },
			restored: { scope, ordinary: false, inbox: true },
			scopeReset: { scope: {}, ordinary: false },
			newEnvironmentMatchesAll: true,
		});
	});

	test('No Workspace excludes hydrating sessions and workspace options react to metadata', () => {
		const filters = createFilters();
		const workspace = observableValue<ISessionWorkspace | undefined>('workspace', undefined);
		const pending = { ...buildTestSession({ id: 'pending', title: 'Pending' }).session, workspace, isQuickChat: constObservable(false) };
		const quick = buildTestSession({ id: 'quick', title: 'Quick', isQuickChat: true }).session;
		const options: string[][] = [];
		store.add(autorun(reader => {
			options.push(getInboxWorkspaceOptions([pending, quick], undefined, reader).map(option => option.label));
		}));
		filters.setInboxWorkspace('none');
		const before = [pending, quick].filter(session => filters.matchesInboxScope(session)).map(session => session.sessionId);
		workspace.set(buildTestWorkspace('app'), undefined);
		filters.setInboxWorkspace(getInboxWorkspaceFilter(pending));
		workspace.set(undefined, undefined);
		const absent = filters.matchesInboxScope(pending);
		workspace.set(buildTestWorkspace('app'), undefined);
		assert.deepStrictEqual({ before, options, absent, restored: filters.matchesInboxScope(pending) }, {
			before: ['quick'], options: [[], ['app'], [], ['app']], absent: false, restored: true,
		});
	});

	test('always offers the three harnesses, This Computer and Cloud, and their VS Code application choices', () => {
		assert.deepStrictEqual(getSessionFilterOptions([], [], listAll), [
			{ filter: { kind: 'harness', id: 'copilot' }, label: 'Copilot', group: '1_harnesses' },
			{ filter: { kind: 'harness', id: 'claude' }, label: 'Claude', group: '1_harnesses' },
			{ filter: { kind: 'harness', id: 'codex' }, label: 'Codex', group: '1_harnesses' },
			{ filter: { kind: 'environment', id: 'local' }, label: 'This Computer', group: '2_environments' },
			{ filter: { kind: 'environment', id: 'cloud' }, label: 'Cloud', group: '2_environments' },
			{ filter: { kind: 'application', environment: 'local', id: 'vscode' }, label: 'VS Code (This Computer)', group: '3_applications_000000' },
			{ filter: { kind: 'application', environment: 'cloud', id: 'vscode' }, label: 'VS Code (Cloud)', group: '3_applications_000001' },
		]);
	});

	test('offers VS Code for connected hosts without sessions and for disconnected hosts with cached applications', () => {
		const disconnected = observableValue('disconnected', false);
		const sessions = [
			buildTestSession({ id: 'cloud-custom', title: 'Cloud Custom', environment: 'cloud', application: 'custom_cloud_APP' }).session,
			buildTestSession({ id: 'cached-cli', title: 'Cached CLI', environment: 'cached-host', application: 'github/cli' }).session,
		];
		const options = getSessionFilterOptions(sessions, [
			{ id: 'connected-host', label: 'Connected Host' },
			{ id: 'cached-host', label: 'Cached Host', isConnected: disconnected },
			{ id: 'empty-host', label: 'Empty Host', isConnected: disconnected },
		], listAll);
		assert.deepStrictEqual({
			environments: options.filter(option => option.filter.kind === 'environment').map(option => option.label),
			applications: options.filter(option => option.filter.kind === 'application').map(option => option.label),
		}, {
			environments: ['This Computer', 'Cloud', 'Connected Host'],
			applications: ['VS Code (This Computer)', 'Custom Cloud App (Cloud)', 'VS Code (Cloud)', 'Copilot CLI (Cached Host)', 'VS Code (Cached Host)', 'VS Code (Connected Host)'],
		});
	});

	test('composes harness, environment and application filters without coupling their selections', () => {
		const filters = createFilters();
		filters.setExcluded({ kind: 'application', environment: 'local', id: 'claude' }, false);
		filters.setExcluded({ kind: 'application', environment: 'remote-id', id: 'github/cli' }, false);
		const sessions = [
			buildTestSession({ id: 'editor', title: 'Editor' }).session,
			buildTestSession({ id: 'claude', title: 'Claude', harness: 'claude', application: 'claude' }).session,
			buildTestSession({ id: 'cloud', title: 'Cloud', environment: 'cloud', application: 'github/autopilot' }).session,
			buildTestSession({ id: 'remote', title: 'Remote', harness: 'codex', environment: 'remote-id', application: 'github/cli' }).session,
		];
		const visible = () => sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
		const states = [visible()];
		filters.setExcluded({ kind: 'harness', id: 'claude' }, true);
		states.push(visible());
		filters.setExcluded({ kind: 'environment', id: 'cloud' }, true);
		states.push(visible());
		filters.setExcluded({ kind: 'application', environment: 'local', id: 'vscode' }, true);
		states.push(visible());
		filters.setExcluded({ kind: 'harness', id: 'claude' }, false);
		states.push(visible());
		assert.deepStrictEqual(states, [
			['editor', 'claude', 'cloud', 'remote'],
			['editor', 'cloud', 'remote'],
			['editor', 'remote'],
			['remote'],
			['claude', 'remote'],
		]);
	});

	test('filters task client applications independently of external status and reuses existing preferences', () => {
		const filters = createFilters();
		const sessions = ['copilot-vscode', 'copilot-cli', 'copilot-app'].map(application =>
			buildTestSession({ id: application, title: application, environment: 'cloud', application, isExternal: false }).session);
		const before = sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
		filters.setExcluded({ kind: 'application', environment: 'cloud', id: 'github/cli' }, true);
		assert.deepStrictEqual({
			before,
			after: sessions.filter(session => filters.matches(session)).map(session => session.sessionId),
			external: sessions.map(session => session.isExternal?.get()),
			applications: getSessionFilterOptions(sessions, [], listAll)
				.filter(option => option.filter.kind === 'application' && option.filter.environment === 'cloud')
				.map(option => option.label),
		}, {
			before: ['copilot-vscode', 'copilot-cli', 'copilot-app'],
			after: ['copilot-vscode', 'copilot-app'],
			external: [false, false, false],
			applications: ['Copilot App (Cloud)', 'Copilot CLI (Cloud)', 'VS Code (Cloud)'],
		});
	});

	test('offers the creating applications of automation sessions only while the list includes them', () => {
		const automation = (id: string, application: string): ISession => ({ ...buildTestSession({ id, title: id, environment: 'cloud', application }).session, isAutomation: constObservable(true) });
		const sessions = [automation('shown', 'copilot-cli'), automation('hidden', 'copilot-app')];
		const cloudApplications = (options: ReturnType<typeof getSessionFilterOptions>) => options
			.filter(option => option.filter.kind === 'application' && option.filter.environment === 'cloud')
			.map(option => option.label);
		const shownIds = observableValue<ReadonlySet<string>>('shownIds', new Set());
		const snapshots: string[][] = [];
		store.add(autorun(reader => {
			snapshots.push(cloudApplications(getSessionFilterOptions(sessions, [], (session, reader) => !session.isAutomation?.read(reader) || shownIds.read(reader).has(session.sessionId), reader)));
		}));
		shownIds.set(new Set(['shown']), undefined);

		assert.deepStrictEqual(snapshots, [['VS Code (Cloud)'], ['Copilot CLI (Cloud)', 'VS Code (Cloud)']]);
	});

	test('omits unknown creating applications without hiding their sessions', () => {
		const filters = createFilters();
		const sessions = ['agent_tasks_api', 'agent_tasks_public_api', 'api_call_received', 'unknown'].map(application =>
			buildTestSession({ id: application, title: application, environment: 'cloud', application }).session);
		for (const id of ['vscode', 'unknown', 'agent_tasks_api']) {
			filters.setExcluded({ kind: 'application', environment: 'cloud', id }, true);
		}
		const visible = () => sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
		const before = visible();
		filters.setExcluded({ kind: 'environment', id: 'cloud' }, true);
		const excludedEnvironment = visible();
		filters.setExcluded({ kind: 'environment', id: 'cloud' }, false);
		filters.setExcluded({ kind: 'harness', id: 'copilot' }, true);
		assert.deepStrictEqual({
			applications: getSessionFilterOptions(sessions, [], listAll)
				.filter(option => option.filter.kind === 'application' && option.filter.environment === 'cloud')
				.map(option => option.label),
			before,
			excludedEnvironment,
			excludedHarness: visible(),
		}, {
			applications: ['VS Code (Cloud)'],
			before: ['agent_tasks_api', 'agent_tasks_public_api', 'api_call_received', 'unknown'],
			excludedEnvironment: [],
			excludedHarness: [],
		});
	});

	for (const environment of ['local', 'remote-id', 'agenthost-build-server:8080']) {
		test(`defaults ${environment} applications to VS Code and preserves explicit choices through reload and reset`, () => {
			const storage = store.add(new InMemoryStorageService());
			const filters = createFilters(storage);
			const sessions = ['vscode', 'vscode-editor-window', 'vscode-agents-window', 'github/cli', 'github/autopilot', 'claude', 'codex', 'slack', 'teams', 'third-party'].map(application =>
				buildTestSession({ id: application, title: application, environment, application }).session);
			const visible = (filters: SessionsListFilters) => sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
			const defaults = visible(filters);
			for (const id of ['github/cli', 'claude', 'codex', 'third-party']) {
				filters.setExcluded({ kind: 'application', environment, id }, false);
			}
			filters.setExcluded({ kind: 'application', environment, id: 'vscode' }, true);
			const selected = visible(filters);
			const restored = createFilters(storage);
			const reloaded = visible(restored);
			restored.reset();

			assert.deepStrictEqual({ defaults, selected, reloaded, reset: visible(restored) }, {
				defaults: ['vscode', 'vscode-editor-window', 'vscode-agents-window'],
				selected: ['github/cli', 'claude', 'codex', 'third-party'],
				reloaded: selected,
				reset: defaults,
			});
		});
	}

	test('defaults cloud Slack and Teams off, persists opt-ins, and resets to defaults', () => {
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		const sessions = ['local', 'cloud', 'remote-id'].flatMap(environment =>
			['slack', 'teams', 'github/autopilot'].map(application =>
				buildTestSession({ id: `${environment}/${application}`, title: application, environment, application }).session));
		const visible = (filters: SessionsListFilters) => sessions.filter(session => filters.matches(session)).map(session => session.sessionId);
		const defaults = visible(filters);
		filters.setExcluded({ kind: 'application', environment: 'cloud', id: 'slack' }, false);
		const restored = createFilters(storage);
		const optedIn = visible(restored);
		restored.reset();
		assert.deepStrictEqual({ defaults, optedIn, reset: visible(restored) }, {
			defaults: ['cloud/github/autopilot'],
			optedIn: ['cloud/slack', 'cloud/github/autopilot'],
			reset: defaults,
		});
	});

	test('persists, resets, and restores the show automation runs choice', () => {
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		const initial = filters.isShowAutomationRuns();
		filters.setShowAutomationRuns(true);
		const restored = createFilters(storage);
		const reloaded = restored.isShowAutomationRuns();
		const restore = restored.capture();
		restored.reset();
		const reset = restored.isShowAutomationRuns();
		restore();

		assert.deepStrictEqual({ initial, reloaded, reset, undo: restored.isShowAutomationRuns() }, {
			initial: false,
			reloaded: true,
			reset: false,
			undo: true,
		});
	});

	test('tracks the show automation runs choice through a reader', () => {
		const filters = createFilters();
		const states: boolean[] = [];
		store.add(autorun(reader => states.push(filters.isShowAutomationRuns(reader))));

		filters.setShowAutomationRuns(true);
		filters.setShowAutomationRuns(false);

		assert.deepStrictEqual(states, [false, true, false]);
	});

	test('keeps cached application groups when a remote disconnects and tracks metadata hydration', () => {
		const connected = observableValue('connected', true);
		const local = buildTestSession({ id: 'local', title: 'Local' });
		const remote = buildTestSession({ id: 'remote', title: 'Remote', environment: 'remote-id' });
		const catalog = observableValue<readonly ISession[]>('catalog', [local.session, remote.session]);
		const environments: ISessionEnvironment[] = [{ id: 'remote-id', label: 'Workstation', isConnected: connected }];
		const snapshots: string[][] = [];
		store.add(autorun(reader => {
			snapshots.push(getSessionFilterOptions(catalog.read(reader), environments, listAll, reader).slice(3).map(option => `${option.group}: ${option.label}`));
		}));
		connected.set(false, undefined);
		remote.application.set(getSessionApplication('github/cli'), undefined);
		catalog.set([local.session], undefined);
		assert.deepStrictEqual(snapshots, [
			['2_environments: This Computer', '2_environments: Cloud', '2_environments: Workstation', '3_applications_000000: VS Code (This Computer)', '3_applications_000001: VS Code (Cloud)', '3_applications_000002: VS Code (Workstation)'],
			['2_environments: This Computer', '2_environments: Cloud', '3_applications_000000: VS Code (This Computer)', '3_applications_000001: VS Code (Cloud)', '3_applications_000002: VS Code (Workstation)'],
			['2_environments: This Computer', '2_environments: Cloud', '3_applications_000000: VS Code (This Computer)', '3_applications_000001: VS Code (Cloud)', '3_applications_000002: Copilot CLI (Workstation)', '3_applications_000002: VS Code (Workstation)'],
			['2_environments: This Computer', '2_environments: Cloud', '3_applications_000000: VS Code (This Computer)', '3_applications_000001: VS Code (Cloud)'],
		]);
	});

	test('remembers environment and application choices through rename, disappearance and reload', () => {
		const storage = store.add(new InMemoryStorageService());
		const filters = createFilters(storage);
		const session = buildTestSession({ id: 'remote', title: 'Remote', environment: 'remote-id', application: 'github/cli' }).session;
		const environmentFilter = { kind: 'environment', id: 'remote-id' } as const;
		const applicationFilter = { kind: 'application', environment: 'remote-id', id: 'github/cli' } as const;
		filters.setExcluded({ kind: 'application', environment: 'local', id: 'github/cli' }, false);
		filters.setExcluded(environmentFilter, true);
		filters.setExcluded(applicationFilter, true);
		const absent = getSessionFilterOptions([], [{ id: 'remote-id', label: 'Old Name' }], listAll);
		const restored = createFilters(storage);
		restored.setExcluded(environmentFilter, false);
		const renamed = getSessionFilterOptions([session], [{ id: 'remote-id', label: 'New Name' }], listAll);
		assert.deepStrictEqual({
			absentApplications: absent.filter(option => option.filter.kind === 'application').map(option => option.label),
			label: renamed.find(option => sessionFilterKey(option.filter) === sessionFilterKey(applicationFilter))?.label,
			excluded: restored.isExcluded(applicationFilter),
			visible: restored.matches(session),
			localChoice: restored.isExcluded({ kind: 'application', environment: 'local', id: 'github/cli' }),
		}, {
			absentApplications: ['VS Code (This Computer)', 'VS Code (Cloud)', 'VS Code (Old Name)'],
			label: 'Copilot CLI (New Name)',
			excluded: true,
			visible: false,
			localChoice: false,
		});
	});

	test('groups editor surfaces together but retains CLI, App, and unfamiliar application identities', () => {
		assert.deepStrictEqual([
			getSessionApplication('vscode-editor-window'),
			getSessionApplication('vscode-agents-window'),
			getSessionApplication('visual_studio_code_remote_agent_tool_invoked'),
			getSessionApplication('github/cli'),
			getSessionApplication('github/autopilot'),
			getSessionApplication('issues_agent_assignment'),
			getSessionApplication('CUSTOM_EVENT'),
			getSessionApplication('custom_cloud_APPLICATION'),
			getSessionApplication('another cloud application'),
			getSessionApplication('third-party-client', 'Third Party'),
			getSessionApplication('custom_client', 'Custom Client Brand'),
		], [
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'vscode', label: 'VS Code' },
			{ id: 'github/cli', label: 'Copilot CLI' },
			{ id: 'github/autopilot', label: 'Copilot App' },
			{ id: 'copilot-web', label: 'GitHub' },
			{ id: 'CUSTOM_EVENT', label: 'Custom Event' },
			{ id: 'custom_cloud_APPLICATION', label: 'Custom Cloud Application' },
			{ id: 'another cloud application', label: 'Another Cloud Application' },
			{ id: 'third-party-client', label: 'Third Party' },
			{ id: 'custom_client', label: 'Custom Client Brand' },
		]);
	});
});
