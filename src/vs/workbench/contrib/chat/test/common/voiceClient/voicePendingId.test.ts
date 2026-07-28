/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { derivePendingId } from '../../../common/voiceClient/voiceClientService.js';

suite('derivePendingId', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// This id is the only thing routing a spoken answer back to the form that
	// asked. The controller derives it when it describes a pending request and
	// the dispatch service derives it again to find that request, so these
	// properties are what stop an answer from landing on the wrong part -- or,
	// if the two ever disagreed, from landing anywhere at all.

	test('is stable for the same request and part', () => {
		assert.strictEqual(derivePendingId('req-1', 3), derivePendingId('req-1', 3));
	});

	test('distinguishes two pending parts in one response', () => {
		assert.notStrictEqual(derivePendingId('req-1', 0), derivePendingId('req-1', 1));
	});

	test('distinguishes the same position in different requests', () => {
		assert.notStrictEqual(derivePendingId('req-1', 0), derivePendingId('req-2', 0));
	});

	test('cannot be forged by a request id that embeds the separator', () => {
		// A request id is a generated uuid, but if one ever contained '#' then
		// `a#1` + part 0 would otherwise collide with `a` + part 1, and an answer
		// meant for one form would be applied to another.
		assert.notStrictEqual(derivePendingId('a#1', 0), derivePendingId('a', 1));
	});
});
