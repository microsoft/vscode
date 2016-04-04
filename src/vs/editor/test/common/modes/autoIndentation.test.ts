/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Brackets} from 'vs/editor/common/modes/supports/electricCharacter';
import {createLineContextFromTokenText} from 'vs/editor/test/common/modesTestUtils';

suite('Editor Modes - Auto Indentation', () => {
	test('Doc comments', () => {
		var brackets = new Brackets('test', null,
			{ scope: 'doc', open: '/**', lineStart: ' * ', close: ' */' });

		assert.equal(brackets.onElectricCharacter(createLineContextFromTokenText([
			{ text: '/**', type: 'doc' },
		]), 2).appendText, ' */');
		assert.equal(brackets.onElectricCharacter(createLineContextFromTokenText([
			{ text: '/**', type: 'doc' },
			{ text: ' ', type: 'doc' },
			{ text: '*/', type: 'doc' },
		]), 2), null);
	});
});
