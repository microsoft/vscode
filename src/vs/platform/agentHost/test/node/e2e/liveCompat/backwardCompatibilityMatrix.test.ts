/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { describeIdentityMismatch } from './backwardCompatibilityMatrix.js';
import { BACKWARD_COMPAT_OLDER_BUILDS } from './runBackwardCompatibilityMatrix.js';

const A = 'mock:/session-a';
const B = 'mock:/session-b';

suite('Agent Host backward-compat identity rule', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('a listing that matches the expectation exactly is accepted', () => {
		assert.strictEqual(
			describeIdentityMismatch(
				[{ resource: A, title: 'from older build' }, { resource: B, title: 'also older' }],
				[{ resource: A, title: 'from older build' }, { resource: B, title: 'also older' }],
			),
			undefined,
		);
	});

	test('order is not identity: the same set listed in reverse still matches', () => {
		assert.strictEqual(
			describeIdentityMismatch([{ resource: B }, { resource: A }], [{ resource: A }, { resource: B }]),
			undefined,
		);
	});

	test('a duplicated identity is reported as duplication, not as an extra session', () => {
		// The signature downgrade defect: an older build re-adopts the same chat
		// under a second row, which the returning build then reports twice.
		assert.match(
			describeIdentityMismatch([{ resource: A }, { resource: A }], [{ resource: A }])!,
			/more than once: mock:\/session-a x2/,
		);
	});

	test('missing and unexpected identities are both named', () => {
		assert.deepStrictEqual(
			[
				describeIdentityMismatch([{ resource: A }], [{ resource: A }, { resource: B }]),
				describeIdentityMismatch([{ resource: A }, { resource: B }], [{ resource: A }]),
			],
			[
				'listed sessions do not match: missing [mock:/session-b], unexpected []',
				'listed sessions do not match: missing [], unexpected [mock:/session-b]',
			],
		);
	});

	test('a title reverted by the returning build fails even though the session survived', () => {
		assert.match(
			describeIdentityMismatch(
				[{ resource: A, title: 'Backward Compat Seed' }],
				[{ resource: A, title: 'Renamed By Older Build' }],
			)!,
			/should carry title "Renamed By Older Build" but carries "Backward Compat Seed"/,
		);
	});

	test('titles are only asserted when the expectation states one', () => {
		assert.strictEqual(
			describeIdentityMismatch([{ resource: A, title: 'anything at all' }], [{ resource: A }]),
			undefined,
		);
	});

	test('an empty profile matches an empty expectation', () => {
		assert.strictEqual(describeIdentityMismatch([], []), undefined);
	});

	test('every older checkpoint is covered, oldest first, and the current build is not paired with itself', () => {
		assert.deepStrictEqual([...BACKWARD_COMPAT_OLDER_BUILDS], ['legacy', 'intermediate', 'predecessor']);
	});
});
