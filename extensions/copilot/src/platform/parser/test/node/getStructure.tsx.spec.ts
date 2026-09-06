/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, describe, expect, test } from 'vitest';
import { _dispose } from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { fromFixture, srcWithAnnotatedStructure } from './getStructure.util';

describe('getStructure - tsx', () => {
	afterAll(() => _dispose());

	function tsxSrcWithStructure(source: string) {
		return srcWithAnnotatedStructure(WASMLanguage.TypeScriptTsx, source);
	}

	test('tsx source with different syntax constructs', async () => {

		const source = await fromFixture('test.tsx');

		expect(await tsxSrcWithStructure(source)).toMatchSnapshot();
	});

	test('issue #7487', async () => {

		const source = await fromFixture('EditForm.tsx');

		expect(await tsxSrcWithStructure(source)).toMatchSnapshot();
	});
});
