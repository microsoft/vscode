/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ISingleEditOperation } from '../../../common/core/editOperation.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { ColorId, FontStyle, MetadataConsts, TokenMetadata } from '../../../common/encodedTokenAttributes.js';
import { ILanguageConfigurationService, LanguageConfigurationService } from '../../../common/languages/languageConfigurationRegistry.js';
import { TextModel } from '../../../common/model/textModel.js';
import { LanguageIdCodec } from '../../../common/services/languagesRegistry.js';
import { LineTokens } from '../../../common/tokens/lineTokens.js';
import { SparseMultilineTokens } from '../../../common/tokens/sparseMultilineTokens.js';
import { SparseTokensStore } from '../../../common/tokens/sparseTokensStore.js';
import { createModelServices, createTextModel, instantiateTextModel } from '../testTextModel.js';

suite('TokensStore', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const SEMANTIC_COLOR = 5 as ColorId;

	function parseTokensState(state: string[]): { text: string; tokens: SparseMultilineTokens } {
		const text: string[] = [];
		const tokens: number[] = [];
		let baseLine = 1;
		for (let i = 0; i < state.length; i++) {
			const line = state[i];

			let startOffset = 0;
			let lineText = '';
			while (true) {
				const firstPipeOffset = line.indexOf('|', startOffset);
				if (firstPipeOffset === -1) {
					break;
				}
				const secondPipeOffset = line.indexOf('|', firstPipeOffset + 1);
				if (secondPipeOffset === -1) {
					break;
				}
				if (firstPipeOffset + 1 === secondPipeOffset) {
					// skip ||
					lineText += line.substring(startOffset, secondPipeOffset + 1);
					startOffset = secondPipeOffset + 1;
					continue;
				}

				lineText += line.substring(startOffset, firstPipeOffset);
				const tokenStartCharacter = lineText.length;
				const tokenLength = secondPipeOffset - firstPipeOffset - 1;
				const metadata = (
					SEMANTIC_COLOR << MetadataConsts.FOREGROUND_OFFSET
					| MetadataConsts.SEMANTIC_USE_FOREGROUND
				);

				if (tokens.length === 0) {
					baseLine = i + 1;
				}
				tokens.push(i + 1 - baseLine, tokenStartCharacter, tokenStartCharacter + tokenLength, metadata);

				lineText += line.substr(firstPipeOffset + 1, tokenLength);
				startOffset = secondPipeOffset + 1;
			}

			lineText += line.substring(startOffset);

			text.push(lineText);
		}

		return {
			text: text.join('\n'),
			tokens: SparseMultilineTokens.create(baseLine, new Uint32Array(tokens))
		};
	}

	function extractState(model: TextModel): string[] {
		const result: string[] = [];
		for (let lineNumber = 1; lineNumber <= model.getLineCount(); lineNumber++) {
			const lineTokens = model.tokenization.getLineTokens(lineNumber);
			const lineContent = model.getLineContent(lineNumber);

			let lineText = '';
			for (let i = 0; i < lineTokens.getCount(); i++) {
				const tokenStartCharacter = lineTokens.getStartOffset(i);
				const tokenEndCharacter = lineTokens.getEndOffset(i);
				const metadata = lineTokens.getMetadata(i);
				const color = TokenMetadata.getForeground(metadata);
				const tokenText = lineContent.substring(tokenStartCharacter, tokenEndCharacter);
				if (color === SEMANTIC_COLOR) {
					lineText += `|${tokenText}|`;
				} else {
					lineText += tokenText;
				}
			}

			result.push(lineText);
		}
		return result;
	}

	function testTokensAdjustment(rawInitialState: string[], edits: ISingleEditOperation[], rawFinalState: string[]) {
		const initialState = parseTokensState(rawInitialState);
		const model = createTextModel(initialState.text);
		model.tokenization.setSemanticTokens([initialState.tokens], true);

		model.applyEdits(edits);

		const actualState = extractState(model);
		assert.deepStrictEqual(actualState, rawFinalState);

		model.dispose();
	}

	test('issue #86303 - color shifting between different tokens', () => {
		testTokensAdjustment(
			[
				`import { |URI| } from 'vs/base/common/uri';`,
				`const foo = |URI|.parse('hey');`
			],
			[
				{ range: new Range(2, 9, 2, 10), text: '' }
			],
			[
				`import { |URI| } from 'vs/base/common/uri';`,
				`const fo = |URI|.parse('hey');`
			]
		);
	});

	test('deleting a newline', () => {
		testTokensAdjustment(
			[
				`import { |URI| } from 'vs/base/common/uri';`,
				`const foo = |URI|.parse('hey');`
			],
			[
				{ range: new Range(1, 42, 2, 1), text: '' }
			],
			[
				`import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
			]
		);
	});

	test('inserting a newline', () => {
		testTokensAdjustment(
			[
				`import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
			],
			[
				{ range: new Range(1, 42, 1, 42), text: '\n' }
			],
			[
				`import { |URI| } from 'vs/base/common/uri';`,
				`const foo = |URI|.parse('hey');`
			]
		);
	});

	test('deleting a newline 2', () => {
		testTokensAdjustment(
			[
				`import { `,
				`    |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
			],
			[
				{ range: new Range(1, 10, 2, 5), text: '' }
			],
			[
				`import { |URI| } from 'vs/base/common/uri';const foo = |URI|.parse('hey');`
			]
		);
	});

	test('issue #179268: a complex edit', () => {
		testTokensAdjustment(
			[
				`|export| |'interior_material_selector.dart'|;`,
				`|export| |'mileage_selector.dart'|;`,
				`|export| |'owners_selector.dart'|;`,
				`|export| |'price_selector.dart'|;`,
				`|export| |'seat_count_selector.dart'|;`,
				`|export| |'year_selector.dart'|;`,
				`|export| |'winter_options_selector.dart'|;|export| |'camera_selector.dart'|;`
			],
			[
				{ range: new Range(1, 9, 1, 9), text: `camera_selector.dart';\nexport '` },
				{ range: new Range(6, 9, 7, 9), text: `` },
				{ range: new Range(7, 39, 7, 39), text: `\n` },
				{ range: new Range(7, 47, 7, 48), text: `ye` },
				{ range: new Range(7, 49, 7, 51), text: `` },
				{ range: new Range(7, 52, 7, 53), text: `` },
			],
			[
				`|export| |'|camera_selector.dart';`,
				`export 'interior_material_selector.dart';`,
				`|export| |'mileage_selector.dart'|;`,
				`|export| |'owners_selector.dart'|;`,
				`|export| |'price_selector.dart'|;`,
				`|export| |'seat_count_selector.dart'|;`,
				`|export| |'||winter_options_selector.dart'|;`,
				`|export| |'year_selector.dart'|;`
			]
		);
	});

	test('issue #91936: Semantic token color highlighting fails on line with selected text', () => {
		const model = createTextModel('                    else if ($s = 08) then \'\\b\'');
		model.tokenization.setSemanticTokens([
			SparseMultilineTokens.create(1, new Uint32Array([
				0, 20, 24, 0b01111000000000010000,
				0, 25, 27, 0b01111000000000010000,
				0, 28, 29, 0b00001000000000010000,
				0, 29, 31, 0b10000000000000010000,
				0, 32, 33, 0b00001000000000010000,
				0, 34, 36, 0b00110000000000010000,
				0, 36, 37, 0b00001000000000010000,
				0, 38, 42, 0b01111000000000010000,
				0, 43, 47, 0b01011000000000010000,
			]))
		], true);
		const lineTokens = model.tokenization.getLineTokens(1);
		const decodedTokens: number[] = [];
		for (let i = 0, len = lineTokens.getCount(); i < len; i++) {
			decodedTokens.push(lineTokens.getEndOffset(i), lineTokens.getMetadata(i));
		}

		assert.deepStrictEqual(decodedTokens, [
			20, 0b10000000001000010000000001,
			24, 0b10000001111000010000000001,
			25, 0b10000000001000010000000001,
			27, 0b10000001111000010000000001,
			28, 0b10000000001000010000000001,
			29, 0b10000000001000010000000001,
			31, 0b10000010000000010000000001,
			32, 0b10000000001000010000000001,
			33, 0b10000000001000010000000001,
			34, 0b10000000001000010000000001,
			36, 0b10000000110000010000000001,
			37, 0b10000000001000010000000001,
			38, 0b10000000001000010000000001,
			42, 0b10000001111000010000000001,
			43, 0b10000000001000010000000001,
			47, 0b10000001011000010000000001
		]);

		model.dispose();
	});

	test('issue #147944: Language id "vs.editor.nullLanguage" is not configured nor known', () => {
		const disposables = new DisposableStore();
		const instantiationService = createModelServices(disposables, [
			[ILanguageConfigurationService, LanguageConfigurationService]
		]);
		const model = disposables.add(instantiateTextModel(instantiationService, '--[[\n\n]]'));
		model.tokenization.setSemanticTokens([
			SparseMultilineTokens.create(1, new Uint32Array([
				0, 2, 4, 0b100000000000010000,
				1, 0, 0, 0b100000000000010000,
				2, 0, 2, 0b100000000000010000,
			]))
		], true);
		assert.strictEqual(model.getWordAtPosition(new Position(2, 1)), null);
		disposables.dispose();
	});

	test('partial tokens 1', () => {
		const codec = new LanguageIdCodec();
		const store = new SparseTokensStore(codec);

		// setPartial: [1,1 -> 31,2], [(5,5-10),(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10)]
		store.setPartial(new Range(1, 1, 31, 2), [
			SparseMultilineTokens.create(5, new Uint32Array([
				0, 5, 10, 1,
				5, 5, 10, 2,
				10, 5, 10, 3,
				15, 5, 10, 4,
				20, 5, 10, 5,
				25, 5, 10, 6,
			]))
		]);

		// setPartial: [18,1 -> 42,1], [(20,5-10),(25,5-10),(30,5-10),(35,5-10),(40,5-10)]
		store.setPartial(new Range(18, 1, 42, 1), [
			SparseMultilineTokens.create(20, new Uint32Array([
				0, 5, 10, 4,
				5, 5, 10, 5,
				10, 5, 10, 6,
				15, 5, 10, 7,
				20, 5, 10, 8,
			]))
		]);

		// setPartial: [1,1 -> 31,2], [(5,5-10),(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10)]
		store.setPartial(new Range(1, 1, 31, 2), [
			SparseMultilineTokens.create(5, new Uint32Array([
				0, 5, 10, 1,
				5, 5, 10, 2,
				10, 5, 10, 3,
				15, 5, 10, 4,
				20, 5, 10, 5,
				25, 5, 10, 6,
			]))
		]);

		const lineTokens = store.addSparseTokens(10, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
		assert.strictEqual(lineTokens.getCount(), 3);
	});

	test('partial tokens 2', () => {
		const codec = new LanguageIdCodec();
		const store = new SparseTokensStore(codec);

		// setPartial: [1,1 -> 31,2], [(5,5-10),(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10)]
		store.setPartial(new Range(1, 1, 31, 2), [
			SparseMultilineTokens.create(5, new Uint32Array([
				0, 5, 10, 1,
				5, 5, 10, 2,
				10, 5, 10, 3,
				15, 5, 10, 4,
				20, 5, 10, 5,
				25, 5, 10, 6,
			]))
		]);

		// setPartial: [6,1 -> 36,2], [(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10),(35,5-10)]
		store.setPartial(new Range(6, 1, 36, 2), [
			SparseMultilineTokens.create(10, new Uint32Array([
				0, 5, 10, 2,
				5, 5, 10, 3,
				10, 5, 10, 4,
				15, 5, 10, 5,
				20, 5, 10, 6,
			]))
		]);

		// setPartial: [17,1 -> 42,1], [(20,5-10),(25,5-10),(30,5-10),(35,5-10),(40,5-10)]
		store.setPartial(new Range(17, 1, 42, 1), [
			SparseMultilineTokens.create(20, new Uint32Array([
				0, 5, 10, 4,
				5, 5, 10, 5,
				10, 5, 10, 6,
				15, 5, 10, 7,
				20, 5, 10, 8,
			]))
		]);

		const lineTokens = store.addSparseTokens(20, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
		assert.strictEqual(lineTokens.getCount(), 3);
	});

	test('partial tokens 3', () => {
		const codec = new LanguageIdCodec();
		const store = new SparseTokensStore(codec);

		// setPartial: [1,1 -> 31,2], [(5,5-10),(10,5-10),(15,5-10),(20,5-10),(25,5-10),(30,5-10)]
		store.setPartial(new Range(1, 1, 31, 2), [
			SparseMultilineTokens.create(5, new Uint32Array([
				0, 5, 10, 1,
				5, 5, 10, 2,
				10, 5, 10, 3,
				15, 5, 10, 4,
				20, 5, 10, 5,
				25, 5, 10, 6,
			]))
		]);

		// setPartial: [11,1 -> 16,2], [(15,5-10),(20,5-10)]
		store.setPartial(new Range(11, 1, 16, 2), [
			SparseMultilineTokens.create(10, new Uint32Array([
				0, 5, 10, 3,
				5, 5, 10, 4,
			]))
		]);

		const lineTokens = store.addSparseTokens(5, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
		assert.strictEqual(lineTokens.getCount(), 3);
	});

	test('issue #94133: Semantic colors stick around when using (only) range provider', () => {
		const codec = new LanguageIdCodec();
		const store = new SparseTokensStore(codec);

		// setPartial: [1,1 -> 1,20] [(1,9-11)]
		store.setPartial(new Range(1, 1, 1, 20), [
			SparseMultilineTokens.create(1, new Uint32Array([
				0, 9, 11, 1,
			]))
		]);

		// setPartial: [1,1 -> 1,20], []
		store.setPartial(new Range(1, 1, 1, 20), []);

		const lineTokens = store.addSparseTokens(1, new LineTokens(new Uint32Array([12, 1]), `enum Enum1 {`, codec));
		assert.strictEqual(lineTokens.getCount(), 1);
	});

	test('bug', () => {
		function createTokens(str: string): SparseMultilineTokens {
			str = str.replace(/^\[\(/, '');
			str = str.replace(/\)\]$/, '');
			const strTokens = str.split('),(');
			const result: number[] = [];
			let firstLineNumber = 0;
			for (const strToken of strTokens) {
				const pieces = strToken.split(',');
				const chars = pieces[1].split('-');
				const lineNumber = parseInt(pieces[0], 10);
				const startChar = parseInt(chars[0], 10);
				const endChar = parseInt(chars[1], 10);
				if (firstLineNumber === 0) {
					// this is the first line
					firstLineNumber = lineNumber;
				}
				result.push(lineNumber - firstLineNumber, startChar, endChar, (lineNumber + startChar) % 13);
			}
			return SparseMultilineTokens.create(firstLineNumber, new Uint32Array(result));
		}

		const codec = new LanguageIdCodec();
		const store = new SparseTokensStore(codec);
		// setPartial [36446,1 -> 36475,115] [(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62)]
		store.setPartial(
			new Range(36446, 1, 36475, 115),
			[createTokens('[(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62)]')]
		);
		// setPartial [36436,1 -> 36464,142] [(36437,33-37),(36437,38-42),(36437,47-57),(36437,58-67),(36438,35-53),(36438,54-62),(36440,24-29),(36440,33-46),(36440,47-53),(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62)]
		store.setPartial(
			new Range(36436, 1, 36464, 142),
			[createTokens('[(36437,33-37),(36437,38-42),(36437,47-57),(36437,58-67),(36438,35-53),(36438,54-62),(36440,24-29),(36440,33-46),(36440,47-53),(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62)]')]
		);
		// setPartial [36457,1 -> 36485,140] [(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62),(36477,28-32),(36477,33-37),(36477,42-52),(36477,53-69),(36478,32-36),(36478,37-41),(36478,46-56),(36478,57-74),(36479,32-36),(36479,37-41),(36479,46-56),(36479,57-76),(36480,32-36),(36480,37-41),(36480,46-56),(36480,57-68),(36481,32-36),(36481,37-41),(36481,46-56),(36481,57-68),(36482,39-57),(36482,58-66),(36484,34-38),(36484,39-45),(36484,46-50),(36484,55-65),(36484,66-82),(36484,86-97),(36484,98-102),(36484,103-109),(36484,111-124),(36484,125-133),(36485,39-57),(36485,58-66)]
		store.setPartial(
			new Range(36457, 1, 36485, 140),
			[createTokens('[(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35),(36470,38-46),(36473,25-35),(36473,36-51),(36474,28-33),(36474,36-49),(36474,50-58),(36475,35-53),(36475,54-62),(36477,28-32),(36477,33-37),(36477,42-52),(36477,53-69),(36478,32-36),(36478,37-41),(36478,46-56),(36478,57-74),(36479,32-36),(36479,37-41),(36479,46-56),(36479,57-76),(36480,32-36),(36480,37-41),(36480,46-56),(36480,57-68),(36481,32-36),(36481,37-41),(36481,46-56),(36481,57-68),(36482,39-57),(36482,58-66),(36484,34-38),(36484,39-45),(36484,46-50),(36484,55-65),(36484,66-82),(36484,86-97),(36484,98-102),(36484,103-109),(36484,111-124),(36484,125-133),(36485,39-57),(36485,58-66)]')]
		);
		// setPartial [36441,1 -> 36469,56] [(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35)]
		store.setPartial(
			new Range(36441, 1, 36469, 56),
			[createTokens('[(36442,25-35),(36442,36-50),(36443,30-39),(36443,42-46),(36443,47-53),(36443,54-58),(36443,63-73),(36443,74-84),(36443,87-91),(36443,92-98),(36443,101-105),(36443,106-112),(36443,113-119),(36444,28-37),(36444,38-42),(36444,47-57),(36444,58-75),(36444,80-95),(36444,96-105),(36445,35-53),(36445,54-62),(36448,24-29),(36448,33-46),(36448,47-54),(36450,25-35),(36450,36-50),(36451,28-33),(36451,36-49),(36451,50-57),(36452,35-53),(36452,54-62),(36454,33-38),(36454,41-54),(36454,55-60),(36455,35-53),(36455,54-62),(36457,33-44),(36457,45-49),(36457,50-56),(36457,62-83),(36457,84-88),(36458,35-53),(36458,54-62),(36460,33-37),(36460,38-42),(36460,47-57),(36460,58-67),(36461,35-53),(36461,54-62),(36463,34-38),(36463,39-45),(36463,46-51),(36463,54-63),(36463,64-71),(36463,76-80),(36463,81-87),(36463,88-92),(36463,97-107),(36463,108-119),(36464,35-53),(36464,54-62),(36466,33-71),(36466,72-76),(36467,35-53),(36467,54-62),(36469,24-29),(36469,33-46),(36469,47-54),(36470,24-35)]')]
		);

		const lineTokens = store.addSparseTokens(36451, new LineTokens(new Uint32Array([60, 1]), `                        if (flags & ModifierFlags.Ambient) {`, codec));
		assert.strictEqual(lineTokens.getCount(), 7);
	});


	test('issue #95949: Identifiers are colored in bold when targetting keywords', () => {

		function createTMMetadata(foreground: number, fontStyle: number, languageId: number): number {
			return (
				(languageId << MetadataConsts.LANGUAGEID_OFFSET)
				| (fontStyle << MetadataConsts.FONT_STYLE_OFFSET)
				| (foreground << MetadataConsts.FOREGROUND_OFFSET)
			) >>> 0;
		}

		function toArr(lineTokens: LineTokens): number[] {
			const r: number[] = [];
			for (let i = 0; i < lineTokens.getCount(); i++) {
				r.push(lineTokens.getEndOffset(i));
				r.push(lineTokens.getMetadata(i));
			}
			return r;
		}

		const codec = new LanguageIdCodec();
		const store = new SparseTokensStore(codec);

		store.set([
			SparseMultilineTokens.create(1, new Uint32Array([
				0, 6, 11, (1 << MetadataConsts.FOREGROUND_OFFSET) | MetadataConsts.SEMANTIC_USE_FOREGROUND,
			]))
		], true);

		const lineTokens = store.addSparseTokens(1, new LineTokens(new Uint32Array([
			5, createTMMetadata(5, FontStyle.Bold, 53),
			14, createTMMetadata(1, FontStyle.None, 53),
			17, createTMMetadata(6, FontStyle.None, 53),
			18, createTMMetadata(1, FontStyle.None, 53),
		]), `const hello = 123;`, codec));

		const actual = toArr(lineTokens);
		assert.deepStrictEqual(actual, [
			5, createTMMetadata(5, FontStyle.Bold, 53),
			6, createTMMetadata(1, FontStyle.None, 53),
			11, createTMMetadata(1, FontStyle.None, 53),
			14, createTMMetadata(1, FontStyle.None, 53),
			17, createTMMetadata(6, FontStyle.None, 53),
			18, createTMMetadata(1, FontStyle.None, 53)
		]);
	});


	test('BUG: setPartial with startLineNumber > 1 and token removal creates invalid state', () => {
		/**
		 * The bug is the same regardless of the starting line number.
		 * If a piece starts at line 5 and all tokens are removed via setPartial:
		 * - startLineNumber stays at 5
		 * - endLineNumber becomes 5 + (-1) = 4
		 */
		const codec = new LanguageIdCodec();
		const store = new SparseTokensStore(codec);

		// Set initial tokens on line 5
		store.set([
			SparseMultilineTokens.create(5, new Uint32Array([
				0, 5, 10, 1,  // line 5, chars 5-10
			]))
		], false);

		assert.strictEqual(store.isEmpty(), false);

		// Remove all tokens via setPartial
		store.setPartial(new Range(5, 1, 5, 20), []);

		// BUG: During processing, pieces can have invalid line numbers
		// The store should remove empty pieces and remain valid
		assert.strictEqual(store.isEmpty(), true,
			'Store should be empty after setPartial removes all tokens');
	});

	test('BUG: setPartial with split that creates empty first piece with invalid line numbers', () => {
		const codec = new LanguageIdCodec();
		const store = new SparseTokensStore(codec);

		// Set initial tokens - token is on line 11
		store.set([
			SparseMultilineTokens.create(1, new Uint32Array([
				10, 5, 10, 1,  // line 11 (deltaLine=10 from startLineNumber=1), chars 5-10
			]))
		], false);

		// setPartial with a range [1,1 -> 5,1] that will cause a split where the first piece is empty
		store.setPartial(new Range(1, 1, 5, 1), []);

		assert.strictEqual(store.isEmpty(), false, 'Store should still have the token on line 11');

		// The token at line 11 should be retrievable after the split
		const lineTokens = store.addSparseTokens(11, new LineTokens(new Uint32Array([22, 1]), `    test line text    `, codec));
		assert.strictEqual(lineTokens.getCount(), 3, 'Should have 3 tokens: base token start + semantic token from line 11 + base token end');
		assert.strictEqual(lineTokens.getStartOffset(1), 5, 'Semantic token should start at offset 5');
		assert.strictEqual(lineTokens.getEndOffset(1), 10, 'Semantic token should end at offset 10');
	});

	test('piece with startLineNumber 0 and endLineNumber -1 after encompassing deletion', () => {
		const codec = new LanguageIdCodec();
		const store = new SparseTokensStore(codec);

		// Set initial tokens on lines 5-10
		const piece = SparseMultilineTokens.create(5, new Uint32Array([
			0, 0, 5, 1,  // line 5, chars 0-5
			5, 0, 5, 2,  // line 10, chars 0-5
		]));

		store.set([piece], false);

		// Verify initial state
		assert.strictEqual(piece.startLineNumber, 5);
		assert.strictEqual(piece.endLineNumber, 10);
		assert.strictEqual(piece.isEmpty(), false);

		// Perform an edit that completely encompasses the token range
		// Delete from line 1 to line 20 (encompasses lines 5-10)
		// This triggers the case in _acceptDeleteRange where:
		// if (firstLineIndex < 0 && lastLineIndex >= tokenMaxDeltaLine + 1)
		// Which sets this._startLineNumber = 0 and calls this._tokens.clear()
		store.acceptEdit(
			{ startLineNumber: 1, startColumn: 1, endLineNumber: 20, endColumn: 1 },
			0, // eolCount - no new lines inserted
			0, // firstLineLength
			0, // lastLineLength
			0  // firstCharCode
		);

		// After an encompassing deletion, the piece should be empty
		assert.strictEqual(piece.isEmpty(), true, 'Piece should be empty after encompassing deletion');

		// EXPECTED BEHAVIOR: The store should be empty (no pieces with invalid line numbers)
		// Currently fails because the piece remains with startLineNumber=0, endLineNumber=-1
		assert.strictEqual(store.isEmpty(), true, 'Store should be empty after all tokens are deleted by encompassing edit');
	});
});

