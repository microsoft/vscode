/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../files/common/files.js';
import { CustomizationType } from '../../../../common/state/protocol/state.js';
import { scanClaudeHooks } from '../../../../node/claude/customizations/scan/claudeHookScan.js';
import { claudeTestUserHome as userHome, claudeTestWorkspace as workspace, createInMemoryFileService, seedFile } from '../claudeCustomizationTestUtils.js';

suite('claudeHookScan', () => {

	const disposables = new DisposableStore();
	let fileService: IFileService;
	const seed = (path: string, content = '') => seedFile(fileService, path, content);

	setup(() => {
		fileService = createInMemoryFileService(disposables);
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	test('surfaces one hook entry per settings file that declares hooks, with the real settings URI', async () => {
		const project = await seed('/workspace/.claude/settings.json', JSON.stringify({
			model: 'claude-x',
			hooks: { PostToolUse: [{ matcher: 'Write', hooks: [{ type: 'command', command: 'echo hi' }] }] },
		}));
		const user = await seed('/home/.claude/settings.json', JSON.stringify({
			hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }] },
		}));

		const hooks = await scanClaudeHooks(workspace, userHome, fileService);

		assert.deepStrictEqual(
			hooks.map(h => ({ type: h.type, uri: h.uri })),
			[
				{ type: CustomizationType.Hook, uri: project.toString() },
				{ type: CustomizationType.Hook, uri: user.toString() },
			],
		);
	});

	test('reads settings.local.json (project scope) ahead of user settings', async () => {
		const local = await seed('/workspace/.claude/settings.local.json', JSON.stringify({
			hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }] },
		}));

		const hooks = await scanClaudeHooks(workspace, userHome, fileService);

		assert.deepStrictEqual(hooks.map(h => h.uri), [local.toString()]);
	});

	test('a scope with disableAllHooks contributes nothing', async () => {
		await seed('/workspace/.claude/settings.json', JSON.stringify({
			disableAllHooks: true,
			hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
		}));

		const hooks = await scanClaudeHooks(workspace, userHome, fileService);

		assert.deepStrictEqual(hooks, []);
	});

	test('a settings file without a hooks block yields no entry', async () => {
		await seed('/workspace/.claude/settings.json', JSON.stringify({ model: 'x', permissions: { allow: [] } }));

		const hooks = await scanClaudeHooks(workspace, userHome, fileService);

		assert.deepStrictEqual(hooks, []);
	});

	test('with no workspace (undefined cwd) only the user settings file is read', async () => {
		const user = await seed('/home/.claude/settings.json', JSON.stringify({
			hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }] },
		}));
		// A project hook that must NOT be surfaced when there is no workspace.
		await seed('/workspace/.claude/settings.json', JSON.stringify({
			hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo stop' }] }] },
		}));

		const hooks = await scanClaudeHooks(undefined, userHome, fileService);

		assert.deepStrictEqual(hooks.map(h => h.uri), [user.toString()]);
	});

	test('a settings file shared by workspace and user scope (cwd === userHome) is surfaced once', async () => {
		await seed('/home/.claude/settings.json', JSON.stringify({
			hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] },
		}));

		// When the user opens their home directory as the workspace, the
		// project and user scopes resolve to the same settings file — it must
		// not surface twice.
		const hooks = await scanClaudeHooks(userHome, userHome, fileService);

		assert.strictEqual(hooks.length, 1);
	});
});
