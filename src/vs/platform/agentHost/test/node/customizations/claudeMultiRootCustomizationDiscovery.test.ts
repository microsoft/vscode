/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../files/common/files.js';
import { NullLogService } from '../../../../log/common/log.js';
import { discoverClaudeMultiRootCustomizations } from '../../../node/claude/customizations/claudeMultiRootCustomizationDiscovery.js';
import { createInMemoryFileService, seedFile } from './claudeCustomizationTestUtils.js';

suite('claudeMultiRootCustomizationDiscovery', () => {
	const disposables = new DisposableStore();
	const rootA = URI.from({ scheme: Schemas.inMemory, path: '/a' });
	const rootB = URI.from({ scheme: Schemas.inMemory, path: '/b' });
	const userHome = URI.from({ scheme: Schemas.inMemory, path: '/home' });
	let fileService: IFileService;
	const seed = (path: string, content = '') => seedFile(fileService, path, content);

	setup(() => {
		fileService = createInMemoryFileService(disposables);
	});

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('combines roots in order and applies first-name-wins precedence', async () => {
		await Promise.all([
			seed('/a/.claude/agents/shared.md', '---\nname: shared\ndescription: from a\n---'),
			seed('/b/.claude/agents/shared.md', '---\nname: shared\ndescription: from b\n---'),
			seed('/b/.claude/agents/b-only.md', '---\nname: b-only\ndescription: from b\n---'),
			seed('/b/.claude/skills/shared-skill/SKILL.md', '---\nname: shared-skill\ndescription: from b\n---'),
			seed('/home/.claude/skills/shared-skill/SKILL.md', '---\nname: shared-skill\ndescription: from user\n---'),
			seed('/home/.claude/skills/user-only/SKILL.md', '---\nname: user-only\ndescription: from user\n---'),
			seed('/b/.claude/commands/not-loaded.md', '---\nname: not-loaded\ndescription: added-directory command\n---'),
		]);

		const result = await discoverClaudeMultiRootCustomizations([rootA, rootB], userHome, fileService, new NullLogService());

		assert.deepStrictEqual({
			roots: result.workingDirectories.map(root => root.path),
			items: result.discovered.map(item => ({ name: item.name, description: item.description, path: item.uri.path })),
		}, {
			roots: ['/a', '/b'],
			items: [
				{ name: 'shared', description: 'from a', path: '/a/.claude/agents/shared.md' },
				{ name: 'b-only', description: 'from b', path: '/b/.claude/agents/b-only.md' },
				{ name: 'shared-skill', description: 'from b', path: '/b/.claude/skills/shared-skill/SKILL.md' },
				{ name: 'user-only', description: 'from user', path: '/home/.claude/skills/user-only/SKILL.md' },
			],
		});
	});

	test('deduplicates equivalent roots without changing precedence', async () => {
		await seed('/a/.claude/agents/a.md', '---\nname: a\ndescription: A\n---');

		const result = await discoverClaudeMultiRootCustomizations([rootA, rootA], userHome, fileService, new NullLogService());

		assert.deepStrictEqual({
			roots: result.workingDirectories.map(root => root.path),
			items: result.discovered.map(item => item.name),
		}, {
			roots: ['/a'],
			items: ['a'],
		});
	});
});
