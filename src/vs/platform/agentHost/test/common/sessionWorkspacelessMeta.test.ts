/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readSessionWorkspaceless, SESSION_META_WORKSPACELESS_KEY, withSessionGitHubState, withSessionWorkspaceless } from '../../common/state/sessionState.js';

suite('Session workspace-less meta', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('readSessionWorkspaceless returns false for absent / non-true values', () => {
		assert.strictEqual(readSessionWorkspaceless(undefined), false);
		assert.strictEqual(readSessionWorkspaceless({}), false);
		assert.strictEqual(readSessionWorkspaceless({ [SESSION_META_WORKSPACELESS_KEY]: false }), false);
		assert.strictEqual(readSessionWorkspaceless({ [SESSION_META_WORKSPACELESS_KEY]: 'true' }), false);
	});

	test('withSessionWorkspaceless round-trips the marker and preserves other slots', () => {
		const withOther = withSessionGitHubState(undefined, { owner: 'octo' });
		const tagged = withSessionWorkspaceless(withOther, true);

		assert.strictEqual(readSessionWorkspaceless(tagged), true);
		// Co-existing well-known slots are preserved.
		assert.deepStrictEqual(tagged?.['github'], { owner: 'octo' });

		// Clearing removes only the workspace-less slot; an otherwise empty bag collapses to undefined.
		assert.strictEqual(withSessionWorkspaceless(tagged, false)?.[SESSION_META_WORKSPACELESS_KEY], undefined);
		assert.strictEqual(withSessionWorkspaceless({ [SESSION_META_WORKSPACELESS_KEY]: true }, false), undefined);
	});
});
