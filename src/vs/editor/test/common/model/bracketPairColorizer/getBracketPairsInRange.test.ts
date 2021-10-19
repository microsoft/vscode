/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert = require('assert');
import { Disposable, disposeOnReturn } from 'vs/base/common/lifecycle';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { BracketPairInfo } from 'vs/editor/common/model/bracketPairs/bracketPairs';
import { LanguageConfiguration } from 'vs/editor/common/modes/languageConfiguration';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { createTextModel } from 'vs/editor/test/common/editorTestUtils';

suite('Bracket Pair Colorizer - getBracketPairsInRange', () => {
	function createLang() {
		return MockLanguage.create({
			configuration: {
				colorizedBracketPairs: [
					['{', '}'],
					['[', ']'],
					['(', ')'],
				]
			},
		});
	}

	test('Basic 1', () => {
		disposeOnReturn(store => {
			const doc = new AnnotatedDocument(`{ ( [] ¹ ) [ ² { } ] () } []`);
			const model = store.add(
				createTextModel(doc.text, {}, store.add(createLang()).id)
			);
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
			const model = store.add(
				createTextModel(doc.text, {}, store.add(createLang()).id)
			);
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
			const model = store.add(
				createTextModel(doc.text, {}, store.add(createLang()).id)
			);
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
			const model = store.add(
				createTextModel(doc.text, {}, store.add(createLang()).id)
			);
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
		let offsetPositions = new Map<number, number>();

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
		let positions = new Map<number, Position>();
		for (const [idx, offset] of offsetPositions.entries()) {
			positions.set(idx, mapper.getPosition(offset));
		}
		this.positions = positions;
	}

	range(start: number, end: number): Range {
		return Range.fromPositions(this.positions.get(start)!, this.positions.get(end)!);
	}
}

interface MockLanguageOptions {
	configuration?: LanguageConfiguration
}

class MockLanguage extends Disposable {
	private static id = 0;

	public static create(options: MockLanguageOptions) {
		const id = `lang${this.id++}`;

		return new MockLanguage(id, options);
	}

	constructor(
		public readonly id: string,
		options: MockLanguageOptions
	) {
		super();

		if (options.configuration) {
			this._register(LanguageConfigurationRegistry.register(id, options.configuration));
		}
	}
}
