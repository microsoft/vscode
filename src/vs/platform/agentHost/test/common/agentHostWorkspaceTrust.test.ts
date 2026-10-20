/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IWorkspaceTrustManagementService } from '../../../workspace/common/workspaceTrust.js';
import { resolveAgentHostSessionTrustFolders } from '../../common/agentHostWorkspaceTrust.js';
import { SessionLifecycle, SessionState, SessionStatus, withSessionScratchFolders, withSessionWorkspaceless } from '../../common/state/sessionState.js';

suite('resolveAgentHostSessionTrustFolders', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const trustService = new class extends mock<IWorkspaceTrustManagementService>() { };

	function state(workingDirectories: string[], options: { workspaceless?: boolean; scratchFolders?: string[] } = {}): SessionState {
		return {
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			lifecycle: SessionLifecycle.Ready,
			activeClients: [],
			chats: [],
			workingDirectories,
			_meta: withSessionScratchFolders(withSessionWorkspaceless(undefined, options.workspaceless === true), options.scratchFolders ?? []),
		};
	}

	async function resolve(sessionState: SessionState): Promise<string[] | undefined> {
		return (await resolveAgentHostSessionTrustFolders(sessionState, trustService))?.map(folder => folder.toString());
	}

	test('excludes scratch folders of a workspace-less session with nested chats', async () => {
		const result = await resolve(state(
			['file:///home/.copilot/chats/A', 'file:///home/.copilot/chats/x', 'file:///repo', 'file:///home/.copilot/chats/y'],
			{ workspaceless: true, scratchFolders: ['file:///home/.copilot/chats/A', 'file:///home/.copilot/chats/x', 'file:///home/.copilot/chats/y'] },
		));
		assert.deepStrictEqual(result, [URI.file('/repo').toString()]);
	});

	test('excludes a moved-in scratch folder of a workspace session and keeps real folders', async () => {
		const result = await resolve(state(
			['file:///repo', 'file:///home/.copilot/chats/x'],
			{ scratchFolders: ['file:///home/.copilot/chats/x'] },
		));
		assert.deepStrictEqual(result, [URI.file('/repo').toString()]);
	});

	test('returns no trust folders when every folder is a scratch folder', async () => {
		const result = await resolve(state(
			['file:///home/.copilot/chats/A', 'file:///home/.copilot/chats/x'],
			{ workspaceless: true, scratchFolders: ['file:///home/.copilot/chats/A', 'file:///home/.copilot/chats/x'] },
		));
		assert.strictEqual(result, undefined);
	});

	test('keeps all folders without scratch metadata (older host)', async () => {
		const result = await resolve(state(['file:///repo', 'file:///other']));
		assert.deepStrictEqual(result, [URI.file('/repo').toString(), URI.file('/other').toString()]);
	});
});
