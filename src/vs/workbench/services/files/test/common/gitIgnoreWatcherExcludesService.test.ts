/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService } from '../../../../test/common/workbenchTestServices.js';
import { GitIgnoreWatcherExcludesService } from '../../common/gitIgnoreWatcherExcludesService.js';

suite('GitIgnoreWatcherExcludesService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const folder = URI.from({ scheme: Schemas.inMemory, path: '/repo' });

	function createService(watcherExcludeGitIgnore: boolean) {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));

		const service = disposables.add(new GitIgnoreWatcherExcludesService(
			fileService,
			new TestConfigurationService({ files: { watcherExcludeGitIgnore } }),
			new TestContextService(testWorkspace(folder)),
			disposables.add(new UriIdentityService(fileService))
		));

		const writeGitIgnore = (contents: string) => fileService.writeFile(joinPath(folder, '.gitignore'), VSBuffer.fromString(contents));

		return { service, writeGitIgnore };
	}

	test('resolves excludes for the root of a workspace folder when enabled', async () => {
		const enabled = createService(true);
		await enabled.writeGitIgnore('/target/\n');
		const disabled = createService(false);
		await disabled.writeGitIgnore('/target/\n');

		assert.deepStrictEqual({
			root: await enabled.service.getExcludes(folder),
			subfolder: await enabled.service.getExcludes(joinPath(folder, 'src')),
			outsideWorkspace: await enabled.service.getExcludes(URI.from({ scheme: Schemas.inMemory, path: '/other' })),
			disabled: await disabled.service.getExcludes(folder),
		}, {
			root: ['target/**/*'],
			subfolder: [],
			outsideWorkspace: [],
			disabled: [],
		});
	});

	test('reports changes to the .gitignore file only when they change the excludes', () => runWithFakedTimers({}, async () => {
		const { service, writeGitIgnore } = createService(true);
		const changes: string[] = [];
		disposables.add(service.onDidChangeExcludes(folder => changes.push(folder.path)));

		await writeGitIgnore('/target/\n');
		const initial = await service.getExcludes(folder);

		await writeGitIgnore('# build output\n/target/\n');
		await timeout(1000);
		const afterComment = await service.getExcludes(folder);
		const changesAfterComment = [...changes];

		await writeGitIgnore('/target/\nnode_modules/\n');
		await timeout(1000);
		const afterPattern = await service.getExcludes(folder);

		assert.deepStrictEqual({ initial, afterComment, changesAfterComment, afterPattern, changes }, {
			initial: ['target/**/*'],
			afterComment: ['target/**/*'],
			changesAfterComment: [],
			afterPattern: ['target/**/*', 'node_modules/**/*', '*/**/node_modules/**/*'],
			changes: ['/repo'],
		});
	}));
});
