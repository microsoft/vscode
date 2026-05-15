/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { buildMutableConfigSchema } from '../../common/agentHostSessionsProvider.js';

suite('buildMutableConfigSchema', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('derives per-value schema entries and special-cases autoApprove', () => {
		const actual = buildMutableConfigSchema({
			autoApprove: 'default',
			mode: 'worktree',
			timeout: 5000,
			enabled: true,
			tags: ['a', 'b'],
			permissions: { allow: ['Tool'], deny: [] },
			nothing: undefined,
			missing: null,
		});

		assert.deepStrictEqual(actual, {
			autoApprove: {
				type: 'string',
				title: 'autoApprove',
				sessionMutable: true,
				enum: ['default', 'autoApprove', 'autopilot'],
			},
			mode: {
				type: 'string',
				title: 'mode',
				sessionMutable: true,
				enum: ['worktree'],
			},
			timeout: { type: 'number', title: 'timeout', sessionMutable: true },
			enabled: { type: 'boolean', title: 'enabled', sessionMutable: true },
			tags: { type: 'array', title: 'tags', sessionMutable: true },
			permissions: { type: 'object', title: 'permissions', sessionMutable: true },
			// `undefined` and `null` are omitted — they aren't representable in
			// the config schema.
		});
	});
});
