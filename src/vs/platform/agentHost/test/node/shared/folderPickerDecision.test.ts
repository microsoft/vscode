/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { computeFolderPickerDecisionForRoots } from '../../../node/shared/folderPickerDecision.js';

suite('computeFolderPickerDecisionForRoots', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const folder = (name: string) => URI.from({ scheme: Schemas.inMemory, path: `/${name}` });
	const [a, b, c] = [folder('a'), folder('b'), folder('c')];
	const qualifies = (set: readonly URI[]) => (dir: URI) => Promise.resolve(set.some(q => q.toString() === dir.toString()));

	test('maps the qualifying-folder count to hide / pin / show', async () => {
		assert.deepStrictEqual({
			none: await computeFolderPickerDecisionForRoots([a, b, c], qualifies([])),
			one: await computeFolderPickerDecisionForRoots([a, b, c], qualifies([b])),
			several: await computeFolderPickerDecisionForRoots([a, b, c], qualifies([a, c])),
			singleRoot: await computeFolderPickerDecisionForRoots([b], qualifies([b])),
		}, {
			none: { hidden: true },
			one: { hidden: true, primary: b.toString() },
			several: { hidden: false },
			singleRoot: undefined,
		});
	});

	test('runs the predicate for every root and propagates its rejection (fail open at the caller)', async () => {
		await assert.rejects(computeFolderPickerDecisionForRoots([a, b], () => Promise.reject(new Error('boom'))));
	});

	test('passes the token through to the predicate', async () => {
		const seen: boolean[] = [];
		await computeFolderPickerDecisionForRoots([a, b], (_dir, token) => { seen.push(token.isCancellationRequested); return Promise.resolve(false); }, CancellationToken.Cancelled);
		assert.deepStrictEqual(seen, [true, true]);
	});
});
