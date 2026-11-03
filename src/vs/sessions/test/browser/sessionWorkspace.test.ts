/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../base/common/codicons.js';
import { constObservable, derived } from '../../../base/common/observable.js';
import { URI } from '../../../base/common/uri.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { getSessionWorkspaceDisplayInfo } from '../../browser/sessionWorkspace.js';
import { IChat, ISessionWorkspace } from '../../services/sessions/common/session.js';
import { IActiveSession } from '../../services/sessions/common/sessionsManagement.js';

suite('Session Workspace Display Info', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function workspace(label: string, directory: URI, workTreeUri?: URI): ISessionWorkspace {
		return {
			uri: directory,
			label,
			icon: Codicon.repo,
			requiresWorkspaceTrust: false,
			isVirtualWorkspace: false,
			folders: [{ root: directory, workingDirectory: workTreeUri ?? directory, name: label, description: undefined, gitRepository: { uri: directory, workTreeUri, baseBranchName: 'main', branchName: `${label}-branch`, gitHubInfo: constObservable(undefined) } }],
		};
	}

	test('describes the active chat\'s workspace rather than the session\'s', () => {
		const tools = URI.file('/src/tools');
		const worktree = URI.file('/src/tools.worktrees/task');
		const session = upcastPartial<IActiveSession>({
			workspace: constObservable(workspace('vscode', URI.file('/src/vscode'))),
			activeChat: constObservable(upcastPartial<IChat>({ workspace: constObservable(workspace('tools', tools, worktree)) })),
		});

		const info = derived(reader => getSessionWorkspaceDisplayInfo(session, reader)).get();

		assert.deepStrictEqual({ ...info, icon: info?.icon.id }, {
			label: 'tools',
			icon: Codicon.worktreeCompact.id,
			workingDirectoryPath: worktree.fsPath,
			branch: 'tools-branch',
			worktreePending: false,
		});
	});

	test('omits the branch for a repository folder workspace', () => {
		const tools = URI.file('/src/tools');
		const session = upcastPartial<IActiveSession>({
			workspace: constObservable(workspace('vscode', URI.file('/src/vscode'))),
			activeChat: constObservable(upcastPartial<IChat>({ workspace: constObservable(workspace('tools', tools)) })),
		});

		const info = derived(reader => getSessionWorkspaceDisplayInfo(session, reader)).get();

		assert.deepStrictEqual({ ...info, icon: info?.icon.id }, {
			label: 'tools',
			icon: Codicon.folderCompact.id,
			workingDirectoryPath: tools.fsPath,
			branch: undefined,
			worktreePending: false,
		});
	});
});
