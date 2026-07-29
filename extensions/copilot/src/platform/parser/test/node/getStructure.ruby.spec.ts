/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterAll, describe, expect, test } from 'vitest';
import { _dispose } from '../../node/parserImpl';
import { WASMLanguage } from '../../node/treeSitterLanguages';
import { fromFixture, srcWithAnnotatedStructure } from './getStructure.util';

describe('getStructure - ruby', () => {
	afterAll(() => _dispose());

	function rubyStruct(source: string) {
		return srcWithAnnotatedStructure(WASMLanguage.Ruby, source);
	}

	test('source with different syntax constructs', async () => {

		const source = await fromFixture('test.rb');

		expect(await rubyStruct(source)).toMatchSnapshot();
	});
});
