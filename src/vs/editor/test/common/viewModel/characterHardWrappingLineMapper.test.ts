/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import CharacterHardWrappingLineMapper = require('vs/editor/common/viewModel/characterHardWrappingLineMapper');
import SplitLinesCollection = require('vs/editor/common/viewModel/splitLinesCollection');
import EditorCommon = require('vs/editor/common/editorCommon');

function safeGetOutputLineCount(mapper:SplitLinesCollection.ILineMapping): number {
	if (!mapper) {
		return 1;
	}
	return mapper.getOutputLineCount();
}

function safeGetOutputPositionOfInputOffset(mapper:SplitLinesCollection.ILineMapping, inputOffset:number, result:SplitLinesCollection.IOutputPosition): void {
	if (!mapper) {
		result.outputLineIndex = 0;
		result.outputOffset = inputOffset;
		return;
	}
	mapper.getOutputPositionOfInputOffset(inputOffset, result);
}

function safeGetInputOffsetOfOutputPosition(mapper:SplitLinesCollection.ILineMapping, outputLineIndex:number, outputOffset:number): number {
	if (!mapper) {
		return outputOffset;
	}
	return mapper.getInputOffsetOfOutputPosition(outputLineIndex, outputOffset);
}

function assertMappingIdentity(mapper:SplitLinesCollection.ILineMapping, offset:number, expectedLineIndex:number) {

	var result = {
		outputLineIndex: -1,
		outputOffset: -1
	};

	safeGetOutputPositionOfInputOffset(mapper, offset, result);
	assert.ok(result.outputLineIndex !== -1);
	assert.ok(result.outputOffset !== -1);
	assert.equal(result.outputLineIndex, expectedLineIndex);

	var actualOffset = safeGetInputOffsetOfOutputPosition(mapper, result.outputLineIndex, result.outputOffset);
	assert.equal(actualOffset, offset);
}

function assertLineMapping(factory:SplitLinesCollection.ILineMapperFactory, tabSize:number, breakAfter:number, annotatedText:string) {

	var rawText = '';
	var currentLineIndex = 0;
	var lineIndices:number[] = [];
	for (var i = 0, len = annotatedText.length; i < len; i++) {
		if (annotatedText.charAt(i) === '|') {
			currentLineIndex++;
		} else {
			rawText += annotatedText.charAt(i);
			lineIndices[rawText.length - 1] = currentLineIndex;
		}
	}

	var mapper = factory.createLineMapping(rawText, tabSize, breakAfter, 1, EditorCommon.WrappingIndent.None);

	assert.equal(safeGetOutputLineCount(mapper), (lineIndices.length > 0 ? lineIndices[lineIndices.length - 1] + 1 : 1));
	for (var i = 0, len = rawText.length; i < len; i++) {
		assertMappingIdentity(mapper, i, lineIndices[i]);
	}
}

suite('Editor ViewModel - CharacterHardWrappingLineMapper', () => {
	test('CharacterHardWrappingLineMapper', () => {

		var factory = new CharacterHardWrappingLineMapper.CharacterHardWrappingLineMapperFactory('(', ')', '.');

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
});
