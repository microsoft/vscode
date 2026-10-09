/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { SessionInboxDisposition } from '../../../../services/sessions/browser/sessionsListModelService.js';
import { SessionStatus } from '../../../../services/sessions/common/session.js';
import { getReadyToMergeTransition, IReadyToMergeLifecycleSnapshot, ReadyToMergeTransition } from '../../browser/sessionInboxDisposition.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('Session Inbox disposition', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const state = {
		disposition: SessionInboxDisposition.ReadyToMerge,
		updatedAt: 100,
		pullRequestKeys: ['owner/repo#1'],
	};
	const snapshot = (overrides: Partial<IReadyToMergeLifecycleSnapshot> = {}): IReadyToMergeLifecycleSnapshot => ({
		isArchived: false,
		status: SessionStatus.Completed,
		updatedAt: 100,
		hasFailingCI: false,
		pullRequests: [{ key: 'owner/repo#1', state: 'open' }],
		...overrides,
	});

	test('keeps, wakes, or completes Ready to Merge sessions from actionable state', () => {
		assert.deepStrictEqual({
			open: getReadyToMergeTransition(state, snapshot()),
			unresolved: getReadyToMergeTransition(state, snapshot({ pullRequests: [{ key: 'owner/repo#1', state: undefined }] })),
			merged: getReadyToMergeTransition(state, snapshot({ pullRequests: [{ key: 'owner/repo#1', state: 'merged' }] })),
			mergedWithMetadataUpdate: getReadyToMergeTransition(state, snapshot({ updatedAt: 101, pullRequests: [{ key: 'owner/repo#1', state: 'merged' }] })),
			needsInput: getReadyToMergeTransition(state, snapshot({ status: SessionStatus.NeedsInput })),
			newActivity: getReadyToMergeTransition(state, snapshot({ updatedAt: 101 })),
			failingCI: getReadyToMergeTransition(state, snapshot({ hasFailingCI: true })),
			closed: getReadyToMergeTransition(state, snapshot({ pullRequests: [{ key: 'owner/repo#1', state: 'closed' }] })),
			newPullRequest: getReadyToMergeTransition(state, snapshot({ pullRequests: [{ key: 'owner/repo#2', state: 'open' }] })),
			missingPullRequest: getReadyToMergeTransition(state, snapshot({ pullRequests: [] })),
		}, {
			open: ReadyToMergeTransition.None,
			unresolved: ReadyToMergeTransition.None,
			merged: ReadyToMergeTransition.MarkDone,
			mergedWithMetadataUpdate: ReadyToMergeTransition.MarkDone,
			needsInput: ReadyToMergeTransition.MoveToInbox,
			newActivity: ReadyToMergeTransition.MoveToInbox,
			failingCI: ReadyToMergeTransition.MoveToInbox,
			closed: ReadyToMergeTransition.MoveToInbox,
			newPullRequest: ReadyToMergeTransition.MoveToInbox,
			missingPullRequest: ReadyToMergeTransition.MoveToInbox,
		});
	});
});
