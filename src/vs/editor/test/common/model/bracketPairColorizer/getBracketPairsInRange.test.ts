/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { DisposableStore, disposeOnReturn } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { BracketPairInfo } from 'vs/editor/common/textModelBracketPairs';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { createModelServices, instantiateTextModel } from 'vs/editor/test/common/testTextModel';
import { TextModel } from 'vs/editor/common/model/textModel';

suite('Bracket Pair Colorizer - getBracketPairsInRange', () => {

	function createTextModelWithColorizedBracketPairs(store: DisposableStore, text: string): TextModel {
		const languageId = 'testLanguage';
		const instantiationService = createModelServices(store);
		const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);

		store.add(languageConfigurationService.register(languageId, {
			colorizedBracketPairs: [
				['{', '}'],
				['[', ']'],
				['(', ')'],
			]
		}));
		return store.add(instantiateTextModel(instantiationService, text, languageId));
	}

	test('Basic 1', () => {
		disposeOnReturn(store => {
			const doc = new AnnotatedDocument(`{ ( [] ¹ ) [ ² { } ] () } []`);
			const model = createTextModelWithColorizedBracketPairs(store, doc.text);
			assert.deepStrictEqual(
				model.bracketPairs
					.getBracketPairsInRange(doc.range(1, 2))
					.map(bracketPairToJSON),
				[
					{
						level: 0,
						range: '[1,1 -> 1,2]',
						openRange: '[1,1 -> 1,2]',
						closeRange: '[1,23 -> 1,24]',
					},
					{
						level: 1,
						range: '[1,3 -> 1,4]',
						openRange: '[1,3 -> 1,4]',
						closeRange: '[1,9 -> 1,10]',
					},
					{
						level: 1,
						range: '[1,11 -> 1,12]',
						openRange: '[1,11 -> 1,12]',
						closeRange: '[1,18 -> 1,19]',
					},
				]
			);
		});
	});

	test('Basic 2', () => {
		disposeOnReturn(store => {
			const doc = new AnnotatedDocument(`{ ( [] ¹ ²) [  { } ] () } []`);
			const model = createTextModelWithColorizedBracketPairs(store, doc.text);
			assert.deepStrictEqual(
				model.bracketPairs
					.getBracketPairsInRange(doc.range(1, 2))
					.map(bracketPairToJSON),
				[
					{
						level: 0,
						range: '[1,1 -> 1,2]',
						openRange: '[1,1 -> 1,2]',
						closeRange: '[1,23 -> 1,24]',
					},
					{
						level: 1,
						range: '[1,3 -> 1,4]',
						openRange: '[1,3 -> 1,4]',
						closeRange: '[1,9 -> 1,10]',
					},
				]
			);
		});
	});

	test('Basic Empty', () => {
		disposeOnReturn(store => {
			const doc = new AnnotatedDocument(`¹ ² { ( [] ) [  { } ] () } []`);
			const model = createTextModelWithColorizedBracketPairs(store, doc.text);
			assert.deepStrictEqual(
				model.bracketPairs
					.getBracketPairsInRange(doc.range(1, 2))
					.map(bracketPairToJSON),
				[]
			);
		});
	});

	test('Basic All', () => {
		disposeOnReturn(store => {
			const doc = new AnnotatedDocument(`¹ { ( [] ) [  { } ] () } [] ²`);
			const model = createTextModelWithColorizedBracketPairs(store, doc.text);
			assert.deepStrictEqual(
				model.bracketPairs
					.getBracketPairsInRange(doc.range(1, 2))
					.map(bracketPairToJSON),
				[
					{
						level: 0,
						range: '[1,2 -> 1,3]',
						openRange: '[1,2 -> 1,3]',
						closeRange: '[1,23 -> 1,24]',
					},
					{
						level: 1,
						range: '[1,4 -> 1,5]',
						openRange: '[1,4 -> 1,5]',
						closeRange: '[1,9 -> 1,10]',
					},
					{
						level: 2,
						range: '[1,6 -> 1,7]',
						openRange: '[1,6 -> 1,7]',
						closeRange: '[1,7 -> 1,8]',
					},
					{
						level: 1,
						range: '[1,11 -> 1,12]',
						openRange: '[1,11 -> 1,12]',
						closeRange: '[1,18 -> 1,19]',
					},
					{
						level: 2,
						range: '[1,14 -> 1,15]',
						openRange: '[1,14 -> 1,15]',
						closeRange: '[1,16 -> 1,17]',
					},
					{
						level: 1,
						range: '[1,20 -> 1,21]',
						openRange: '[1,20 -> 1,21]',
						closeRange: '[1,21 -> 1,22]',
					},
					{
						level: 0,
						range: '[1,25 -> 1,26]',
						openRange: '[1,25 -> 1,26]',
						closeRange: '[1,26 -> 1,27]',
					},
				]
			);
		});
	});
});

function bracketPairToJSON(pair: BracketPairInfo): unknown {
	return {
		level: pair.nestingLevel,
		range: pair.openingBracketRange.toString(),
		openRange: pair.openingBracketRange.toString(),
		closeRange: pair.closingBracketRange?.toString() || null,
	};
}

class PositionOffsetTransformer {
	private readonly lineStartOffsetByLineIdx: number[];

	constructor(text: string) {
		this.lineStartOffsetByLineIdx = [];
		this.lineStartOffsetByLineIdx.push(0);
		for (let i = 0; i < text.length; i++) {
			if (text.charAt(i) === '\n') {
				this.lineStartOffsetByLineIdx.push(i + 1);
			}
		}
	}

	getOffset(position: Position): number {
		return this.lineStartOffsetByLineIdx[position.lineNumber - 1] + position.column - 1;
	}

	getPosition(offset: number): Position {
		const lineNumber = this.lineStartOffsetByLineIdx.findIndex(lineStartOffset => lineStartOffset <= offset);
		return new Position(lineNumber + 1, offset - this.lineStartOffsetByLineIdx[lineNumber] + 1);
	}
}

class AnnotatedDocument {
	public readonly text: string;
	private readonly positions: ReadonlyMap<number, Position>;

	constructor(src: string) {
		const numbers = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

		let text = '';
		const offsetPositions = new Map<number, number>();

		let offset = 0;
		for (let i = 0; i < src.length; i++) {
			const idx = numbers.indexOf(src[i]);
			if (idx >= 0) {
				offsetPositions.set(idx, offset);
			} else {
				text += src[i];
				offset++;
			}
		}

		this.text = text;

		const mapper = new PositionOffsetTransformer(this.text);
		const positions = new Map<number, Position>();
		for (const [idx, offset] of offsetPositions.entries()) {
			positions.set(idx, mapper.getPosition(offset));
		}
		this.positions = positions;
	}

	range(start: number, end: number): Range {
		return Range.fromPositions(this.positions.get(start)!, this.positions.get(end)!);
	}
}
