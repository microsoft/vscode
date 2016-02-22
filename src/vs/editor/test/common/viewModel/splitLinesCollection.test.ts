/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {Position} from 'vs/editor/common/core/position';
import {CharacterHardWrappingLineMapping} from 'vs/editor/common/viewModel/characterHardWrappingLineMapper';
import {PrefixSumComputer} from 'vs/editor/common/viewModel/prefixSumComputer';
import {ILineMapping, IModel, SplitLine} from 'vs/editor/common/viewModel/splitLinesCollection';

suite('Editor ViewModel - SplitLinesCollection', () => {
	test('SplitLine', () => {
		var model1 = createModel('My First LineMy Second LineAnd another one');
		var line1 = createSplitLine([13, 14, 15], '');

		assert.equal(line1.getOutputLineCount(), 3);
		assert.equal(line1.getOutputLineContent(model1, 1, 0), 'My First Line');
		assert.equal(line1.getOutputLineContent(model1, 1, 1), 'My Second Line');
		assert.equal(line1.getOutputLineContent(model1, 1, 2), 'And another one');
		assert.equal(line1.getOutputLineMaxColumn(model1, 1, 0), 14);
		assert.equal(line1.getOutputLineMaxColumn(model1, 1, 1), 15);
		assert.equal(line1.getOutputLineMaxColumn(model1, 1, 2), 16);
		for (var col = 1; col <= 14; col++) {
			assert.equal(line1.getInputColumnOfOutputPosition(0, col), col, 'getInputColumnOfOutputPosition(0, ' + col + ')');
		}
		for (var col = 1; col <= 15; col++) {
			assert.equal(line1.getInputColumnOfOutputPosition(1, col), 13 + col, 'getInputColumnOfOutputPosition(1, ' + col + ')');
		}
		for (var col = 1; col <= 16; col++) {
			assert.equal(line1.getInputColumnOfOutputPosition(2, col), 13 + 14 + col, 'getInputColumnOfOutputPosition(2, ' + col + ')');
		}
		for (var col = 1; col <= 13; col++) {
			assert.deepEqual(line1.getOutputPositionOfInputPosition(0, col), pos(0, col), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (var col = 1 + 13; col <= 14 + 13; col++) {
			assert.deepEqual(line1.getOutputPositionOfInputPosition(0, col), pos(1, col - 13), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (var col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
			assert.deepEqual(line1.getOutputPositionOfInputPosition(0, col), pos(2, col - 13 - 14), 'getOutputPositionOfInputPosition(' + col + ')');
		}

		model1 = createModel('My First LineMy Second LineAnd another one');
		line1 = createSplitLine([13, 14, 15], '\t');

		assert.equal(line1.getOutputLineCount(), 3);
		assert.equal(line1.getOutputLineContent(model1, 1, 0), 'My First Line');
		assert.equal(line1.getOutputLineContent(model1, 1, 1), '\tMy Second Line');
		assert.equal(line1.getOutputLineContent(model1, 1, 2), '\tAnd another one');
		assert.equal(line1.getOutputLineMaxColumn(model1, 1, 0), 14);
		assert.equal(line1.getOutputLineMaxColumn(model1, 1, 1), 16);
		assert.equal(line1.getOutputLineMaxColumn(model1, 1, 2), 17);
		for (var col = 1; col <= 14; col++) {
			assert.equal(line1.getInputColumnOfOutputPosition(0, col), col, 'getInputColumnOfOutputPosition(0, ' + col + ')');
		}
		for (var col = 1; col <= 1; col++) {
			assert.equal(line1.getInputColumnOfOutputPosition(1, 1), 13 + col, 'getInputColumnOfOutputPosition(1, ' + col + ')');
		}
		for (var col = 2; col <= 16; col++) {
			assert.equal(line1.getInputColumnOfOutputPosition(1, col), 13 + col - 1, 'getInputColumnOfOutputPosition(1, ' + col + ')');
		}
		for (var col = 1; col <= 1; col++) {
			assert.equal(line1.getInputColumnOfOutputPosition(2, col), 13 + 14 + col, 'getInputColumnOfOutputPosition(2, ' + col + ')');
		}
		for (var col = 2; col <= 17; col++) {
			assert.equal(line1.getInputColumnOfOutputPosition(2, col), 13 + 14 + col - 1, 'getInputColumnOfOutputPosition(2, ' + col + ')');
		}
		for (var col = 1; col <= 13; col++) {
			assert.deepEqual(line1.getOutputPositionOfInputPosition(0, col), pos(0, col), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (var col = 1 + 13; col <= 14 + 13; col++) {
			assert.deepEqual(line1.getOutputPositionOfInputPosition(0, col), pos(1, 1 + col - 13), 'getOutputPositionOfInputPosition(' + col + ')');
		}
		for (var col = 1 + 13 + 14; col <= 15 + 14 + 13; col++) {
			assert.deepEqual(line1.getOutputPositionOfInputPosition(0, col), pos(2, 1 + col - 13 - 14), 'getOutputPositionOfInputPosition(' + col + ')');
		}
	});
});


function pos(lineNumber: number, column: number): Position {
	return new Position(lineNumber, column);
}

function createSplitLine(splitLengths:number[], wrappedLinesPrefix:string, isVisible: boolean = true): SplitLine {
	return new SplitLine(createLineMapping(splitLengths, wrappedLinesPrefix), isVisible);
}

function createLineMapping(breakingLengths:number[], wrappedLinesPrefix:string): ILineMapping {
	return new CharacterHardWrappingLineMapping(new PrefixSumComputer(breakingLengths), wrappedLinesPrefix);
}

function createModel(text:string): IModel {
	return {
		getLineTokens: (lineNumber:number, inaccurateTokensAcceptable?:boolean) => {
			return null;
		},
		getLineContent: (lineNumber:number) => {
			return text;
		},
		getLineMinColumn: (lineNumber:number) => {
			return 1;
		},
		getLineMaxColumn: (lineNumber:number) => {
			return text.length + 1;
		}
	};
}