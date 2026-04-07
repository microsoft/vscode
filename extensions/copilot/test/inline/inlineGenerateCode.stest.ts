/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { InlineDocIntent } from '../../src/extension/intents/node/docIntent';
import { EditCodeIntent } from '../../src/extension/intents/node/editCodeIntent';
import { GenerateCodeIntent } from '../../src/extension/intents/node/generateCodeIntent';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { URI } from '../../src/util/vs/base/common/uri';
import { Uri } from '../../src/vscodeTypes';
import { NonExtensionConfiguration, ssuite, stest } from '../base/stest';
import { KnownDiagnosticProviders } from '../simulation/diagnosticProviders';
import { simulateInlineChat, simulateInlineChatIntent } from '../simulation/inlineChatSimulator';
import { assertContainsAllSnippets, assertNoDiagnosticsAsync, assertNoSyntacticDiagnosticsAsync, findTextBetweenMarkersFromBottom } from '../simulation/outcomeValidators';
import { assertConversationalOutcome, assertInlineEdit, assertInlineEditShape, assertOccursOnce, assertOneOf, assertSomeStrings, fromFixture, toFile } from '../simulation/stestUtil';
import { EditTestStrategy, IScenario } from '../simulation/types';

function executeEditTestStrategy(
	strategy: EditTestStrategy,
	testingServiceCollection: TestingServiceCollection,
	scenario: IScenario
): Promise<void> {
	if (strategy === EditTestStrategy.Inline) {
		return simulateInlineChat(testingServiceCollection, scenario);
	} else if (EditTestStrategy.InlineChatIntent) {
		return simulateInlineChatIntent(testingServiceCollection, scenario);
	} else {
		throw new Error('Invalid edit test strategy');
	}
}

function forInlineAndInlineChatIntent(callback: (strategy: EditTestStrategy, variant: '-InlineChatIntent' | '', nonExtensionConfigurations?: NonExtensionConfiguration[]) => void): void {
	callback(EditTestStrategy.Inline, '', undefined);
	callback(EditTestStrategy.InlineChatIntent, '-InlineChatIntent', [['inlineChat.enableV2', true], ['chat.agent.autoFix', false]]);
}

forInlineAndInlineChatIntent((strategy, variant, nonExtensionConfigurations) => {

	ssuite({ title: `generate${variant}`, location: 'inline' }, () => {
		stest({ description: 'gen-ts-ltrim', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					{ kind: 'relativeFile', fileName: 'new.ts', fileContents: '' }
				],
				queries: [
					{
						file: 'new.ts',
						selection: [0, 0],
						query: 'generate a function that will remove whitespace from the start of a string',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertContainsAllSnippets(outcome.fileContents, ['function', ': string'], 'gen-ts-ltrim-01');
						},
					},
					{
						query: 'change it to take as argument the characters to remove from the start',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const text = outcome.fileContents;
							const f1 = text.indexOf('function ');
							const f2 = text.indexOf('function ', f1 + 1);
							assert(f2 === -1);
							assertContainsAllSnippets(text, ['function', ': string'], 'gen-ts-ltrim-02');
						},
					},
					{
						query: 'add doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const text = outcome.fileContents;
							const f1 = text.indexOf('\nfunction ');
							const f2 = text.indexOf('\nfunction ', f1 + 1);
							assert(f2 === -1);
							return assertContainsAllSnippets(text, ['function', ': string', '/**'], 'gen-ts-ltrim-03');
						},
					}
				],
			});
		});

		stest({ description: 'Generate a nodejs server', language: 'javascript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [{ kind: 'relativeFile', fileName: 'server.js', fileContents: '' }],
				queries: [
					{
						file: 'server.js',
						selection: [0, 0],
						query: 'generate a nodejs server that responds with "Hello World"',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertContainsAllSnippets(outcome.fileContents, ['http', 'createServer', 'listen', 'Hello World']);
						},
					},
					{
						query: 'change it to respond with "Goodbye World"',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertContainsAllSnippets(outcome.fileContents, ['http', 'createServer', 'listen', 'Goodbye World']);
						},
					},
				],
			});
		});

		stest({ description: 'generate rtrim', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {

			if (1) {
				throw new Error('SKIPPED');
			}

			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen-top-level-function/charCode.ts'),
					fromFixture('gen-top-level-function/strings.ts'),
				],
				queries: [
					{
						file: 'strings.ts',
						selection: [770, 0],
						query: 'generate rtrim',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 770,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 770,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['rtrim', 'needle.length']);
						},
					},
				],
			});
		});

		stest({ description: 'issue #2342: Use inline chat to generate a new function/property replaces other code', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen-top-level-function/charCode.ts'),
					fromFixture('gen-top-level-function/strings.ts'),
				],
				queries: [
					{
						file: 'strings.ts',
						selection: [31, 0],
						query: 'generate a fibonacci',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 31,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 31,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							const changedModifiedLines = edit.changedModifiedLines.join('\n');
							assertContainsAllSnippets(changedModifiedLines, ['function']);
							assertOneOf([
								() => assertContainsAllSnippets(changedModifiedLines, ['fibonacci']),
								() => assertContainsAllSnippets(changedModifiedLines, ['Fibonacci']), // e.g., `generateFibonacci()`
							]);
						},
					},
				],
			});
		});

		stest({ description: 'issue #3602: gen method', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen-method-issue-3602/editor.ts'),
				],
				queries: [
					{
						file: 'editor.ts',
						selection: [39, 0],
						query: 'add an async function that moves a block of lines up by one',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 39,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 39,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							const changedModifiedLines = edit.changedModifiedLines.join('\n');
							assertContainsAllSnippets(changedModifiedLines, ['async'], 'gen-method-issue-3602');
							assertOneOf([
								() => assertContainsAllSnippets(changedModifiedLines, ['moveBlockUp']),
								() => assertContainsAllSnippets(changedModifiedLines, ['moveLinesUp']),
							]);
						},
					},
				],
			});
		});

		stest({ description: 'issue #3604: gen nestjs route', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen-nestjs-route-issue-3604/app.controller.ts'),
				],
				queries: [
					{
						file: 'app.controller.ts',
						selection: [12, 4],
						query: 'add a new /about page',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 12,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 12,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['@Get', '(): string']);
						},
					},
				],
			});
		});

		stest({ description: 'gen a palindrom fn', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					{ kind: 'relativeFile', fileName: 'new.py', fileContents: '' }
				],
				queries: [
					{
						file: 'new.py',
						selection: [0, 0],
						query: 'generate a function that checks if a string is a palindrome',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertContainsAllSnippets(outcome.fileContents, ['def', '[::-1]'], 'gen-python-palindrome');
						},
					},
				],
			});
		});

		stest({ description: 'issue #3597: gen twice', language: 'javascript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen-twice-issue-3597/new.js')
				],
				queries: [
					{
						file: 'new.js',
						selection: [27, 0],
						query: 'create a function that checks whether a given number is a prime number',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 27,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 27,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['function']);
						},
					},
					{
						query: 'create a function that checks if a given number is a fibonacci number',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: ~1,
								originalLength: 0,
								modifiedLength: undefined,
							}, {
								line: ~1,
								originalLength: 1,
								modifiedLength: undefined,
							}, {
								line: ~0,
								originalLength: 0,
								modifiedLength: undefined,
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['function']);
						}
					}
				],
			});
		});

		stest({ description: 'issue #3782: gen twice', language: 'javascript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					{ kind: 'relativeFile', fileName: 'new.js', fileContents: '' }
				],
				queries: [
					{
						file: 'new.js',
						selection: [0, 0],
						query: 'create a function `fibonacci` that computes the fibonacci numbers',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, {
								line: 0,
								originalLength: 1,
								modifiedLength: undefined,
							});
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['function fibonacci']);
						},
					},
					{
						query: 'create a second function `getPrimes` that compute prime numbers',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: ~1,
								originalLength: 0,
								modifiedLength: undefined,
							}, {
								line: ~0,
								originalLength: 0,
								modifiedLength: undefined,
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['function getPrimes']);
						}
					},
					{
						query: 'document the functions with jsdoc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const text = outcome.fileContents;

							// we need to have 2 functions
							const f1 = text.indexOf('function fibonacci');
							const f2 = text.indexOf('\nfunction getPrimes', f1 + 1);
							const f3 = text.indexOf('function', f2 + 1);
							assert(!(f1 === -1 || f2 === -1));
							assert(f3 === -1);

							const textAboveFibonacci = text.substring(0, f1);
							const fibonacciDoc = findTextBetweenMarkersFromBottom(textAboveFibonacci, '/**', '*/');
							assert(fibonacciDoc);

							const textAboveGetPrimes = text.substring(f1, f2);
							const getPrimesDoc = findTextBetweenMarkersFromBottom(textAboveGetPrimes, '/**', '*/');
							assert(getPrimesDoc);
						}
					},
					{
						query: 'generate a function `getFibonacciPrimes` that compute the first 100 prime numbers that are also fibonacci numbers using the `fibonacci` and the`getPrimes` function',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							const text = outcome.fileContents;
							// we need to have 2 functions
							const f1 = text.indexOf('function fibonacci');
							const f2 = text.indexOf('\nfunction getPrimes', f1 + 1);
							const f3 = text.indexOf('\nfunction getFibonacciPrimes', f2 + 1);
							assert(!(f1 === -1 || f2 === -1 || f3 === -1));
						}
					},
				],
			});
		});

		stest({ description: 'parse keybindings', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('gen/keybindingParser.ts')],
				queries: [{
					file: 'keybindingParser.ts',
					selection: [15, 8],
					query: 'parse ctrl+ shift+ alt+ cmd+ and remove them from input',
					expectedIntent: GenerateCodeIntent.ID,
					validate: async (outcome, workspace, accessor) => {
						assertInlineEdit(outcome);
						await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
						const edit = assertInlineEditShape(outcome, [{
							line: 15,
							originalLength: 1,
							modifiedLength: undefined
						}, {
							line: 15,
							originalLength: 0,
							modifiedLength: undefined
						}]);
						assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['ctrl = true', 'shift = true', 'alt = true', 'meta = true']);
					}
				}]
			});
		});

		stest({ description: 'issue #2303: FILEPATH not removed from generated code in empty file', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			const uri = Uri.parse('untitled:Untitled-1');
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [{
					kind: 'qualifiedFile',
					uri,
					fileContents: '',
					languageId: 'python'
				}],
				queries: [
					{
						file: uri,
						selection: [0, 0],
						query: 'reverse a linked list in python',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.strictEqual(outcome.fileContents.includes('# FILEPATH'), false);
						},
					},
				],
			});
		});

		stest({ description: 'issue #2589: IllegalArgument: line must be non-negative', language: 'json', nonExtensionConfigurations }, (testingServiceCollection) => {
			const uri = Uri.parse('file:///home/.prettierrc');
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [{
					kind: 'qualifiedFile',
					uri,
					fileContents: '',
					languageId: 'json'
				}],
				queries: [
					{
						file: uri,
						selection: [0, 0],
						query: 'use tabs',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
						},
					},
				],
			});
		});

		stest({ description: 'issue #2269: BEGIN and END were included in diff', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			const uri = Uri.parse('untitled:Untitled-1');
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [{
					kind: 'qualifiedFile',
					uri,
					fileContents: '',
					languageId: 'javascript'
				}],
				queries: [
					{
						file: uri,
						selection: [0, 0],
						query: 'create a simple express server',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.strictEqual(outcome.fileContents.includes('BEGIN'), false);
						},
					},
					{
						query: 'add a date route that returns the current date and time',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.strictEqual(outcome.fileContents.includes('BEGIN'), false);
						},
					},
					{
						query: 'create an eval route that evaluates a mathematical equation. Support addition, multiplication, division, subtraction and square root',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.strictEqual(outcome.fileContents.includes('BEGIN'), false);
						},
					}
				],
			});
		});

		stest({ description: 'Streaming gets confused due to jsdoc', language: 'json', nonExtensionConfigurations }, (testingServiceCollection) => {

			if (1) {
				throw new Error('SKIPPED');
			}

			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen-top-level-function/strings.ts'),
				],
				queries: [
					{
						file: 'strings.ts',
						selection: [75, 0],
						query: 'add fibonacci function and use jsdoc to document it',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 75,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 75,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['function fibonacci']);
						},
					}
				],
			});
		});

		stest({ description: 'code below cursor is not duplicated', language: 'html', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('editing-html/index.html')
				],
				queries: [
					{
						file: 'index.html',
						selection: [3, 3],
						query: 'make cursor use hand.png',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertOccursOnce(outcome.fileContents, '<html>');
							assertOccursOnce(outcome.fileContents, '<head>');
							assertOccursOnce(outcome.fileContents, '<style>');
							assertOccursOnce(outcome.fileContents, '</style>');
							assertOccursOnce(outcome.fileContents, '</head>');
							assertOccursOnce(outcome.fileContents, '<body>');
							assertOccursOnce(outcome.fileContents, '</body>');
							assertOccursOnce(outcome.fileContents, '</html>');
						}
					}
				],
			});
		});

		stest({ description: 'issue #3370: generate code duplicates too much', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen/inlayHintsController.ts')
				],
				queries: [
					{
						file: 'inlayHintsController.ts',
						selection: [673, 0],
						query: 'add a function that takes a string and a length. the function should crop the string at length and insert `...` instead. The length is fuzzy and if possible the ellipses shouldn\'t follow whitespace or other "funny" characters',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 673,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 673,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['function', '...']);
							assertOccursOnce(edit.changedModifiedLines.join('\n'), 'function');
						}
					}
				],
			});
		});

		stest({ description: 'issue #2496: Range of interest is imprecise after a streaming edit', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {

			if (1) {
				throw new Error('SKIPPED');
			}

			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen/strings.ts')
				],
				queries: [
					{
						file: 'strings.ts',
						selection: [49, 0],
						query: 'add fibonacci(n) returning the nth fibonacci with recursion',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 49,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 49,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['fibonacci']);
						}
					},
					{
						file: 'strings.ts',
						selection: [49, 3],
						wholeRange: [49, 0, 49, 3], // we want to simulate 100% vscode's behavior and vscode is peculiar here
						query: 'avoid using recursion',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertOccursOnce(outcome.fileContents, 'function fibonacci');
						}
					}
				],
			});
		});

		stest({ description: 'issue release#142: Inline chat updates code outside of area I expect', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/issue-release-142/testAuthProvider.ts')
				],
				queries: [
					{
						file: 'testAuthProvider.ts',
						selection: [28, 8],
						query: 'implement this',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 28,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 28,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['sessionId', 'this._onDidChangeSessions']);
							assertSomeStrings(edit.changedModifiedLines.join('\n'), ['filter', 'splice'], 1);
						}
					}
				],
			});
		});

		stest({ description: 'issue #3778: Incorrect streaming edits', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen/modelLines.ts')
				],
				queries: [
					{
						file: 'modelLines.ts',
						selection: [3, 0],
						query: 'implement this!',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertInlineEditShape(outcome, [{
								line: 3,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 3,
								originalLength: 1,
								modifiedLength: undefined
							}]);
						}
					}
				],
			});
		});

		stest({ description: 'issue #4179: Imports aren\'t inserted to the top of the file anymore', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen/4179.ts')
				],
				queries: [
					{
						file: '4179.ts',
						selection: [10, 0],
						query: 'use node-lib to read a file',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const firstLine = outcome.fileContents.split(/\r\n|\r|\n/g)[0];
							assertSomeStrings(firstLine, ['import', 'require'], 1);
						}
					}
				],
			});
		});

		stest({ description: 'Remember my name', language: 'javascript', nonExtensionConfigurations }, (testingServiceCollection) => {

			const uri = URI.from({ scheme: 'foo', path: '/bar/baz.js' });

			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [{
					kind: 'qualifiedFile',
					uri,
					fileContents: '',
					languageId: 'javascript'
				}],
				queries: [
					{
						file: uri,
						selection: [0, 0],
						query: 'My name is Siglinde. Remember my name',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertConversationalOutcome(outcome);
						},
					},
					{
						file: uri,
						selection: [0, 0],
						query: 'Generate a class that represents a person',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.ok(outcome.fileContents.includes('Person'));
						},
					},
					{
						// file: uri,
						query: 'Print my name as a sample usage of the class',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							assert.ok(outcome.fileContents.includes('Siglinde'));
						},
					}
				],
			});
		});

		stest({ description: 'issue #4080: Implementing a getter/method duplicates the signature', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen/4080.ts')
				],
				queries: [
					{
						file: '4080.ts',
						selection: [40, 2],
						query: 'implement this!',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 40,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 40,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['CharCode.Tab', 'CharCode.Space', 'CharCode.LineFeed', 'while']);
						}
					}
				],
			});
		});

		stest({ description: 'issue #3439: Bad edits in this case', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen/commandCenterControl.ts')
				],
				queries: [
					{
						file: 'commandCenterControl.ts',
						selection: [188, 0],
						query: 'when label contains \n or \r replace them with the rendered unicode character',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 188,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 188,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['replace', '\\r', '\\n']);
						}
					}
				],
			});
		});

		stest({ description: 'cpp code generation', language: 'cpp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('cpp/basic/main.cpp')
				],
				queries: [
					{
						file: 'main.cpp',
						selection: [15, 0],
						query: 'add validation to ensure that the input is not empty',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertContainsAllSnippets(outcome.fileContents, ['empty']);
							assertSomeStrings(outcome.fileContents, ['if', 'while']);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'cpp');
						}
					}
				],
			});
		});

		stest({ description: 'templated code generation', language: 'cpp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('cpp/headers/json_fwd.hpp'),
					fromFixture('cpp/headers/abi_macros.hpp')
				],
				queries: [
					{
						file: 'json_fwd.hpp',
						selection: [71, 0],
						query: 'add a sorted_map specialization',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							// Validate the generated code matches naming and formatting conventions.
							assertSomeStrings(outcome.fileContents, ['sorted_map', 'sorted_json', 'basic_json<nlohmann::sorted_map>']);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'cpp');
						}
					}
				],
			});
		});

		stest({ description: 'issue #224: Lots of lines deleted when using interactive chat in a markdown file', language: 'markdown', nonExtensionConfigurations }, (testingServiceCollection) => {

			if (1) {
				throw new Error('SKIPPED');
			}

			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen/CHANGELOG.md')
				],
				queries: [
					{
						file: 'CHANGELOG.md',
						selection: [1, 0],
						query: 'Add release notes for version 0.62.0',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertInlineEditShape(outcome, [{
								line: 1,
								originalLength: 1,
								modifiedLength: undefined
							}]);
						},
					},
				],
			});
		});

		stest({ description: 'doesn\'t handle markdown code response', language: 'markdown', nonExtensionConfigurations }, (testingServiceCollection) => {
			const uri = Uri.parse('untitled:Untitled-1');
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [{
					kind: 'qualifiedFile',
					uri,
					fileContents: '',
					languageId: 'markdown'
				}],
				queries: [
					{
						file: uri,
						selection: [0, 0],
						query: 'describe fibonacci in markdown',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
						},
					},
				],
			});
		});

		stest({ description: 'issue #5439: import List in python', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen/5439.py')
				],
				queries: [
					{
						file: '5439.py',
						selection: [2, 0],
						query: 'import List',
						expectedIntent: GenerateCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertInlineEditShape(outcome, [{
								line: 2,
								originalLength: 1,
								modifiedLength: 1
							}]);
						},
					},
				],
			});
		});

		stest({ description: 'issue #6234: generate a TS interface for some JSON', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('gen/6234/top-packages.ts')],
				queries: [
					{
						file: 'top-packages.ts',
						selection: [4, 0, 4, 0],
						query: 'generate an interface for this JSON:\n\n```\n{"name":"chalk","version":"5.3.0","description":"Terminal string styling done right","keywords":["color","colour","colors","terminal","console","cli","string","ansi","style","styles","tty","formatting","rgb","256","shell","xterm","log","logging","command-line","text"],"publisher":{"username":"sindresorhus","email":"sindresorhus@gmail.com"},"maintainers":[{"username":"sindresorhus","email":"sindresorhus@gmail.com"},{"username":"qix","email":"josh@junon.me"}],"links":{"npm":"https://www.npmjs.com/package/chalk","homepage":"https://github.com/chalk/chalk#readme","repository":"https://github.com/chalk/chalk"}}\n```',
						diagnostics: 'tsc',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertInlineEdit(outcome);
							assertInlineEditShape(outcome, [{
								line: 4,
								originalLength: 1,
								modifiedLength: undefined
							}]);
						}
					}
				]
			});
		});

		stest({ description: 'Inline chat response did not use code block #6554', language: 'powershell', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('gen/6554/update-vs-base.ps1')],
				queries: [
					{
						file: 'update-vs-base.ps1',
						selection: [13, 0, 13, 0],
						query: 'copy folder to new location',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							assert.equal(outcome.type, 'inlineEdit');
						}
					}
				]
			});
		});

		stest({ description: 'variables are used when generating', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen/variables/example.ts'),
					fromFixture('gen/variables/output.ts')
				],
				queries: [
					{
						file: 'output.ts',
						selection: [0, 0],
						query: 'generate the same function like in #file:example.ts but for ArrayBuffer',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertContainsAllSnippets(outcome.fileContents, ['ArrayBuffer']);
							assertSomeStrings(outcome.fileContents, ['arrayBufferInsert', 'arrayInsert'], 1);
						}
					}
				]
			});
		});

		stest({ description: 'too much code generated #6696', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [toFile({
					fileName: 'generate/issue-6696/heatmapServiceImpl.ts',
					fileContents: `/*---------------------------------------------------------------------------------------------\n *  Copyright (c) Microsoft Corporation and GitHub. All rights reserved.\n *--------------------------------------------------------------------------------------------*/\n\nimport * as vscode from 'vscode';\nimport { DisposableStore } from '../../../util/vs/base/common/lifecycle';\nimport { ResourceMap } from '../../../util/vs/base/common/map';\nimport { IDocumentHeatMap, IDocumentHeatMapEntry, IHeatMapService } from '../common/heatmapService';\n\nclass DocumentHeatMap implements IDocumentHeatMap {\n\n\tprivate readonly _entries: IDocumentHeatMapEntry[] = [];\n\n\t\n\n\tgetEntries(): IDocumentHeatMapEntry[] {\n\t\treturn this._entries;\n\t}\n\n\tmarkClosed(): void {\n\n\t}\n\n\thandleSelectionChange(e: vscode.TextEditorSelectionChangeEvent): void {\n\t\tthis._entries.push({\n\t\t\ttimeStamp: Date.now(),\n\t\t\tposition: e.selections[0].active\n\t\t});\n\t}\n\n\thandleTextDocumentChange(e: vscode.TextDocumentChangeEvent): void {\n\n\t}\n}\n\nexport class HeatMapServiceImpl implements IHeatMapService {\n\n\t_serviceBrand: undefined;\n\n\tprivate readonly _store = new DisposableStore();\n\n\tprivate readonly _map = new ResourceMap<DocumentHeatMap>();\n\n\tconstructor() {\n\t\tthis._store.add(vscode.window.onDidChangeTextEditorSelection(e => {\n\t\t\tthis._ensureHeatMap(e.textEditor.document.uri).handleSelectionChange(e);\n\t\t}));\n\t\tthis._store.add(vscode.workspace.onDidChangeTextDocument(e => {\n\t\t\tthis._ensureHeatMap(e.document.uri).handleTextDocumentChange(e);\n\t\t}));\n\t\tthis._store.add(vscode.workspace.onDidCloseTextDocument(e => {\n\t\t\t//\n\t\t\tthis._map.get(e.uri)?.markClosed();\n\t\t}));\n\t}\n\n\tdispose(): void {\n\t\tthis._store.dispose();\n\t}\n\n\tgetDocumentHeatMap(uri: vscode.Uri): IDocumentHeatMap | undefined {\n\t\treturn this._map.get(uri);\n\t}\n\n\tprivate _ensureHeatMap(uri: vscode.Uri): DocumentHeatMap {\n\t\tlet heatMap = this._map.get(uri);\n\t\tif (!heatMap) {\n\t\t\theatMap = new DocumentHeatMap();\n\t\t\tthis._map.set(uri, heatMap);\n\t\t}\n\t\treturn heatMap;\n\t}\n}\n`
				})],
				queries: [
					{
						file: 'generate/issue-6696/heatmapServiceImpl.ts',
						selection: [13, 1, 13, 1],
						query: 'add constructor that takes the vscode.TextDocument',
						diagnostics: 'tsc',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							const allNewText = outcome.appliedEdits.map(edit => edit.newText).join('');

							assert.strictEqual(allNewText.includes('TextDocument'), true);
							assert.strictEqual(allNewText.includes('vscode.TextDocument'), true);
							assert.strictEqual(allNewText.includes('store.add'), false);
							assert.strictEqual(allNewText.includes('onDidChange'), false);
						}
					}
				]
			});
		});

		stest({ description: 'issue #6163', language: 'json', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('generate/issue-6163/package.json')],
				queries: [
					{
						file: 'package.json',
						selection: [14, 1, 14, 1],
						query: 'add scripts section which invokes .esbuild.ts',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertInlineEditShape(outcome, [{
								line: 14,
								originalLength: 1,
								modifiedLength: undefined
							}]);
						}
					}
				]
			});
		});

		stest({ description: 'issue #6788', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('generate/issue-6788/terminalSuggestAddon.ts')
				],
				queries: [
					{
						file: 'terminalSuggestAddon.ts',
						selection: [551, 2, 551, 2],
						query: 'get common prefix length of replacementText and completion.label',
						diagnostics: 'tsc',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
						}
					}
				]
			});
		});

		stest({ description: 'issue #6505', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('generate/issue-6505/chatParserTypes.ts')],
				queries: [
					{
						file: 'chatParserTypes.ts',
						selection: [84, 1, 84, 1],
						query: 'add a getter isSynthetic when range.length = 0',
						diagnostics: 'tsc',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);
							const edit = assertInlineEditShape(outcome, [{
								line: 84,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['this.range.length']);
						}
					}
				]
			});
		});

		stest({ description: 'issue #7772', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTestStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('generate/issue-7772/builds.ts')],
				queries: [
					{
						file: 'builds.ts',
						selection: [141, 8, 141, 8],
						query: 'compare the `path` sha256 with the `sha256`',
						diagnostics: 'tsc',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);
						}
					}
				]
			});
		});

		stest({ description: 'Issue #7088', language: 'powershell', nonExtensionConfigurations }, (accessor) => {
			return executeEditTestStrategy(strategy, accessor, {
				files: [toFile({
					filePath: fromFixture('generate/issue-7088/Microsoft.PowerShell_profile.ps1')
				})],
				queries: [
					{
						file: 'Microsoft.PowerShell_profile.ps1',
						selection: [3, 0, 3, 0],
						query: 'set alias c to code-insiders',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
						}
					}
				]
			});
		});
	});
});
