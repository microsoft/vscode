/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { SessionStatus, SESSION_META_EHCLI_ADOPTABLE_KEY, type SessionSummary } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
import { type INotification } from '../../../../../../../platform/agentHost/common/state/sessionActions.js';
import { IWorkspaceContextService, toWorkspaceFolder, Workspace } from '../../../../../../../platform/workspace/common/workspace.js';
import { AgentHostSessionListStore, type IAgentHostSessionListConnection } from '../../../../browser/agentSessions/agentHost/agentHostSessionListStore.js';

const remoteFolder = 'vscode-remote://dev-container%2Babc/home/user/repo';
const remoteWorktree = 'vscode-remote://dev-container%2Babc/home/user/worktrees/session';
const hostFolder = 'file:///home/user/repo';
const urlProject = 'https://github.com/owner/repo';
const timestamp = '2026-08-28T00:00:00.000Z';

function legacySummary(project: string, workingDirectories: string[]): SessionSummary {
	return {
		resource: 'copilot:/session', provider: 'copilot', title: 'Session',
		status: SessionStatus.Idle, createdAt: timestamp, modifiedAt: timestamp,
		workingDirectories,
		project: { uri: project, displayName: 'repo' },
		_meta: { [SESSION_META_EHCLI_ADOPTABLE_KEY]: true },
	};
}

suite('AgentHostSessionListStore project root matching', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createStore(folder: string) {
		const notifications = store.add(new Emitter<INotification>());
		const connection = new class extends mock<IAgentHostSessionListConnection>() {
			override readonly onDidNotification = notifications.event;
		};
		const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
			override readonly onDidChangeWorkspaceFolders = Event.None;
			override getWorkspace() { return new Workspace('test', [toWorkspaceFolder(URI.parse(folder))], false, null, () => false); }
		};
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string) { warnings.push(message); }
		};
		const listStore = store.add(new AgentHostSessionListStore(connection, workspaceContextService, logService));
		return { notifications, listStore, warnings };
	}

	function announce(notifications: Emitter<INotification>, summary: SessionSummary) {
		notifications.fire({ type: 'root/sessionAdded', channel: 'ahp-root://', summary });
	}

	test('matches a legacy worktree session by a project root in the window namespace', () => {
		const { notifications, listStore, warnings } = createStore(remoteFolder);

		announce(notifications, legacySummary(remoteFolder, [remoteWorktree]));

		assert.deepStrictEqual({ sessions: listStore.getSessions('copilot').length, warnings }, { sessions: 1, warnings: [] });
	});

	test('matches a legacy worktree session by a project root in a local window', () => {
		const { notifications, listStore, warnings } = createStore(hostFolder);

		announce(notifications, legacySummary(hostFolder, ['file:///home/user/worktrees/session']));

		assert.deepStrictEqual({ sessions: listStore.getSessions('copilot').length, warnings }, { sessions: 1, warnings: [] });
	});

	test('drops a legacy session whose project is a repository URL and reports it once', () => {
		const { notifications, listStore, warnings } = createStore(remoteFolder);
		const summary = legacySummary(urlProject, [remoteWorktree]);

		announce(notifications, summary);
		announce(notifications, summary);

		assert.strictEqual(listStore.getSessions('copilot').length, 0);
		assert.strictEqual(warnings.length, 1);
		assert.ok(warnings[0].includes(urlProject));
	});
});
