/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readSessionDebugArtifacts, SESSION_META_DEBUG_ARTIFACTS_KEY, withSessionDebugArtifacts, withSessionGitHubState } from '../../common/state/sessionState.js';

suite('Session debug-artifacts meta', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('readSessionDebugArtifacts returns undefined for absent / non-array, and drops malformed entries', () => {
		assert.strictEqual(readSessionDebugArtifacts(undefined), undefined);
		assert.strictEqual(readSessionDebugArtifacts({}), undefined);
		assert.strictEqual(readSessionDebugArtifacts({ [SESSION_META_DEBUG_ARTIFACTS_KEY]: 'nope' }), undefined);
		// Entries missing a string label/uri are dropped; well-formed ones survive.
		assert.deepStrictEqual(
			readSessionDebugArtifacts({
				[SESSION_META_DEBUG_ARTIFACTS_KEY]: [
					{ label: 'debug', uri: '/logs/claude/x.log' },
					{ label: 'no uri' },
					{ uri: '/no/label' },
					'garbage',
				],
			}),
			[{ label: 'debug', uri: '/logs/claude/x.log' }],
		);
	});

	test('withSessionDebugArtifacts round-trips artifacts and preserves other slots', () => {
		const artifacts = [{ label: 'Claude debug log', uri: '/logs/claude/a.log' }, { label: 'Claude transcript', uri: '/home/.claude/projects/p/s.jsonl' }];
		const withOther = withSessionGitHubState(undefined, { owner: 'octo' });
		const tagged = withSessionDebugArtifacts(withOther, artifacts);

		assert.deepStrictEqual(readSessionDebugArtifacts(tagged), artifacts);
		// Co-existing well-known slots are preserved.
		assert.deepStrictEqual(tagged?.['github'], { owner: 'octo' });

		// Clearing (undefined or empty) removes only the artifacts slot; an otherwise empty bag collapses to undefined.
		assert.strictEqual(withSessionDebugArtifacts({ [SESSION_META_DEBUG_ARTIFACTS_KEY]: artifacts }, undefined), undefined);
		assert.strictEqual(withSessionDebugArtifacts({ [SESSION_META_DEBUG_ARTIFACTS_KEY]: artifacts }, []), undefined);
	});
});
