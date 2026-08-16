/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISession, ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { formatSessionDetails } from '../../browser/sessionDetailsAction.js';
import { createTestSession } from './sessionsListTestUtils.js';

suite('Session Details', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lists exact working directories for non-archived user sessions', () => {
		const localWorkingDirectory = URI.file('/repo.worktrees/feature');
		const workspace: ISessionWorkspace = {
			uri: URI.file('/repo'),
			label: 'repo',
			icon: Codicon.folder,
			folders: [
				{
					root: URI.file('/repo'),
					workingDirectory: localWorkingDirectory,
					name: 'repo',
					description: undefined,
				},
				{
					root: URI.parse('vscode-agent-host://host/home/user/repo'),
					workingDirectory: URI.parse('vscode-agent-host://host/home/user/repo'),
					name: 'remote-repo',
					description: undefined,
				},
			],
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
		};
		const working: ISession = {
			...createTestSession('Working', { resourceId: 'working' }).session,
			workspace: constObservable(workspace),
		};
		const quickChat = createTestSession('Quick Chat', { resourceId: 'quick-chat', isQuickChat: true }).session;
		const archived = createTestSession('Archived', { isArchived: true }).session;
		const automation: ISession = {
			...createTestSession('Automation').session,
			isAutomation: constObservable(true),
		};

		assert.strictEqual(formatSessionDetails([working, archived, automation, quickChat]), [
			'Session Details',
			'',
			'Session: Working',
			`Working directory: ${localWorkingDirectory.fsPath}`,
			'Working directory: vscode-agent-host://host/home/user/repo',
			'Resource: test-session://working',
			'',
			'Session: Quick Chat',
			'Working directory: (none)',
			'Resource: test-session://quick-chat',
			'',
		].join('\n'));
	});

	test('reports when there are no non-archived user sessions', () => {
		const archived = createTestSession('Archived', { isArchived: true }).session;
		const automation: ISession = {
			...createTestSession('Automation').session,
			isAutomation: constObservable(true),
		};

		assert.strictEqual(formatSessionDetails([archived, automation]), [
			'Session Details',
			'',
			'No non-archived user sessions.',
			'',
		].join('\n'));
	});
});
