/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { TrimTrailingWhitespaceCommand, trimTrailingWhitespace } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { ISingleEditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { MetadataConsts, StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { EncodedTokenizationResult, ITokenizationSupport, TokenizationRegistry } from 'vs/editor/common/languages';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { NullState } from 'vs/editor/common/languages/nullTokenize';
import { getEditOperation } from 'vs/editor/test/browser/testCommand';
import { createModelServices, instantiateTextModel, withEditorModel } from 'vs/editor/test/common/testTextModel';

/**
 * Create single edit operation
 */
function createInsertDeleteSingleEditOp(text: string | null, positionLineNumber: number, positionColumn: number, selectionLineNumber: number = positionLineNumber, selectionColumn: number = positionColumn): ISingleEditOperation {
	return {
		range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
		text: text
	};
}

/**
 * Create single edit operation
 */
function createSingleEditOp(text: string | null, positionLineNumber: number, positionColumn: number, selectionLineNumber: number = positionLineNumber, selectionColumn: number = positionColumn): ISingleEditOperation {
	return {
		range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
		text: text,
		forceMoveMarkers: false
	};
}

function assertTrimTrailingWhitespaceCommand(text: string[], expected: ISingleEditOperation[]): void {
	return withEditorModel(text, (model) => {
		const op = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], true);
		const actual = getEditOperation(model, op);
		assert.deepStrictEqual(actual, expected);
	});
}

function assertTrimTrailingWhitespace(text: string[], cursors: Position[], expected: ISingleEditOperation[]): void {
	return withEditorModel(text, (model) => {
		const actual = trimTrailingWhitespace(model, cursors, true);
		assert.deepStrictEqual(actual, expected);
	});
}

suite('Editor Commands - Trim Trailing Whitespace Command', () => {

	let disposables: DisposableStore;

	setup(() => {
		disposables = new DisposableStore();
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('remove trailing whitespace', function () {
		assertTrimTrailingWhitespaceCommand([''], []);
		assertTrimTrailingWhitespaceCommand(['text'], []);
		assertTrimTrailingWhitespaceCommand(['text   '], [createSingleEditOp(null, 1, 5, 1, 8)]);
		assertTrimTrailingWhitespaceCommand(['text\t   '], [createSingleEditOp(null, 1, 5, 1, 9)]);
		assertTrimTrailingWhitespaceCommand(['\t   '], [createSingleEditOp(null, 1, 1, 1, 5)]);
		assertTrimTrailingWhitespaceCommand(['text\t'], [createSingleEditOp(null, 1, 5, 1, 6)]);
		assertTrimTrailingWhitespaceCommand([
			'some text\t',
			'some more text',
			'\t  ',
			'even more text  ',
			'and some mixed\t   \t'
		], [
			createSingleEditOp(null, 1, 10, 1, 11),
			createSingleEditOp(null, 3, 1, 3, 4),
			createSingleEditOp(null, 4, 15, 4, 17),
			createSingleEditOp(null, 5, 15, 5, 20)
		]);


		assertTrimTrailingWhitespace(['text   '], [new Position(1, 1), new Position(1, 2), new Position(1, 3)], [createInsertDeleteSingleEditOp(null, 1, 5, 1, 8)]);
		assertTrimTrailingWhitespace(['text   '], [new Position(1, 1), new Position(1, 5)], [createInsertDeleteSingleEditOp(null, 1, 5, 1, 8)]);
		assertTrimTrailingWhitespace(['text   '], [new Position(1, 1), new Position(1, 5), new Position(1, 6)], [createInsertDeleteSingleEditOp(null, 1, 6, 1, 8)]);
		assertTrimTrailingWhitespace([
			'some text\t',
			'some more text',
			'\t  ',
			'even more text  ',
			'and some mixed\t   \t'
		], [], [
			createInsertDeleteSingleEditOp(null, 1, 10, 1, 11),
			createInsertDeleteSingleEditOp(null, 3, 1, 3, 4),
			createInsertDeleteSingleEditOp(null, 4, 15, 4, 17),
			createInsertDeleteSingleEditOp(null, 5, 15, 5, 20)
		]);
		assertTrimTrailingWhitespace([
			'some text\t',
			'some more text',
			'\t  ',
			'even more text  ',
			'and some mixed\t   \t'
		], [new Position(1, 11), new Position(3, 2), new Position(5, 1), new Position(4, 1), new Position(5, 10)], [
			createInsertDeleteSingleEditOp(null, 3, 2, 3, 4),
			createInsertDeleteSingleEditOp(null, 4, 15, 4, 17),
			createInsertDeleteSingleEditOp(null, 5, 15, 5, 20)
		]);
	});

	test('skips strings and regex if configured', function () {
		const instantiationService = createModelServices(disposables);
		const languageService = instantiationService.get(ILanguageService);
		const languageId = 'testLanguageId';
		const languageIdCodec = languageService.languageIdCodec;
		disposables.add(languageService.registerLanguage({ id: languageId }));
		const encodedLanguageId = languageIdCodec.encodeLanguageId(languageId);

		const otherMetadata = (
			(encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
			| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
			| (MetadataConsts.BALANCED_BRACKETS_MASK)
		) >>> 0;
		const stringMetadata = (
			(encodedLanguageId << MetadataConsts.LANGUAGEID_OFFSET)
			| (StandardTokenType.String << MetadataConsts.TOKEN_TYPE_OFFSET)
			| (MetadataConsts.BALANCED_BRACKETS_MASK)
		) >>> 0;

		const tokenizationSupport: ITokenizationSupport = {
			getInitialState: () => NullState,
			tokenize: undefined!,
			tokenizeEncoded: (line, hasEOL, state) => {
				switch (line) {
					case 'const a = `  ': {
						const tokens = new Uint32Array([
							0, otherMetadata,
							10, stringMetadata,
						]);
						return new EncodedTokenizationResult(tokens, state);
					}
					case '  a string  ': {
						const tokens = new Uint32Array([
							0, stringMetadata,
						]);
						return new EncodedTokenizationResult(tokens, state);
					}
					case '`;  ': {
						const tokens = new Uint32Array([
							0, stringMetadata,
							1, otherMetadata
						]);
						return new EncodedTokenizationResult(tokens, state);
					}
				}
				throw new Error(`Unexpected`);
			}
		};

		disposables.add(TokenizationRegistry.register(languageId, tokenizationSupport));

		const model = disposables.add(instantiateTextModel(
			instantiationService,
			[
				'const a = `  ',
				'  a string  ',
				'`;  ',
			].join('\n'),
			languageId
		));

		model.tokenization.forceTokenization(1);
		model.tokenization.forceTokenization(2);
		model.tokenization.forceTokenization(3);

		const op = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], false);
		const actual = getEditOperation(model, op);
		assert.deepStrictEqual(actual, [createSingleEditOp(null, 3, 3, 3, 5)]);
	});
});
