/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {WrappingIndent} from 'vs/editor/common/editorCommon';
import {CharacterHardWrappingLineMapperFactory} from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import {ILineMapperFactory, ILineMapping, OutputPosition} from 'vs/editor/common/viewModel/splitLinesCollection';

function safeGetOutputLineCount(mapper:ILineMapping): number {
	if (!mapper) {
		return 1;
	}
	return mapper.getOutputLineCount();
}

function safeGetOutputPositionOfInputOffset(mapper:ILineMapping, inputOffset:number): OutputPosition {
	if (!mapper) {
		return new OutputPosition(0, inputOffset);
	}
	return mapper.getOutputPositionOfInputOffset(inputOffset);
}

function safeGetInputOffsetOfOutputPosition(mapper:ILineMapping, outputLineIndex:number, outputOffset:number): number {
	if (!mapper) {
		return outputOffset;
	}
	return mapper.getInputOffsetOfOutputPosition(outputLineIndex, outputOffset);
}

function assertMappingIdentity(mapper:ILineMapping, offset:number, expectedLineIndex:number) {

	let result = safeGetOutputPositionOfInputOffset(mapper, offset);
	assert.ok(result.outputLineIndex !== -1);
	assert.ok(result.outputOffset !== -1);
	assert.equal(result.outputLineIndex, expectedLineIndex);

	let actualOffset = safeGetInputOffsetOfOutputPosition(mapper, result.outputLineIndex, result.outputOffset);
	assert.equal(actualOffset, offset);
}

function assertLineMapping(factory:ILineMapperFactory, tabSize:number, breakAfter:number, annotatedText:string) {

	let rawText = '';
	let currentLineIndex = 0;
	let lineIndices:number[] = [];
	for (let i = 0, len = annotatedText.length; i < len; i++) {
		if (annotatedText.charAt(i) === '|') {
			currentLineIndex++;
		} else {
			rawText += annotatedText.charAt(i);
			lineIndices[rawText.length - 1] = currentLineIndex;
		}
	}

	var mapper = factory.createLineMapping(rawText, tabSize, breakAfter, 2, WrappingIndent.None);

	assert.equal(safeGetOutputLineCount(mapper), (lineIndices.length > 0 ? lineIndices[lineIndices.length - 1] + 1 : 1));
	for (let i = 0, len = rawText.length; i < len; i++) {
		assertMappingIdentity(mapper, i, lineIndices[i]);
	}
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
		var factory = new CharacterHardWrappingLineMapperFactory('(', ')', '.');
		assertLineMapping(factory, 4, 5, 'aa \u5b89|\u5b89');
		assertLineMapping(factory, 4, 5, '\u3042 \u5b89|\u5b89');
		assertLineMapping(factory, 4, 5, '\u3042\u3042|\u5b89\u5b89');
		assertLineMapping(factory, 4, 5, 'aa |\u5b89)\u5b89|\u5b89');
		assertLineMapping(factory, 4, 5, 'aa \u3042|\u5b89\u3042)|\u5b89');
		assertLineMapping(factory, 4, 5, 'aa |(\u5b89aa|\u5b89');
	});
});
