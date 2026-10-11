/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { autorun, observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { getSessionApplication } from '../../../../common/sessionApplication.js';
import { ISession, ISessionEnvironment } from '../../../../services/sessions/common/session.js';
import { buildTestSession } from '../../../../services/sessions/test/common/testSessionBuilder.js';
import { getSessionFilterOptions, sessionFilterKey, SessionsListFilters } from '../../browser/views/sessionsListFilters.js';

suite('SessionsListFilters', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFilters(storage = store.add(new InMemoryStorageService())): SessionsListFilters {
		return store.add(new SessionsListFilters(storage, store.add(new NullLogService())));
	}

	test('always offers the three harnesses, Local and Cloud, and their VS Code application choices', () => {
		assert.deepStrictEqual(getSessionFilterOptions([], []), [
			{ filter: { kind: 'harness', id: 'copilot' }, label: 'Copilot', group: '1_harnesses' },
			{ filter: { kind: 'harness', id: 'claude' }, label: 'Claude', group: '1_harnesses' },
			{ filter: { kind: 'harness', id: 'codex' }, label: 'Codex', group: '1_harnesses' },
			{ filter: { kind: 'environment', id: 'local' }, label: 'Local', group: '2_environments' },
			{ filter: { kind: 'environment', id: 'cloud' }, label: 'Cloud', group: '2_environments' },
			{ filter: { kind: 'application', environment: 'local', id: 'vscode' }, label: 'VS Code (Local)', group: '3_applications_000000' },
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
		]);
		assert.deepStrictEqual({
			environments: options.filter(option => option.filter.kind === 'environment').map(option => option.label),
			applications: options.filter(option => option.filter.kind === 'application').map(option => option.label),
		}, {
			environments: ['Local', 'Cloud', 'Connected Host'],
			applications: ['VS Code (Local)', 'Custom Cloud App (Cloud)', 'VS Code (Cloud)', 'Copilot CLI (Cached Host)', 'VS Code (Cached Host)', 'VS Code (Connected Host)'],
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

	test('keeps cached application groups when a remote disconnects and tracks metadata hydration', () => {
		const connected = observableValue('connected', true);
		const local = buildTestSession({ id: 'local', title: 'Local' });
		const remote = buildTestSession({ id: 'remote', title: 'Remote', environment: 'remote-id' });
		const catalog = observableValue<readonly ISession[]>('catalog', [local.session, remote.session]);
		const environments: ISessionEnvironment[] = [{ id: 'remote-id', label: 'Workstation', isConnected: connected }];
		const snapshots: string[][] = [];
		store.add(autorun(reader => {
			snapshots.push(getSessionFilterOptions(catalog.read(reader), environments, reader).slice(3).map(option => `${option.group}: ${option.label}`));
		}));
		connected.set(false, undefined);
		remote.application.set(getSessionApplication('github/cli'), undefined);
		catalog.set([local.session], undefined);
		assert.deepStrictEqual(snapshots, [
			['2_environments: Local', '2_environments: Cloud', '2_environments: Workstation', '3_applications_000000: VS Code (Local)', '3_applications_000001: VS Code (Cloud)', '3_applications_000002: VS Code (Workstation)'],
			['2_environments: Local', '2_environments: Cloud', '3_applications_000000: VS Code (Local)', '3_applications_000001: VS Code (Cloud)', '3_applications_000002: VS Code (Workstation)'],
			['2_environments: Local', '2_environments: Cloud', '3_applications_000000: VS Code (Local)', '3_applications_000001: VS Code (Cloud)', '3_applications_000002: Copilot CLI (Workstation)', '3_applications_000002: VS Code (Workstation)'],
			['2_environments: Local', '2_environments: Cloud', '3_applications_000000: VS Code (Local)', '3_applications_000001: VS Code (Cloud)'],
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
		const absent = getSessionFilterOptions([], [{ id: 'remote-id', label: 'Old Name' }]);
		const restored = createFilters(storage);
		restored.setExcluded(environmentFilter, false);
		const renamed = getSessionFilterOptions([session], [{ id: 'remote-id', label: 'New Name' }]);
		assert.deepStrictEqual({
			absentApplications: absent.filter(option => option.filter.kind === 'application').map(option => option.label),
			label: renamed.find(option => sessionFilterKey(option.filter) === sessionFilterKey(applicationFilter))?.label,
			excluded: restored.isExcluded(applicationFilter),
			visible: restored.matches(session),
			localChoice: restored.isExcluded({ kind: 'application', environment: 'local', id: 'github/cli' }),
		}, {
			absentApplications: ['VS Code (Local)', 'VS Code (Cloud)', 'VS Code (Old Name)'],
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
			{ id: 'issues_agent_assignment', label: 'Issues Assignment' },
			{ id: 'CUSTOM_EVENT', label: 'Custom Event' },
			{ id: 'custom_cloud_APPLICATION', label: 'Custom Cloud Application' },
			{ id: 'another cloud application', label: 'Another Cloud Application' },
			{ id: 'third-party-client', label: 'Third Party' },
			{ id: 'custom_client', label: 'Custom Client Brand' },
		]);
	});
});
