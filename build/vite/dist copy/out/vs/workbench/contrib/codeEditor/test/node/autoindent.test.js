/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import { extname, join } from '../../../../../base/common/path.js';
import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageConfigurationService } from '../../../../../editor/common/languages/languageConfigurationRegistry.js';
import { getReindentEditOperations } from '../../../../../editor/contrib/indentation/common/indentation.js';
import { createModelServices, instantiateTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { LanguageConfigurationFileHandler } from '../../common/languageConfigurationExtensionPoint.js';
import { parse } from '../../../../../base/common/json.js';
import { trimTrailingWhitespace } from '../../../../../editor/common/commands/trimTrailingWhitespaceCommand.js';
import { execSync } from 'child_process';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { EncodedTokenizationResult, TokenizationRegistry } from '../../../../../editor/common/languages.js';
import { NullState } from '../../../../../editor/common/languages/nullTokenize.js';
import { FileAccess } from '../../../../../base/common/network.js';
function getIRange(range) {
    return {
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.endLineNumber,
        endColumn: range.endColumn
    };
}
var LanguageId;
(function (LanguageId) {
    LanguageId["TypeScript"] = "ts-test";
})(LanguageId || (LanguageId = {}));
function forceTokenizationFromLineToLine(model, startLine, endLine) {
    for (let line = startLine; line <= endLine; line++) {
        model.tokenization.forceTokenization(line);
    }
}
function registerLanguage(instantiationService, languageId) {
    const disposables = new DisposableStore();
    const languageService = instantiationService.get(ILanguageService);
    disposables.add(registerLanguageConfiguration(instantiationService, languageId));
    disposables.add(languageService.registerLanguage({ id: languageId }));
    return disposables;
}
function registerLanguageConfiguration(instantiationService, languageId) {
    const languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
    let configPath;
    switch (languageId) {
        case "ts-test" /* LanguageId.TypeScript */:
            configPath = FileAccess.asFileUri('vs/workbench/contrib/codeEditor/test/node/language-configuration.json').fsPath;
            break;
        default:
            throw new Error('Unknown languageId');
    }
    const configContent = fs.readFileSync(configPath, { encoding: 'utf-8' });
    const parsedConfig = parse(configContent, []);
    const languageConfig = LanguageConfigurationFileHandler.extractValidConfig(languageId, parsedConfig);
    return languageConfigurationService.register(languageId, languageConfig);
}
function registerTokenizationSupport(instantiationService, tokens, languageId) {
    let lineIndex = 0;
    const languageService = instantiationService.get(ILanguageService);
    const tokenizationSupport = {
        getInitialState: () => NullState,
        tokenize: undefined,
        tokenizeEncoded: (line, hasEOL, state) => {
            const tokensOnLine = tokens[lineIndex++];
            const encodedLanguageId = languageService.languageIdCodec.encodeLanguageId(languageId);
            const result = new Uint32Array(2 * tokensOnLine.length);
            for (let i = 0; i < tokensOnLine.length; i++) {
                result[2 * i] = tokensOnLine[i].startIndex;
                result[2 * i + 1] =
                    ((encodedLanguageId << 0 /* MetadataConsts.LANGUAGEID_OFFSET */)
                        | (tokensOnLine[i].standardTokenType << 8 /* MetadataConsts.TOKEN_TYPE_OFFSET */));
            }
            return new EncodedTokenizationResult(result, [], state);
        }
    };
    return TokenizationRegistry.register(languageId, tokenizationSupport);
}
suite('Auto-Reindentation - TypeScript/JavaScript', () => {
    const languageId = "ts-test" /* LanguageId.TypeScript */;
    const options = {};
    let disposables;
    let instantiationService;
    let languageConfigurationService;
    setup(() => {
        disposables = new DisposableStore();
        instantiationService = createModelServices(disposables);
        languageConfigurationService = instantiationService.get(ILanguageConfigurationService);
        disposables.add(instantiationService);
        disposables.add(registerLanguage(instantiationService, languageId));
        disposables.add(registerLanguageConfiguration(instantiationService, languageId));
    });
    teardown(() => {
        disposables.dispose();
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    // Test which can be ran to find cases of incorrect indentation...
    test.skip('Find Cases of Incorrect Indentation with the Reindent Lines Command', () => {
        // ./scripts/test.sh --inspect --grep='Find Cases of Incorrect Indentation with the Reindent Lines Command' --timeout=15000
        function walkDirectoryAndReindent(directory, languageId) {
            const files = fs.readdirSync(directory, { withFileTypes: true });
            const directoriesToRecurseOn = [];
            for (const file of files) {
                if (file.isDirectory()) {
                    directoriesToRecurseOn.push(join(directory, file.name));
                }
                else {
                    const filePathName = join(directory, file.name);
                    const fileExtension = extname(filePathName);
                    if (fileExtension !== '.ts') {
                        continue;
                    }
                    const fileContents = fs.readFileSync(filePathName, { encoding: 'utf-8' });
                    const modelOptions = {
                        tabSize: 4,
                        insertSpaces: false
                    };
                    const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, modelOptions));
                    const lineCount = model.getLineCount();
                    const editOperations = [];
                    for (let line = 1; line <= lineCount - 1; line++) {
                        /*
                        NOTE: Uncomment in order to ignore incorrect JS DOC indentation
                        const lineContent = model.getLineContent(line);
                        const trimmedLineContent = lineContent.trim();
                        if (trimmedLineContent.length === 0 || trimmedLineContent.startsWith('*') || trimmedLineContent.startsWith('/*')) {
                            continue;
                        }
                        */
                        const lineContent = model.getLineContent(line);
                        const trimmedLineContent = lineContent.trim();
                        if (trimmedLineContent.length === 0) {
                            continue;
                        }
                        const editOperation = getReindentEditOperations(model, languageConfigurationService, line, line + 1);
                        /*
                        NOTE: Uncomment in order to see actual incorrect indentation diff
                        model.applyEdits(editOperation);
                        */
                        editOperations.push(...editOperation);
                    }
                    model.applyEdits(editOperations);
                    model.applyEdits(trimTrailingWhitespace(model, [], true));
                    fs.writeFileSync(filePathName, model.getValue());
                }
            }
            for (const directory of directoriesToRecurseOn) {
                walkDirectoryAndReindent(directory, languageId);
            }
        }
        walkDirectoryAndReindent('/Users/aiday/Desktop/Test/vscode-test', 'ts-test');
        const output = execSync('cd /Users/aiday/Desktop/Test/vscode-test && git diff --shortstat', { encoding: 'utf-8' });
        console.log('\ngit diff --shortstat:\n', output);
    });
    // Unit tests for increase and decrease indent patterns...
    /**
     * First increase indent and decrease indent patterns:
     *
     * - decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/
     *  - In (https://macromates.com/manual/en/appendix)
     * 	  Either we have white space before the closing bracket, or we have a multi line comment ending on that line followed by whitespaces
     *    This is followed by any character.
     *    Textmate decrease indent pattern is as follows: /^(.*\*\/)?\s*\}[;\s]*$/
     *    Presumably allowing multi line comments ending on that line implies that } is itself not part of a multi line comment
     *
     * - increaseIndentPattern: /^.*\{[^}"']*$/
     *  - In (https://macromates.com/manual/en/appendix)
     *    This regex means that we increase the indent when we have any characters followed by the opening brace, followed by characters
     *    except for closing brace }, double quotes " or single quote '.
     *    The } is checked in order to avoid the indentation in the following case `int arr[] = { 1, 2, 3 };`
     *    The double quote and single quote are checked in order to avoid the indentation in the following case: str = "foo {";
     */
    test('Issue #25437', () => {
        // issue: https://github.com/microsoft/vscode/issues/25437
        // fix: https://github.com/microsoft/vscode/commit/8c82a6c6158574e098561c28d470711f1b484fc8
        // explanation: var foo = `{`; should not increase indentation
        // increaseIndentPattern: /^.*\{[^}"']*$/ -> /^.*\{[^}"'`]*$/
        const fileContents = [
            'const foo = `{`;',
            '    ',
        ].join('\n');
        const tokens = [
            [
                { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 5, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 6, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 9, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 10, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 11, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 12, standardTokenType: 2 /* StandardTokenType.String */ },
                { startIndex: 13, standardTokenType: 2 /* StandardTokenType.String */ },
                { startIndex: 14, standardTokenType: 2 /* StandardTokenType.String */ },
                { startIndex: 15, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 16, standardTokenType: 0 /* StandardTokenType.Other */ }
            ],
            [
                { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 4, standardTokenType: 0 /* StandardTokenType.Other */ }
            ]
        ];
        disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
        const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        forceTokenizationFromLineToLine(model, 1, 2);
        const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 1);
        const operation = editOperations[0];
        assert.deepStrictEqual(getIRange(operation.range), {
            'startLineNumber': 2,
            'startColumn': 1,
            'endLineNumber': 2,
            'endColumn': 5,
        });
        assert.deepStrictEqual(operation.text, '');
    });
    test('Enriching the hover', () => {
        // issue: -
        // fix: https://github.com/microsoft/vscode/commit/19ae0932c45b1096443a8c1335cf1e02eb99e16d
        // explanation:
        //  - decrease indent on ) and ] also
        //  - increase indent on ( and [ also
        // decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/ -> /^(.*\*\/)?\s*[\}\]\)].*$/
        // increaseIndentPattern: /^.*\{[^}"'`]*$/ -> /^.*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/
        let fileContents = [
            'function foo(',
            '    bar: string',
            '    ){}',
        ].join('\n');
        let model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        let editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 1);
        let operation = editOperations[0];
        assert.deepStrictEqual(getIRange(operation.range), {
            'startLineNumber': 3,
            'startColumn': 1,
            'endLineNumber': 3,
            'endColumn': 5,
        });
        assert.deepStrictEqual(operation.text, '');
        fileContents = [
            'function foo(',
            'bar: string',
            '){}',
        ].join('\n');
        model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 1);
        operation = editOperations[0];
        assert.deepStrictEqual(getIRange(operation.range), {
            'startLineNumber': 2,
            'startColumn': 1,
            'endLineNumber': 2,
            'endColumn': 1,
        });
        assert.deepStrictEqual(operation.text, '    ');
    });
    test('Issue #86176', () => {
        // issue: https://github.com/microsoft/vscode/issues/86176
        // fix: https://github.com/microsoft/vscode/commit/d89e2e17a5d1ba37c99b1d3929eb6180a5bfc7a8
        // explanation: When quotation marks are present on the first line of an if statement or for loop, following line should not be indented
        // increaseIndentPattern: /^((?!\/\/).)*(\{[^}"'`]*|\([^)"'`]*|\[[^\]"'`]*)$/ -> /^((?!\/\/).)*(\{([^}"'`]*|(\t|[ ])*\/\/.*)|\([^)"'`]*|\[[^\]"'`]*)$/
        // explanation: after open brace, do not decrease indent if it is followed on the same line by "<whitespace characters> // <any characters>"
        // todo@aiday-mar: should also apply for when it follows ( and [
        const fileContents = [
            `if () { // '`,
            `x = 4`,
            `}`
        ].join('\n');
        const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 1);
        const operation = editOperations[0];
        assert.deepStrictEqual(getIRange(operation.range), {
            'startLineNumber': 2,
            'startColumn': 1,
            'endLineNumber': 2,
            'endColumn': 1,
        });
        assert.deepStrictEqual(operation.text, '    ');
    });
    test('Issue #141816', () => {
        // issue: https://github.com/microsoft/vscode/issues/141816
        // fix: https://github.com/microsoft/vscode/pull/141997/files
        // explanation: if (, [, {, is followed by a forward slash then assume we are in a regex pattern, and do not indent
        // increaseIndentPattern: /^((?!\/\/).)*(\{([^}"'`]*|(\t|[ ])*\/\/.*)|\([^)"'`]*|\[[^\]"'`]*)$/ -> /^((?!\/\/).)*(\{([^}"'`/]*|(\t|[ ])*\/\/.*)|\([^)"'`/]*|\[[^\]"'`/]*)$/
        // -> Final current increase indent pattern at of writing
        const fileContents = [
            'const r = /{/;',
            '   ',
        ].join('\n');
        const tokens = [
            [
                { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 5, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 6, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 7, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 8, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 9, standardTokenType: 3 /* StandardTokenType.RegEx */ },
                { startIndex: 10, standardTokenType: 3 /* StandardTokenType.RegEx */ },
                { startIndex: 11, standardTokenType: 3 /* StandardTokenType.RegEx */ },
                { startIndex: 12, standardTokenType: 3 /* StandardTokenType.RegEx */ },
                { startIndex: 13, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 14, standardTokenType: 0 /* StandardTokenType.Other */ }
            ],
            [
                { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 4, standardTokenType: 0 /* StandardTokenType.Other */ }
            ]
        ];
        disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
        const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        forceTokenizationFromLineToLine(model, 1, 2);
        const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 1);
        const operation = editOperations[0];
        assert.deepStrictEqual(getIRange(operation.range), {
            'startLineNumber': 2,
            'startColumn': 1,
            'endLineNumber': 2,
            'endColumn': 4,
        });
        assert.deepStrictEqual(operation.text, '');
    });
    test('Issue #29886', () => {
        // issue: https://github.com/microsoft/vscode/issues/29886
        // fix: https://github.com/microsoft/vscode/commit/7910b3d7bab8a721aae98dc05af0b5e1ea9d9782
        // decreaseIndentPattern: /^(.*\*\/)?\s*[\}\]\)].*$/ -> /^((?!.*?\/\*).*\*\/)?\s*[\}\]\)].*$/
        // -> Final current decrease indent pattern at the time of writing
        // explanation: Positive lookahead: (?= «pattern») matches if pattern matches what comes after the current location in the input string.
        // Negative lookahead: (?! «pattern») matches if pattern does not match what comes after the current location in the input string
        // The change proposed is to not decrease the indent if there is a multi-line comment ending on the same line before the closing parentheses
        const fileContents = [
            'function foo() {',
            '    bar(/*  */)',
            '};',
        ].join('\n');
        const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 0);
    });
    test('Issue #209859: do not do reindentation for tokens inside of a string', () => {
        // issue: https://github.com/microsoft/vscode/issues/209859
        const tokens = [
            [
                { startIndex: 0, standardTokenType: 0 /* StandardTokenType.Other */ },
                { startIndex: 12, standardTokenType: 2 /* StandardTokenType.String */ },
            ],
            [
                { startIndex: 0, standardTokenType: 2 /* StandardTokenType.String */ },
            ],
            [
                { startIndex: 0, standardTokenType: 2 /* StandardTokenType.String */ },
            ],
            [
                { startIndex: 0, standardTokenType: 2 /* StandardTokenType.String */ },
            ]
        ];
        disposables.add(registerTokenizationSupport(instantiationService, tokens, languageId));
        const fileContents = [
            'const foo = `some text',
            '         which is strangely',
            '    indented. It should',
            '   not be reindented.`'
        ].join('\n');
        const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        forceTokenizationFromLineToLine(model, 1, 4);
        const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 0);
    });
    // Failing tests inferred from the current regexes...
    test.skip('Incorrect deindentation after `*/}` string', () => {
        // explanation: If */ was not before the }, the regex does not allow characters before the }, so there would not be an indent
        // Here since there is */ before the }, the regex allows all the characters before, hence there is a deindent
        const fileContents = [
            `const obj = {`,
            `    obj1: {`,
            `        brace : '*/}'`,
            `    }`,
            `}`,
        ].join('\n');
        const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 0);
    });
    // Failing tests from issues...
    test.skip('Issue #56275', () => {
        // issue: https://github.com/microsoft/vscode/issues/56275
        // explanation: If */ was not before the }, the regex does not allow characters before the }, so there would not be an indent
        // Here since there is */ before the }, the regex allows all the characters before, hence there is a deindent
        let fileContents = [
            'function foo() {',
            '    var bar = (/b*/);',
            '}',
        ].join('\n');
        let model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        let editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 0);
        fileContents = [
            'function foo() {',
            '    var bar = "/b*/)";',
            '}',
        ].join('\n');
        model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 0);
    });
    test.skip('Issue #116843', () => {
        // issue: https://github.com/microsoft/vscode/issues/116843
        // related: https://github.com/microsoft/vscode/issues/43244
        // explanation: When you have an arrow function, you don't have { or }, but you would expect indentation to still be done in that way
        // TODO: requires exploring indent/outdent pairs instead
        const fileContents = [
            'const add1 = (n) =>',
            '	n + 1;',
        ].join('\n');
        const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 0);
    });
    test.skip('Issue #185252', () => {
        // issue: https://github.com/microsoft/vscode/issues/185252
        // explanation: Reindenting the comment correctly
        const fileContents = [
            '/*',
            ' * This is a comment.',
            ' */',
        ].join('\n');
        const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 0);
    });
    test.skip('Issue 43244: incorrect indentation when signature of function call spans several lines', () => {
        // issue: https://github.com/microsoft/vscode/issues/43244
        const fileContents = [
            'function callSomeOtherFunction(one: number, two: number) { }',
            'function someFunction() {',
            '    callSomeOtherFunction(4,',
            '        5)',
            '}',
        ].join('\n');
        const model = disposables.add(instantiateTextModel(instantiationService, fileContents, languageId, options));
        const editOperations = getReindentEditOperations(model, languageConfigurationService, 1, model.getLineCount());
        assert.deepStrictEqual(editOperations.length, 0);
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0b2luZGVudC50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY29kZUVkaXRvci90ZXN0L25vZGUvYXV0b2luZGVudC50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sS0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQ3pCLE9BQU8sRUFBRSxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDbkUsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxlQUFlLEVBQWUsTUFBTSx5Q0FBeUMsQ0FBQztBQUN2RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsNkJBQTZCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUN4SCxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxpRUFBaUUsQ0FBQztBQUM1RyxPQUFPLEVBQW9DLG1CQUFtQixFQUFFLG9CQUFvQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFakosT0FBTyxFQUEwQixnQ0FBZ0MsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQy9ILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUczRCxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUNoSCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZUFBZSxDQUFDO0FBQ3pDLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQ3RGLE9BQU8sRUFBRSx5QkFBeUIsRUFBZ0Msb0JBQW9CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUMxSSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sd0RBQXdELENBQUM7QUFHbkYsT0FBTyxFQUFF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