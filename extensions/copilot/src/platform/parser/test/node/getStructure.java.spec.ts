/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, describe, expect, test } from 'vitest';
import { _dispose } from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { fromFixture, snapshotPathInFixture, srcWithAnnotatedStructure } from './getStructure.util';

describe('getStructure - java', () => {
	afterAll(() => _dispose());

	function javaSrcWithStructure(source: string) {
		return srcWithAnnotatedStructure(WASMLanguage.Java, source);
	}

	test('java source with different syntax constructs', async () => {

		const filename = 'test.java';

		const source = await fromFixture(filename);

		await expect(await javaSrcWithStructure(source)).toMatchFileSnapshot(snapshotPathInFixture(filename));
	});

});
