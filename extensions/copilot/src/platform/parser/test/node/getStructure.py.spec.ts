/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, describe, expect, test } from 'vitest';
import { _dispose } from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { fromFixture, snapshotPathInFixture, srcWithAnnotatedStructure } from './getStructure.util';

describe('getStructure - python', () => {

	afterAll(() => _dispose());

	function pySrcWithStructure(source: string) {
		return srcWithAnnotatedStructure(WASMLanguage.Python, source);
	}

	test('py source with different syntax constructs', async () => {

		const source = await fromFixture('test.py');

		expect(await pySrcWithStructure(source)).toMatchSnapshot();
	});

	test('try-catch block', async () => {

		const file = 'try.py';

		const source = await fromFixture(file);

		await expect(await pySrcWithStructure(source)).toMatchFileSnapshot(snapshotPathInFixture(file));
	});
});
