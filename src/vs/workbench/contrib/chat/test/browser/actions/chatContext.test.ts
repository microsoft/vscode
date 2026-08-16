/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUri } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { getSessionWorkspaceName, isSameSessionWorkspace, shouldShowOpenEditorsContext } from '../../../browser/actions/chatContext.js';
import { IChatWidget } from '../../../browser/chat.js';

function widget(overrides: Partial<Pick<IChatWidget, 'viewModel' | 'lockedAgentId'>>): Pick<IChatWidget, 'viewModel' | 'lockedAgentId'> {
	return {
		viewModel: undefined,
		lockedAgentId: undefined,
		...overrides,
	} as Pick<IChatWidget, 'viewModel' | 'lockedAgentId'>;
}

function widgetWithSession(sessionResource: URI): Pick<IChatWidget, 'viewModel' | 'lockedAgentId'> {
	return widget({
		viewModel: { sessionResource } as IChatWidget['viewModel'],
	});
}

suite('ChatContext', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('shows Open Editors for regular Copilot CLI sessions with eligible editors', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widgetWithSession(URI.parse('copilotcli:/session-1')), true),
			true
		);
	});

	test('hides Open Editors for Agent Host sessions with eligible editors', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widgetWithSession(URI.parse('agent-host-copilotcli:/session-1')), true),
			false
		);
	});

	test('hides Open Editors for locked Agent Host ids without a session resource', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widget({ lockedAgentId: 'agent-host-copilotcli' }), true),
			false
		);
	});

	test('hides Open Editors when there are no eligible editors', () => {
		assert.strictEqual(
			shouldShowOpenEditorsContext(widgetWithSession(URI.parse('copilotcli:/session-1')), false),
			false
		);
	});

	test('matches session workspaces by repository before cwd', () => {
		assert.deepStrictEqual({
			sameFolder: isSameSessionWorkspace(
				{ cwd: '/Users/megan/repo/', repo: 'microsoft/vscode' },
				{ cwd: '/users/megan/repo', repo: 'microsoft/vscode' },
			),
			sameRepositoryWorktree: isSameSessionWorkspace(
				{ cwd: '/Users/megan/repo', repo: 'microsoft/vscode' },
				{ cwd: '/Users/megan/repo-worktree', repo: 'microsoft/vscode' },
			),
			caseInsensitiveRepository: isSameSessionWorkspace(
				{ repo: 'Microsoft/VSCode' },
				{ repo: 'microsoft/vscode' },
			),
			differentRepository: isSameSessionWorkspace(
				{ cwd: '/Users/megan/repo', repo: 'microsoft/vscode' },
				{ cwd: '/Users/megan/repo', repo: 'microsoft/typescript' },
			),
			caseSensitiveCwd: isSameSessionWorkspace(
				{ cwd: '/work/Foo' },
				{ cwd: '/work/foo' },
				extUri,
			),
		}, {
			sameFolder: true,
			sameRepositoryWorktree: true,
			caseInsensitiveRepository: true,
			differentRepository: false,
			caseSensitiveCwd: false,
		});
	});

	test('labels a session workspace by repository or folder name', () => {
		assert.deepStrictEqual({
			repository: getSessionWorkspaceName({ repo: 'microsoft/vscode', cwd: '/Users/megan/repo-worktree' }),
			folder: getSessionWorkspaceName({ cwd: '/Users/megan/Repos/typescript/' }),
		}, {
			repository: 'vscode',
			folder: 'typescript',
		});
	});
});
