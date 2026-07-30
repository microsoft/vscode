/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { CodexSessionMetadataStore } from '../../../node/codex/codexSessionMetadataStore.js';
import { createSessionDataService, TestSessionDatabase } from '../../common/sessionTestHelpers.js';

suite('CodexSessionMetadataStore', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round trips working directories', async () => {
		const store = new CodexSessionMetadataStore(createSessionDataService(), new NullLogService());
		const session = URI.parse('codex:/session');
		const workingDirectories = [URI.file('/repo-a'), URI.file('/repo-b')];

		await store.write(session, { threadId: 'thread', cwd: workingDirectories[0], workingDirectories });

		const overlay = await store.read(session);
		assert.deepStrictEqual({
			threadId: overlay.threadId,
			cwd: overlay.cwd?.toString(),
			workingDirectories: overlay.workingDirectories?.map(directory => directory.toString()),
		}, {
			threadId: 'thread',
			cwd: workingDirectories[0].toString(),
			workingDirectories: workingDirectories.map(directory => directory.toString()),
		});
	});

	test('ignores malformed working directory metadata', async () => {
		const database = new TestSessionDatabase();
		await database.setMetadata('codex.cwd', '{"cwd":');
		const store = new CodexSessionMetadataStore(createSessionDataService(database), new NullLogService());

		const overlay = await store.read(URI.parse('codex:/session'));

		assert.deepStrictEqual({ cwd: overlay.cwd, workingDirectories: overlay.workingDirectories }, {
			cwd: undefined,
			workingDirectories: undefined,
		});
	});
});
