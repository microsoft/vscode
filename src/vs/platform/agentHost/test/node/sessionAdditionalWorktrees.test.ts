/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY, readSessionAdditionalWorktrees, writeSessionAdditionalWorktrees } from '../../node/shared/sessionAdditionalWorktrees.js';
import { createSessionDataService, TestSessionDatabase } from '../common/sessionTestHelpers.js';

suite('SessionAdditionalWorktrees', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const session = URI.parse('agenthost:additional-worktrees');

	test('persists and clears additional worktree ownership', async () => {
		const database = new TestSessionDatabase();
		const sessionDataService = createSessionDataService(database);
		const worktrees = [{
			handle: generateUuid(),
			workingDirectory: URI.file('/workspace/repository.worktrees/chat').toString(),
			repositoryRoot: URI.file('/workspace/repository').toString(),
		}];

		const initial = await readSessionAdditionalWorktrees(sessionDataService, session);
		await writeSessionAdditionalWorktrees(sessionDataService, session, worktrees);
		const persisted = await readSessionAdditionalWorktrees(sessionDataService, session);
		await writeSessionAdditionalWorktrees(sessionDataService, session, []);

		assert.deepStrictEqual({
			initial,
			persisted,
			cleared: await readSessionAdditionalWorktrees(sessionDataService, session),
			raw: await database.getMetadata(ADDITIONAL_WORKTREES_METADATA_KEY),
		}, {
			initial: [],
			persisted: worktrees,
			cleared: [],
			raw: undefined,
		});
	});

	test('rejects malformed additional worktree ownership', async () => {
		const database = new TestSessionDatabase();
		await database.setMetadata(ADDITIONAL_WORKTREES_METADATA_KEY, JSON.stringify([{
			handle: 'not-a-handle',
			workingDirectory: URI.file('/workspace/repository.worktrees/chat').toString(),
			repositoryRoot: URI.file('/workspace/repository').toString(),
		}]));

		await assert.rejects(
			readSessionAdditionalWorktrees(createSessionDataService(database), session),
			/Invalid additional worktree metadata/,
		);
	});
});
