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
import { claudeDirectoryQualifiesForPrimary } from '../../../node/claude/claudeFolderPickerCriteria.js';
import { CapturingLogService, createInMemoryFileService, seedFile } from './claudeCustomizationTestUtils.js';

suite('claudeDirectoryQualifiesForPrimary', () => {

	const disposables = new DisposableStore();
	let fileService: IFileService;
	const logService = new NullLogService();
	const userHome = URI.from({ scheme: Schemas.inMemory, path: '/home' });
	const hooks = JSON.stringify({ hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } });

	setup(() => {
		fileService = createInMemoryFileService(disposables);
	});

	teardown(() => {
		disposables.clear();
	});
	ensureNoDisposablesAreLeakedInTestSuite();

	const qualifies = (path: string) => claudeDirectoryQualifiesForPrimary(fileService, URI.from({ scheme: Schemas.inMemory, path }), userHome, logService);

	test('qualifies on an .mcp.json manifest or a non-empty hooks block, and ignores empty/disabled hooks', async () => {
		await seedFile(fileService, '/mcp/.mcp.json', '{}');
		await seedFile(fileService, '/settings/.claude/settings.json', hooks);
		await seedFile(fileService, '/local/.claude/settings.local.json', hooks);
		await seedFile(fileService, '/emptyHooks/.claude/settings.json', JSON.stringify({ hooks: {} }));
		await seedFile(fileService, '/disabled/.claude/settings.json', JSON.stringify({ disableAllHooks: true, hooks: { PostToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } }));
		await seedFile(fileService, '/unrelated/.claude/settings.json', JSON.stringify({ model: 'claude-x' }));

		assert.deepStrictEqual({
			mcpOnly: await qualifies('/mcp'),
			settingsHooks: await qualifies('/settings'),
			localSettingsHooks: await qualifies('/local'),
			emptyHooks: await qualifies('/emptyHooks'),
			disabledHooks: await qualifies('/disabled'),
			unrelatedSettings: await qualifies('/unrelated'),
			nothing: await qualifies('/nothing'),
		}, {
			mcpOnly: true,
			settingsHooks: true,
			localSettingsHooks: true,
			emptyHooks: false,
			disabledHooks: false,
			unrelatedSettings: false,
			nothing: false,
		});
	});

	test('a working directory without a file system provider does not qualify and is warned about rather than rejected', async () => {
		const log = new CapturingLogService();
		const remote = URI.from({ scheme: Schemas.vscodeRemote, authority: 'dev-container+abc', path: '/workspace' });

		const qualifies = await claudeDirectoryQualifiesForPrimary(fileService, remote, userHome, log);

		assert.deepStrictEqual({
			qualifies,
			warned: ['.mcp.json', '.claude/settings.json', '.claude/settings.local.json'].map(name => log.warnings.some(warning => warning.includes(URI.joinPath(remote, name).toString()))),
		}, { qualifies: false, warned: [true, true, true] });
	});
});
