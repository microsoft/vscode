/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IUserDataProfile } from '../../../userDataProfile/common/userDataProfile.js';
import { ICodeWindow } from '../../../window/electron-main/window.js';
import { findWindowOnWorkspaceOrFolder } from '../../electron-main/windowsFinder.js';

suite('Project Board native window lookup', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('PB-06: canonical Agents workspace reuses its profile window, not either invoking Editor', () => {
		const workspaceUri = URI.file('/user-data/agents.code-workspace');
		const profile = upcastPartial<IUserDataProfile>({ id: 'agents-profile', isAgentsWindowProfile: true });
		const agentsWindow = upcastPartial<ICodeWindow>({
			id: 3,
			lastFocusTime: 1,
			openedWorkspace: { id: 'agents', configPath: workspaceUri },
			profile,
		});
		const firstEditor = upcastPartial<ICodeWindow>({
			id: 1,
			lastFocusTime: 3,
			openedWorkspace: { id: 'first-editor', uri: URI.file('/first-editor') },
		});
		const secondEditor = upcastPartial<ICodeWindow>({
			id: 2,
			lastFocusTime: 2,
			openedWorkspace: { id: 'second-editor', uri: URI.file('/second-editor') },
		});

		for (const windows of [
			[firstEditor, secondEditor, agentsWindow],
			[secondEditor, agentsWindow, firstEditor],
		]) {
			const target = findWindowOnWorkspaceOrFolder(windows, URI.revive(workspaceUri.toJSON()));
			assert.strictEqual(target, agentsWindow);
			assert.strictEqual(target.profile, profile);
		}
	});

	test('PB-06: a different user-data workspace is not a matching Agents window', () => {
		const otherAgentsWindow = upcastPartial<ICodeWindow>({
			id: 4,
			openedWorkspace: { id: 'other-agents', configPath: URI.file('/other-user-data/agents.code-workspace') },
		});
		assert.strictEqual(findWindowOnWorkspaceOrFolder([otherAgentsWindow], URI.file('/user-data/agents.code-workspace')), undefined);
	});
});
