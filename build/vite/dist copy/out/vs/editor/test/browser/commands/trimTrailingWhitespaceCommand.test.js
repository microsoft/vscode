/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TrimTrailingWhitespaceCommand, trimTrailingWhitespace } from '../../../common/commands/trimTrailingWhitespaceCommand.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import { EncodedTokenizationResult, TokenizationRegistry } from '../../../common/languages.js';
import { ILanguageService } from '../../../common/languages/language.js';
import { NullState } from '../../../common/languages/nullTokenize.js';
import { getEditOperation } from '../testCommand.js';
import { createModelServices, instantiateTextModel, withEditorModel } from '../../common/testTextModel.js';
/**
 * Create single edit operation
 */
function createInsertDeleteSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
    return {
        range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
        text: text
    };
}
/**
 * Create single edit operation
 */
function createSingleEditOp(text, positionLineNumber, positionColumn, selectionLineNumber = positionLineNumber, selectionColumn = positionColumn) {
    return {
        range: new Range(selectionLineNumber, selectionColumn, positionLineNumber, positionColumn),
        text: text,
        forceMoveMarkers: false
    };
}
function assertTrimTrailingWhitespaceCommand(text, expected) {
    return withEditorModel(text, (model) => {
        const op = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], true);
        const actual = getEditOperation(model, op);
        assert.deepStrictEqual(actual, expected);
    });
}
function assertTrimTrailingWhitespace(text, cursors, expected) {
    return withEditorModel(text, (model) => {
        const actual = trimTrailingWhitespace(model, cursors, true);
        assert.deepStrictEqual(actual, expected);
    });
}
suite('Editor Commands - Trim Trailing Whitespace Command', () => {
    let disposables;
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
        const otherMetadata = ((encodedLanguageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
            | (0 /* StandardTokenType.Other */ << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)
            | (1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */)) >>> 0;
        const stringMetadata = ((encodedLanguageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
            | (2 /* StandardTokenType.String */ << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */)
            | (1024 /* MetadataConsts.BALANCED_BRACKETS_MASK */)) >>> 0;
        const tokenizationSupport = {
            getInitialState: () => NullState,
            tokenize: undefined,
            tokenizeEncoded: (line, hasEOL, state) => {
                switch (line) {
                    case 'const a = `  ': {
                        const tokens = new Uint32Array([
                            0, otherMetadata,
                            10, stringMetadata,
                        ]);
                        return new EncodedTokenizationResult(tokens, [], state);
                    }
                    case '  a string  ': {
                        const tokens = new Uint32Array([
                            0, stringMetadata,
                        ]);
                        return new EncodedTokenizationResult(tokens, [], state);
                    }
                    case '`;  ': {
                        const tokens = new Uint32Array([
                            0, stringMetadata,
                            1, otherMetadata
                        ]);
                        return new EncodedTokenizationResult(tokens, [], state);
                    }
                }
                throw new Error(`Unexpected`);
            }
        };
        disposables.add(TokenizationRegistry.register(languageId, tokenizationSupport));
        const model = disposables.add(instantiateTextModel(instantiationService, [
            'const a = `  ',
            '  a string  ',
            '`;  ',
        ].join('\n'), languageId));
        model.tokenization.forceTokenization(1);
        model.tokenization.forceTokenization(2);
        model.tokenization.forceTokenization(3);
        const op = new TrimTrailingWhitespaceCommand(new Selection(1, 1, 1, 1), [], false);
        const actual = getEditOperation(model, op);
        assert.deepStrictEqual(actual, [createSingleEditOp(null, 3, 3, 3, 5)]);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci90ZXN0L2Jyb3dzZXIvY29tbWFuZHMvdHJpbVRyYWlsaW5nV2hpdGVzcGFjZUNvbW1hbmQudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFDNUIsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ2hHLE9BQU8sRUFBRSw2QkFBNkIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBRWxJLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUM1RCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEQsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBRTlELE9BQU8sRUFBRSx5QkFBeUIsRUFBd0Isb0JBQW9CLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNySCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6RSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDdEUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDckQsT0FBTyxFQUFFLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLGVBQWUsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBRTNHOztHQUVHO0FBQ0gsU0FBUyw4QkFBOEIsQ0FBQyxJQUFtQixFQUFFLGtCQUEwQixFQUFFLGNBQXNCLEVBQUUsc0JBQThCLGtCQUFrQixFQUFFLGtCQUEwQixjQUFjO0lB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