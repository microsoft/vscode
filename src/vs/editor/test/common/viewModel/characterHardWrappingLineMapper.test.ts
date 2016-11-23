/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { WrappingIndent } from 'vs/editor/common/editorCommon';
import { CharacterHardWrappingLineMapperFactory } from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import { ILineMapperFactory } from 'vs/editor/common/viewModel/splitLinesCollection';

function assertLineMapping(factory: ILineMapperFactory, tabSize: number, breakAfter: number, annotatedText: string, wrappingIndent = WrappingIndent.None) {

	let rawText = '';
	let currentLineIndex = 0;
	let lineIndices: number[] = [];
	for (let i = 0, len = annotatedText.length; i < len; i++) {
		if (annotatedText.charAt(i) === '|') {
			currentLineIndex++;
		} else {
			rawText += annotatedText.charAt(i);
			lineIndices[rawText.length - 1] = currentLineIndex;
		}
	}

	let mapper = factory.createLineMapping(rawText, tabSize, breakAfter, 2, wrappingIndent);

	let actualAnnotatedText = '';
	if (mapper) {
		let previousLineIndex = 0;
		for (let i = 0, len = rawText.length; i < len; i++) {
			let r = mapper.getOutputPositionOfInputOffset(i);
			if (previousLineIndex !== r.outputLineIndex) {
				previousLineIndex = r.outputLineIndex;
				actualAnnotatedText += '|';
			}
			actualAnnotatedText += rawText.charAt(i);
		}
	} else {
		// No wrapping
		actualAnnotatedText = rawText;
	}

	assert.equal(actualAnnotatedText, annotatedText);
}

suite('Editor ViewModel - CharacterHardWrappingLineMapper', () => {
	test('CharacterHardWrappingLineMapper', () => {

		let factory = new CharacterHardWrappingLineMapperFactory('(', ')', '.');

		// Empty string
		assertLineMapping(factory, 4, 5, '');

		// No wrapping if not necessary
		assertLineMapping(factory, 4, 5, 'aaa');
		assertLineMapping(factory, 4, 5, 'aaaaa');
		assertLineMapping(factory, 4, -1, 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

		// Acts like hard wrapping if no char found
		assertLineMapping(factory, 4, 5, 'aaaaa|a');

		// Honors obtrusive wrapping character
		assertLineMapping(factory, 4, 5, 'aaaaa|.');
		assertLineMapping(factory, 4, 5, 'aaaaa|a.|aaa.|aa');
		assertLineMapping(factory, 4, 5, 'aaaaa|a..|aaa.|aa');
		assertLineMapping(factory, 4, 5, 'aaaaa|a...|aaa.|aa');
		assertLineMapping(factory, 4, 5, 'aaaaa|a....|aaa.|aa');

		// Honors tabs when computing wrapping position
		assertLineMapping(factory, 4, 5, '\t');
		assertLineMapping(factory, 4, 5, '\ta|aa');
		assertLineMapping(factory, 4, 5, '\ta|\ta|a');
		assertLineMapping(factory, 4, 5, 'aa\ta');
		assertLineMapping(factory, 4, 5, 'aa\ta|a');

		// Honors wrapping before characters (& gives it priority)
		assertLineMapping(factory, 4, 5, 'aaa.|aa');
		assertLineMapping(factory, 4, 5, 'aaa|(.aa');

		// Honors wrapping after characters (& gives it priority)
		assertLineMapping(factory, 4, 5, 'aaa))|).aaa');
		assertLineMapping(factory, 4, 5, 'aaa))|)|.aaaa');
		assertLineMapping(factory, 4, 5, 'aaa)|()|.aaa');
		assertLineMapping(factory, 4, 5, 'aaa(|()|.aaa');
		assertLineMapping(factory, 4, 5, 'aa.(|()|.aaa');
		assertLineMapping(factory, 4, 5, 'aa.|(.)|.aaa');
	});

	test('CharacterHardWrappingLineMapper - CJK and Kinsoku Shori', () => {
		let factory = new CharacterHardWrappingLineMapperFactory('(', ')', '.');
		assertLineMapping(factory, 4, 5, 'aa \u5b89|\u5b89');
		assertLineMapping(factory, 4, 5, '\u3042 \u5b89|\u5b89');
		assertLineMapping(factory, 4, 5, '\u3042\u3042|\u5b89\u5b89');
		assertLineMapping(factory, 4, 5, 'aa |\u5b89)\u5b89|\u5b89');
		assertLineMapping(factory, 4, 5, 'aa \u3042|\u5b89\u3042)|\u5b89');
		assertLineMapping(factory, 4, 5, 'aa |(\u5b89aa|\u5b89');
	});

	test('CharacterHardWrappingLineMapper - WrappingIndent.Same', () => {
		let factory = new CharacterHardWrappingLineMapperFactory('', ' ', '');
		assertLineMapping(factory, 4, 38, ' *123456789012345678901234567890123456|7890', WrappingIndent.Same);
	});
});
