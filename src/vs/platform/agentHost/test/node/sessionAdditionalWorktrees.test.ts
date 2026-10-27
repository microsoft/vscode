/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ADDITIONAL_WORKTREES_METADATA_KEY } from '../../node/shared/sessionAdditionalWorktrees.js';
import { readTestSessionAdditionalWorktrees, seedSessionAdditionalWorktrees } from './chatMetadataTestHelpers.js';
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
			chat: URI.parse('ahp-chat://session/chat').toString(),
		}];

		const initial = await readTestSessionAdditionalWorktrees(sessionDataService, session);
		await seedSessionAdditionalWorktrees(sessionDataService, session, worktrees);
		const persisted = await readTestSessionAdditionalWorktrees(sessionDataService, session);
		await seedSessionAdditionalWorktrees(sessionDataService, session, []);

		assert.deepStrictEqual({
			initial,
			persisted,
			cleared: await readTestSessionAdditionalWorktrees(sessionDataService, session),
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
			readTestSessionAdditionalWorktrees(createSessionDataService(database), session),
			/Invalid additional worktree metadata/,
		);
	});
});
