/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import autoIndentation = require('vs/editor/common/modes/supports/electricCharacter');
import modes = require('vs/editor/common/modes');
import modesUtil = require('vs/editor/test/common/modesTestUtils');

suite('Editor Modes - Auto Indentation', () => {
	test('Doc comments', () => {
		var brackets = new autoIndentation.Brackets('test', [],
			{ scope: 'doc', open: '/**', lineStart: ' * ', close: ' */' });

		assert.equal(brackets.onElectricCharacter(modesUtil.createLineContextFromTokenText([
			{ text: '/**', type: 'doc' },
		]), 2).appendText, ' */');
		assert.equal(brackets.onElectricCharacter(modesUtil.createLineContextFromTokenText([
			{ text: '/**', type: 'doc' },
			{ text: ' ', type: 'doc' },
			{ text: '*/', type: 'doc' },
		]), 2), null);
	});
});
