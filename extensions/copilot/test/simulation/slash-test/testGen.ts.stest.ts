/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { dirname, join } from 'path';
import { Intent } from '../../../src/extension/common/constants';
import { TestsIntent } from '../../../src/extension/intents/node/testIntent/testIntent';
import { ConfigKey } from '../../../src/platform/configuration/common/configurationService';
import { deserializeWorkbenchState } from '../../../src/platform/test/node/promptContextModel';
import { assertType } from '../../../src/util/vs/base/common/types';
import { ssuite, stest } from '../../base/stest';
import { generateScenarioTestRunner } from '../../e2e/scenarioTest';
import { forInline, simulateInlineChatWithStrategy } from '../inlineChatSimulator';
import { assertContainsAllSnippets, assertNoSyntacticDiagnosticsAsync, getFileContent } from '../outcomeValidators';
import { assertInlineEdit, assertInlineEditShape, assertNoStrings, assertSomeStrings, assertWorkspaceEdit, fromFixture } from '../stestUtil';


forInline((strategy, nonExtensionConfigurations, suffix) => {

	ssuite({ title: `/tests${suffix}`, location: 'inline', language: 'typescript', nonExtensionConfigurations }, () => {

		stest({ description: 'can add a test after an existing one', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/simple-ts-proj-with-test-file/src/index.ts'),
					fromFixture('tests/simple-ts-proj-with-test-file/src/test/index.test.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [0, 17],
						query: '/tests',
						expectedIntent: Intent.Tests,
						validate: async (outcome, workspace, accessor) => {
							assertWorkspaceEdit(outcome);

							const changedFile = outcome.files.at(0);
							assert.ok(changedFile);
							assert([...getFileContent(changedFile).matchAll(/\n\tit/g)].length > 1);

							const sixthLine = getFileContent(changedFile).split(/\r\n|\r|\n/g).at(6);

							assert(sixthLine !== '});', `new tests are inserted within the existing suite: expected NOT '});'`);
						},
					},
				],
			});
		});

		stest({ description: 'can add a test after an existing one with empty line', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/simple-ts-proj-with-test-file-1/src/index.ts'),
					fromFixture('tests/simple-ts-proj-with-test-file-1/src/test/index.test.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [0, 17],
						query: '/tests',
						expectedIntent: Intent.Tests,
						validate: async (outcome, workspace, accessor) => {
							assertWorkspaceEdit(outcome);
							assertType(outcome.files[0]);
							assert([...getFileContent(outcome.files[0]).matchAll(/\n\tit/g)].length > 1);
						},
					},
				],
			});
		});

		stest({ description: 'supports chat variables', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/simple-ts-proj/src/index.ts'),
					fromFixture('tests/simple-ts-proj/src/math.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [0, 17],
						query: '/tests keep in mind #file:math.ts',
						expectedIntent: Intent.Tests,
						validate: async (outcome, workspace, accessor) => {
							assertWorkspaceEdit(outcome);
							assertType(outcome.files[0]);
							assert(getFileContent(outcome.files[0]).match('subtract'));
						},
					},
				],
			});
		});

		stest({ description: 'BidiMap test generation (inside file)', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/generate-for-selection', 'base/test/common/map.test.ts'),
					fromFixture('tests/generate-for-selection', 'base/common/map.ts'),
				],
				queries: [{
					file: 'base/common/map.ts',
					selection: [671, 0, 725, 1],
					query: '/tests',
					expectedIntent: Intent.Tests,
					validate: async (outcome, workspace, accessor) => {
						assertWorkspaceEdit(outcome);

						assert.strictEqual(outcome.files.length, 1);

						const [first] = outcome.files;
						assertSomeStrings(getFileContent(first), ['suite', 'test', 'assert.strictEqual']);
						assertNoStrings(getFileContent(first), ['import']);
					}
				}],
			});
		});

		stest({ description: 'BidiMap test generation (inside test)', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/generate-for-selection', 'base/test/common/map.test.ts'),
					fromFixture('tests/generate-for-selection', 'base/common/map.ts'),
				],
				queries: [{
					file: 'base/test/common/map.test.ts',
					selection: [470, 13, 470, 13],
					query: '/tests Write tests for BidiMap',
					expectedIntent: Intent.Tests,
					validate: async (outcome, workspace, accessor) => {
						assertInlineEdit(outcome);

						assert.ok(outcome.appliedEdits.length >= 1);

						assert.ok(outcome.appliedEdits.some(edit =>
							edit.newText.includes('suite')
							&& edit.newText.includes('test')
							&& edit.newText.includes('assert.strictEqual')
						));
					}
				}],
			});
		});

		stest({ description: 'ts-new-test', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('/tests/ts-another-test-4636/', 'stickyScroll.test.ts'),
				],
				queries: [{
					file: 'stickyScroll.test.ts',
					selection: [252, 0],
					query: '/tests add one more test for testing findScrollWidgetState',
					expectedIntent: Intent.Tests,
					validate: async (outcome, workspace, accessor) => {
						assertInlineEdit(outcome);

						assert.ok(outcome.appliedEdits.length >= 1);
						assert.ok(outcome.appliedEdits.some(edit => edit.newText.match(/test\(.*findScrollWidgetState/)));
					}
				}]
			});
		});

	});
});

// the folloing tests test the intent-detection. Inline2 does not do intent-detection.

forInline((strategy, nonExtensionConfigurations) => {

	ssuite({ title: `/tests`, subtitle: 'real world', location: 'inline', language: 'typescript', nonExtensionConfigurations }, () => {

		stest({ description: 'generate a unit test', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/ts-leading-whitespace/charCode.ts'),
					fromFixture('tests/ts-leading-whitespace/strings.ts'),
				],
				queries: [
					{
						file: 'strings.ts',
						selection: [250, 3, 257, 4],
						query: 'generate a unit test',
						expectedIntent: Intent.Tests,
						validate: async (outcome, workspace, accessor) => {
							assert.strictEqual(outcome.type, 'workspaceEdit');
						},
					},
				],
			});
		});
		stest({ description: 'issue #3699: add test for function', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/for-method-issue-3699/foldingRanges.ts'),
				],
				queries: [
					{
						file: 'foldingRanges.ts',
						selection: [419, 1, 421, 2],
						query: 'add test for this function',
						expectedIntent: Intent.Tests,
						validate: async (outcome, workspace, accessor) => {
							assert.strictEqual(outcome.type, 'workspaceEdit');
						},
					},
				],
			});
		});

		stest({ description: 'issue #3701: add some more tests for folding', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/in-suite-issue-3701/notebookFolding.test.ts'),
				],
				queries: [
					{
						file: 'notebookFolding.test.ts',
						selection: [132, 2],
						query: 'add some more tests for folding',
						expectedIntent: Intent.Tests,
						validate: async (outcome, workspace, accessor) => {
							assert.strictEqual(outcome.type, 'inlineEdit');
							const lines = outcome.fileContents.split(/\r\n|\r|\n/g);
							assert.ok(lines.length >= 132 + 276);
							// remove first 132 lines
							lines.splice(0, 132);
							// remove last 276 lines
							lines.splice(lines.length - 276, 276);
							const text = lines.join('\n');
							return assertContainsAllSnippets(text, ['withTestNotebook', 'assert'], 'tests/in-suite-issue-3701');
						},
					},
				],
			});
		});


		stest('add another test for containsUppercaseCharacter with other non latin chars', (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/another-unit-test/strings.test.ts'),
					fromFixture('tests/another-unit-test/charCode.ts'),
					fromFixture('tests/another-unit-test/strings.ts')],
				queries: [
					{
						file: 'strings.test.ts',
						selection: [344, 0],
						query: 'add another test for containsUppercaseCharacter with other non latin chars',
						expectedIntent: TestsIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 344,
								originalLength: 0,
								modifiedLength: undefined
							}, {
								line: 344,
								originalLength: 1,
								modifiedLength: undefined
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['containsUppercaseCharacter', 'assert.strictEqual']);
						},
					},
				],
			});
		});
	});
	ssuite({ title: `/tests`, subtitle: 'custom instructions', location: 'inline', language: 'typescript', nonExtensionConfigurations }, function () {
		const testGenConfigOnly = [
			{
				key: ConfigKey.TestGenerationInstructions,
				value: [
					{ 'text': `Add a comment: 'Generated by Copilot'` },
					{ 'text': 'use TDD instead of BDD', 'language': 'typescript' },
					{ 'text': 'use ssuite instead of suite and stest instead of test', 'language': 'typescript' },
				]
			}
		];
		stest({ description: '[test gen config] can add a test after an existing one with empty line', configurations: testGenConfigOnly }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/simple-ts-proj-with-test-file-2/src/index.ts'),
					fromFixture('tests/simple-ts-proj-with-test-file-2/src/test/index.test.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [0, 17],
						query: '/tests',
						expectedIntent: Intent.Tests,
						validate: async (outcome, workspace, accessor) => {
							assertWorkspaceEdit(outcome);

							const fileContents = getFileContent(outcome.files[0]);
							assertType(fileContents);

							['ssuite', 'stest', 'Generated by Copilot'].forEach(needle => assert.ok(fileContents.includes(needle)));
						},
					},
				],
			});
		});

		const codeGenAndTestGenConfig = [
			{
				key: ConfigKey.CodeGenerationInstructions,
				value: [
					{ 'text': `Add a comment: 'Generated by Copilot'` },
				]
			},
			{
				key: ConfigKey.TestGenerationInstructions,
				value: [
					{ 'text': 'use TDD instead of BDD', 'language': 'typescript' },
					{ 'text': 'use ssuite instead of suite and stest instead of test', 'language': 'typescript' },
				]
			}
		];
		stest({ description: '[code gen + test gen config] can add a test after an existing one with empty line', configurations: codeGenAndTestGenConfig }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/simple-ts-proj-with-test-file-2/src/index.ts'),
					fromFixture('tests/simple-ts-proj-with-test-file-2/src/test/index.test.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [0, 17],
						query: '/tests',
						expectedIntent: Intent.Tests,
						validate: async (outcome, workspace, accessor) => {
							assertWorkspaceEdit(outcome);

							const fileContents = getFileContent(outcome.files[0]);
							assertType(fileContents);

							['ssuite', 'stest', 'Generated by Copilot'].forEach(needle => assert.ok(fileContents.includes(needle)));
						},
					},
				],
			});
		});
	});
});

// the folloing tests are panel tests

ssuite({ title: `/tests`, location: 'panel', language: 'typescript' }, function () {

	{
		const root = join(__dirname, '../test/simulation/fixtures/tests/panel/tsq');
		const path = join(root, 'workspaceState.state.json');

		stest('can consume #file without active editor',
			generateScenarioTestRunner([{
				name: 'can consume #file without active editor',
				question: '/tests test #file:foo.ts',
				scenarioFolderPath: root,
				stateFile: path,
				getState: () => deserializeWorkbenchState(dirname(path), path),
			}], async (accessor, question, answer) => {

				try {
					assert.ok(
						['test', 'suite', 'describe', 'it'].some(x => answer.includes(x)),
						'includes one of test, suite, describe, it with an opening parenthesis'
					);

					assert.ok(
						(answer.includes('subtract') || answer.includes('add') || answer.includes('multiply')),
						'includes one of subtract, add, multiply'
					);
				} catch (e) {
					return { success: false, errorMessage: e.message };
				}

				return { success: true, };
			}));
	}
});
