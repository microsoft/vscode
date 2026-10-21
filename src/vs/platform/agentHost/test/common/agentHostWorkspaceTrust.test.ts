/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IWorkspaceTrustManagementService } from '../../../workspace/common/workspaceTrust.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
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

	test('a chat\'s own worktree inherits the trust of a repository folder of the session, never of an untrusted one', async () => {
		const trusted = new Set<string>([URI.file('/repo').toString()]);
		const granted: string[] = [];
		const service = new class extends mock<IWorkspaceTrustManagementService>() {
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: trusted.has(uri.toString()) }; }
			override async setUrisTrust(uris: URI[], value: boolean) { granted.push(...uris.map(uri => `${uri.path}=${value}`)); }
		};
		const result = await resolveAgentHostSessionTrustFolders(state(['file:///repo', 'file:///repo.worktrees/wt2', 'file:///other', 'file:///other.worktrees/wt3']), service);
		assert.deepStrictEqual({ folders: result?.map(folder => folder.path), granted }, {
			folders: ['/repo', '/repo.worktrees/wt2', '/other', '/other.worktrees/wt3'],
			granted: ['/repo.worktrees/wt2=true'],
		});
	});
	function trustHarness(trustedPaths: string[]) {
		const trusted = new Set<string>(trustedPaths.map(path => URI.file(path).toString()));
		const granted: string[] = [];
		const service = new class extends mock<IWorkspaceTrustManagementService>() {
			override async getUriTrustInfo(uri: URI) { return { uri, trusted: trusted.has(uri.toString()) }; }
			override async setUrisTrust(uris: URI[], value: boolean) { granted.push(...uris.map(uri => `${uri.path}=${value}`)); }
		};
		return { service, granted };
	}

	test('an untrusted repository\'s worktree still prompts', async () => {
		const { service, granted } = trustHarness([]);
		await resolveAgentHostSessionTrustFolders(state(['file:///repo', 'file:///repo.worktrees/wt']), service);
		assert.deepStrictEqual(granted, []);
	});

	test('a picked folder outside a trusted repository\'s worktrees still prompts', async () => {
		const { service, granted } = trustHarness(['/repo']);
		await resolveAgentHostSessionTrustFolders(state(['file:///repo', 'file:///picked/folder', 'file:///repo.worktrees', 'file:///repo-sibling.worktrees/wt']), service);
		assert.deepStrictEqual(granted, []);
	});

	test('a scratch folder never prompts and is never granted trust', async () => {
		const { service, granted } = trustHarness(['/repo']);
		const result = await resolveAgentHostSessionTrustFolders(state(
			['file:///repo', 'file:///repo.worktrees/scratch'],
			{ scratchFolders: ['file:///repo.worktrees/scratch'] },
		), service);
		assert.deepStrictEqual({ folders: result?.map(folder => folder.path), granted }, { folders: ['/repo'], granted: [] });
	});

	test('a worktree-isolated session\'s worktree inherits the trust of its project', async () => {
		const { service, granted } = trustHarness(['/project']);
		const sessionState = {
			...state(['file:///project.worktrees/session']),
			project: { uri: 'file:///project', displayName: 'project' },
			config: { schema: { type: 'object', properties: {} }, values: { [SessionConfigKey.Isolation]: 'worktree' } },
		} as SessionState;
		await resolveAgentHostSessionTrustFolders(sessionState, service);
		assert.deepStrictEqual(granted, ['/project.worktrees/session=true']);
	});
});
