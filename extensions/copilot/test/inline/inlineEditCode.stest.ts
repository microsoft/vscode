/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { EditCodeIntent } from '../../src/extension/intents/node/editCodeIntent';
import { TestingServiceCollection } from '../../src/platform/test/node/services';
import { Selection } from '../../src/vscodeTypes';
import { NonExtensionConfiguration, ssuite, stest } from '../base/stest';
import { KnownDiagnosticProviders } from '../simulation/diagnosticProviders';
import { simulateInlineChat, simulateInlineChatIntent } from '../simulation/inlineChatSimulator';
import { assertContainsAllSnippets, assertNoDiagnosticsAsync, assertNoElidedCodeComments, assertNoSyntacticDiagnosticsAsync, findTextBetweenMarkersFromTop } from '../simulation/outcomeValidators';
import { simulatePanelCodeMapper } from '../simulation/panelCodeMapperSimulator';
import { assertInlineEdit, assertInlineEditShape, assertNoOccurrence, assertOccursOnce, assertSomeStrings, extractInlineReplaceEdits, fromFixture, toFile } from '../simulation/stestUtil';
import { EditTestStrategy, IScenario } from '../simulation/types';

function executeEditTest(
	strategy: EditTestStrategy,
	testingServiceCollection: TestingServiceCollection,
	scenario: IScenario
): Promise<void> {
	if (strategy === EditTestStrategy.Inline) {
		return simulateInlineChat(testingServiceCollection, scenario);
	} else if (strategy === EditTestStrategy.InlineChatIntent) {
		return simulateInlineChatIntent(testingServiceCollection, scenario);
	} else {
		return simulatePanelCodeMapper(testingServiceCollection, scenario, strategy);
	}
}

function forInlineAndInlineChatIntent(callback: (strategy: EditTestStrategy, location: 'inline' | 'panel', variant: string | undefined, configurations?: NonExtensionConfiguration[]) => void): void {
	callback(EditTestStrategy.Inline, 'inline', '', undefined);
	callback(EditTestStrategy.InlineChatIntent, 'inline', '-InlineChatIntent', [['inlineChat.enableV2', true], ['chat.agent.autoFix', false]]);
}

forInlineAndInlineChatIntent((strategy, location, variant, nonExtensionConfigurations) => {

	ssuite({ title: `edit${variant}`, location }, () => {
		stest({ description: 'Context Outline: TypeScript between methods', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('vscode/codeEditorWidget.ts')],
				queries: [
					{
						file: 'codeEditorWidget.ts',
						selection: [211, 0, 213, 0],
						query: 'convert private property to lowercase',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assert.ok(outcome.fileContents.length > outcome.originalFileContents.length / 2, 'File was truncated');
							const edit = assertInlineEditShape(outcome, {
								line: 211,
								originalLength: 2,
								modifiedLength: 2,
							});
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['_onkeyup']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'Context Outline: TypeScript in method', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('vscode/codeEditorWidget.ts')],
				queries: [
					{
						file: 'codeEditorWidget.ts',
						selection: [1085, 2, 1089, 3],
						query: 'log to console in case the action is missing',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 1089,
								originalLength: 0,
								modifiedLength: 2,
							}, {
								line: 1090,
								originalLength: 0,
								modifiedLength: 1,
							}, {
								line: 1090,
								originalLength: 9,
								modifiedLength: 1,
							}, {
								line: 1091,
								originalLength: 0,
								modifiedLength: 2,
							}, {
								line: 1091,
								originalLength: 8,
								modifiedLength: 1,
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['console']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #404: Add a cat to a comment', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('ghpr/commands.ts')],
				queries: [
					{
						file: 'commands.ts',
						selection: [45, 0, 45, 79],
						query: 'Add a cat to this comment',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							if (outcome.type === 'conversational') {
								// ok
								assert.ok(true);
								return;
							}
							assertInlineEdit(outcome);
							assert.ok(outcome.fileContents.length > outcome.originalFileContents.length / 2, 'File was truncated');
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, [{
								line: 45,
								originalLength: 1,
								modifiedLength: 1,
							}, {
								line: 46,
								originalLength: 0,
								modifiedLength: undefined,
							}]);
							assertSomeStrings(edit.changedModifiedLines.join('\n'), ['🐱', '( o.o )']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});


		stest({ description: 'issue #405: "make simpler" query is surprising', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			// SKIPPED because of the error below
			// <NO REPLY> {"type":"failed","reason":"Request Failed: 400 {\"error\":{\"message\":\"prompt token count of 13613 exceeds the limit of 12288\",\"code\":\"model_max_prompt_tokens_exceeded\"}}\n","requestId":"2e91a4a5-366b-4cae-b9c8-cce59d06a7bb","serverRequestId":"EA6B:3DFF07:151BC22:18DE2D8:68F22ED4","isCacheHit":false,"copilotFunctionCalls":[]}
			if (1) {
				throw new Error('SKIPPED');
			}

			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('vscode/extHost.api.impl.ts')],
				queries: [
					{
						file: 'extHost.api.impl.ts',
						selection: [696, 0, 711, 0],
						query: 'make simpler',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							if (outcome.type === 'conversational') {
								// acceptable
								assert.ok(true);
								return;
							}
							assertInlineEdit(outcome);
							assert.ok(outcome.fileContents.length > outcome.originalFileContents.length / 2, 'File was truncated');
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #246: Add comment sends request to sidebar', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('vscode/vscode.proposed.notebookDocumentWillSave.d.ts')],
				queries: [
					{
						file: 'vscode.proposed.notebookDocumentWillSave.d.ts',
						selection: [52, 5, 52, 5],
						visibleRanges: [[0, 65]],
						query: 'add comment',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #4151: Rewrite the selection to use async/await', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit-asyncawait-4151/index.ts')],
				queries: [
					{
						file: 'index.ts',
						selection: [47, 0, 57, 3],
						query: 'Rewrite the selection to use async/await',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, {
								line: 47,
								originalLength: 10,
								modifiedLength: 10,
							});
							assert.deepStrictEqual(
								edit.changedModifiedLines.join('\n'),
								`app.get('/episodes/:id/summary', async (req: Request, res: Response) => {\n` +
								'	try {\n' +
								'		const response = await fetch(`${process.env.PODCAST_URL}episodes/${req.params.id}`);\n' +
								'		const json: Episode = await response.json();\n' +
								'		const summary = json.description;\n' +
								'		res.send({ summary });\n' +
								'	} catch (error) {\n' +
								'		console.log(error);\n' +
								'		res.status(500).send({ error });\n' +
								'	}'
							);
							assertNoElidedCodeComments(outcome.fileContents);
						},
					},
				],
			});
		});

		stest({ description: 'issue #4149: If ChatGPT makes the request, send only the first 20 episodes', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit-slice-4149/index.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [44, 1],
						visibleRanges: [[24, 64]],
						query: 'If ChatGPT user agent makes the request, send only the first 20 episodes',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = extractInlineReplaceEdits(outcome);
							assert.ok(edit, 'unexpected identical files');
							const newText = edit.allModifiedLines.join('\n');
							assert.ok(
								newText.includes('\'user-agent\'')
								|| newText.includes('\'User-Agent\'')
							);
							assert.ok(!newText.includes('limit: \'20\''));
							assert.ok(newText.includes('slice(0, 20)'));
							assert.ok(newText.includes('\'ChatGPT\''));
							assertNoElidedCodeComments(outcome.fileContents);
						},
					},
				],
			});
		});

		stest({ description: 'issue #3759: add type', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			// SKIPPED because of the error below
			// <NO REPLY> {"type":"failed","reason":"Request Failed: 400 {\"error\":{\"message\":\"prompt token count of 13613 exceeds the limit of 12288\",\"code\":\"model_max_prompt_tokens_exceeded\"}}\n","requestId":"2e91a4a5-366b-4cae-b9c8-cce59d06a7bb","serverRequestId":"EA6B:3DFF07:151BC22:18DE2D8:68F22ED4","isCacheHit":false,"copilotFunctionCalls":[]}
			if (1) {
				throw new Error('SKIPPED');
			}
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit-add-explicit-type-issue-3759/pullRequestModel.ts'),
				],
				queries: [
					{
						file: 'pullRequestModel.ts',
						selection: [1071, 0],
						visibleRanges: [[1051, 1091]],
						query: 'Add types to `reviewRequiredCheck`',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.ok(outcome.fileContents.length > outcome.originalFileContents.length / 2, 'File was truncated');
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, {
								line: 1071,
								originalLength: 1,
								modifiedLength: 1,
							});
							let text = findTextBetweenMarkersFromTop(edit.changedModifiedLines.join('\n'), 'const reviewRequiredCheck', '= await this._getReviewRequiredCheck();');
							assert(text);
							text = text.trim();
							assert(text.length > 3);
							assertNoElidedCodeComments(outcome.fileContents);
						},
					},
				],
			});
		});

		stest({ description: 'issue #1198: Multi-lingual queries throw off the inline response formatting', language: 'python', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit-issue-1198/main.py')],
				queries: [
					{
						file: 'main.py',
						selection: [1, 0, 7, 0],
						query: 'Translate to German',
						fileIndentInfo: { insertSpaces: true, tabSize: 4 },
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							if (outcome.type === 'conversational') {
								// This is acceptable because translating is not strictly a development action
								assert.ok(true);
								return;
							}
							assertInlineEdit(outcome);
							const expectedLines = [
								`{"id": "1", "text": "Roter Karabiner, groß, Edelstahl", "url": None},`,
								`{"id": "2", "text": "Blauer kleiner Karabiner", "url": None},`,
								[
									`{"id": "3", "text": "Ganzjahres-Wanderhose", "url": None},`,
									`{"id": "3", "text": "Ganzjahreshose zum Wandern", "url": None},`,
								],
								[
									`{"id": "4", "text": "Schwarze Lederschuhe, Größe 10", "url": None},`,
									`{"id": "4", "text": "Schwarze Lederstiefel, Größe 10", "url": None},`,
									`{"id": "4", "text": "Schwarze Lederstiefel, Größe 44", "url": None},`,
								],
								[
									`{"id": "5", "text": "Gelbe wasserdichte Jacke, mittelgroß", "url": None},`,
									`{"id": "5", "text": "Gelbe wasserdichte Jacke, mittel", "url": None},`,
									`{"id": "5", "text": "Gelbe wasserdichte Jacke, Größe M", "url": None},`,
									`{"id": "5", "text": "Gelbe wasserdichte Jacke, Medium", "url": None},`,
								],
								[
									`{"id": "6", "text": "Grünes Campingzelt, 4 Personen", "url": None}`,
									`{"id": "6", "text": "Grünes Campingzelt, 4-Personen", "url": None}`,
									`{"id": "6", "text": "Grünes Campingzelt, für 4 Personen", "url": None}`,
								]
							];
							const actualLines = outcome.fileContents.split('\n').map(s => s.trim()).slice(1, 7);
							for (let i = 0; i < expectedLines.length; i++) {
								const expected = expectedLines[i];
								const actual = actualLines[i];
								if (Array.isArray(expected)) {
									assert.ok(expected.includes(actual), `Line ${i + 2} does not match any expected variant. Actual: "${actual}"`);
								} else {
									assert.strictEqual(actual, expected);
								}
							}
							assertNoElidedCodeComments(outcome.fileContents);
						},
					},
				],
			});
		});

		stest({ description: 'refactor forloop, but only selected one', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			const selection: [number, number, number, number] = [109, 8, 125, 9];
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit-refactor-loop/index.ts')],
				queries: [{
					file: 'index.ts',
					selection: selection,
					query: 'change for-of loop to use an index',
					expectedIntent: EditCodeIntent.ID,
					validate: async (outcome, workspace, accessor) => {
						assertInlineEdit(outcome);
						await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
						const edit = assertInlineEditShape(outcome, [{
							line: 109,
							originalLength: 16,
							modifiedLength: 16,
						}, {
							line: 109,
							originalLength: 14,
							modifiedLength: 14,
						}, {
							line: 109,
							originalLength: 1,
							modifiedLength: 2,
						}]);
						assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['for (let i = 0; i < groups.length; i++)']);
						assertNoElidedCodeComments(outcome.fileContents);
					}
				}]
			});
		});

		stest({ description: 'convert ternary to if/else in short function', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit-convert-ternary-to-if-else/index.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [4, 28],
						visibleRanges: [[0, 14]],
						query: 'convert to if/else',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertInlineEdit(outcome);
							// Only the ternary expression should be replaced
							const edit = assertInlineEditShape(outcome, [{
								line: 4,
								originalLength: 1,
								modifiedLength: undefined,
							}, {
								line: 4,
								originalLength: 3,
								modifiedLength: undefined,
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['if', 'else']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'edit: add toString1', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit-add-toString/index.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [53, 1],
						visibleRanges: [[33, 73]],
						query: 'add toString',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertInlineEdit(outcome);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'edit: add toString2', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit-add-toString2/index.ts')
				],
				queries: [
					{
						file: 'index.ts',
						selection: [54, 1],
						visibleRanges: [[34, 74]],
						query: 'add toString()',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertInlineEdit(outcome);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'edit: add enum variant', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit-add-enum-variant/index.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [8, 9],
						visibleRanges: [[0, 32]],
						query: 'add enum variant NearBottom',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertInlineEdit(outcome);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		function verifyTsImportStatementsAreTogether(fileContents: string): boolean {
			const lines = fileContents.split('\n');
			let i = 0;
			while (i < lines.length && !lines[i].trim().startsWith('import ')) {
				i++;
			}
			while (i < lines.length && lines[i].trim().startsWith('import ')) {
				i++;
			}
			while (i < lines.length && !lines[i].trim().startsWith('import ')) {
				i++;
			}
			if (lines.length !== i) {
				return false;
			}
			return true;
		}

		stest({ description: 'edit: import assert', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit-import-assert/index.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [47, 14],
						query: 'use the assert library to check that element is defined',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert(verifyTsImportStatementsAreTogether(outcome.fileContents));
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'edit: import assert 2', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit-import-assert2/index.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [5, 0],
						query: 'use assert to check that file is defined',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');

							function countOccurences(str: string, substr: string): number {
								return str.split(substr).length - 1;
							}

							assert.deepStrictEqual(
								countOccurences(outcome.fileContents, 'ises'),
								countOccurences(outcome.fileContents, 'promises')
							);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #2431: Inline Chat follow-up tweak ends up in noop text-only answer', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('vscode/editorGroupWatermark.ts'),
				],
				queries: [
					{
						file: 'editorGroupWatermark.ts',
						selection: [24, 0],
						query: 'Add a title to each entry, expanding what the feature does',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertNoElidedCodeComments(outcome.fileContents);
						},
					},
					{
						query: 'use localize and ALL CAPS for the title',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertNoElidedCodeComments(outcome.fileContents);
						},
					}
				],
			});
		});

		stest({ description: 'Inline chat does not leak system prompt', language: 'json', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('gen-json/test.json'),
				],
				queries: [
					{
						file: 'test.json',
						selection: [0, 0],
						query: 'edit this file to contain json, use tabs',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							['assistant', 'Microsoft', 'AI'].forEach((text) => {
								assert.strictEqual(outcome.fileContents.includes(text), false);
							});
							assertNoElidedCodeComments(outcome.fileContents);
						},
					}
				],
			});
		});

		stest({ description: 'Inline chat touching code outside of my selection #2988', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {

			const selection = new Selection(107, 1, 132, 7);

			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/issue-2988/pseudoStartStopConversationCallback.test.ts'),
				],
				queries: [
					{
						file: 'pseudoStartStopConversationCallback.test.ts',
						selection: [selection.start.line, selection.start.character, selection.end.line, selection.end.character],
						query: 'rewrite these asserts as one assert on an array',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');

							assertInlineEditShape(outcome, [{
								line: 123,
								originalLength: 9,
								modifiedLength: undefined,
							}, {
								line: 125,
								originalLength: 7,
								modifiedLength: undefined,
							}, {
								line: 125,
								originalLength: 9,
								modifiedLength: undefined,
							}]);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'Inline chat touching code outside of my selection #2988 with good selection', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {

			const selection = new Selection(125, 0, 132, 0);

			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/issue-2988/pseudoStartStopConversationCallback.test.ts'),
				],
				queries: [
					{
						file: 'pseudoStartStopConversationCallback.test.ts',
						selection: [selection.start.line, selection.start.character, selection.end.line, selection.end.character],
						query: 'rewrite these asserts as one assert on an array',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');

							const edit = assertInlineEditShape(outcome, [{
								line: 125,
								originalLength: 7,
								modifiedLength: undefined,
							}, {
								line: 125,
								originalLength: 9,
								modifiedLength: undefined,
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['assert.deepStrictEqual', '[', ']']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #2946: Inline chat markers don\'t work', language: 'javascript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('editing/math.js'),
				],
				queries: [
					{
						file: 'math.js',
						selection: [17, 0, 32, 1],
						query: 'use recursion',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							const edit = assertInlineEditShape(outcome, [{
								line: 21,
								originalLength: 11,
								modifiedLength: 1,
							}, {
								line: 22,
								originalLength: 10,
								modifiedLength: 1,
							}]);
							assertContainsAllSnippets(edit.changedModifiedLines[0], ['return', 'doSomething', 'n - 1', 'n - 2']);
							assertInlineEdit(outcome);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'issue #3257: Inline chat ends up duplicating code', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('editing/mainThreadChatAgents2.ts'),
				],
				queries: [
					{
						file: 'mainThreadChatAgents2.ts',
						selection: [100, 3],
						visibleRanges: [[80, 120]],
						query: 'add a function for welcome message',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							const edit = assertInlineEditShape(outcome, {
								line: 100,
								originalLength: 1,
								modifiedLength: undefined,
							});
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), [': async']);
							assertInlineEdit(outcome);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'issue release#275: Inline Diff refinement causes massive duplication of code', language: 'csharp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/issue-release-275/BasketService.cs')
				],
				queries: [
					{
						file: 'BasketService.cs',
						selection: [0, 0, 83, 1],
						query: 'replace ardalis guard classes with vanilla null checking and remove dependency on ardalis throughout the class',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							assertOccursOnce(outcome.fileContents, 'public class BasketService');
							const fileContentsWithoutComments = outcome.fileContents.replace(/\/\/.*/g, '');
							assertNoOccurrence(fileContentsWithoutComments, 'using Ardalis.GuardClauses;');
							assertNoOccurrence(fileContentsWithoutComments, 'using Ardalis.Result;');
							assert.ok(outcome.fileContents.split(/\r\n|\r|\n/g).length < 95, 'file stays under 95 lines');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'issue #5755: Inline edits go outside the selection', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/issue-5755/vscode.proposed.chatParticipantAdditions.d.ts')
				],
				queries: [
					{
						file: 'vscode.proposed.chatParticipantAdditions.d.ts',
						selection: [158, 0, 166, 0],
						query: 'make the comment more readable',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertInlineEditShape(outcome, [{
								line: 159,
								originalLength: 2,
								modifiedLength: 2,
							}, {
								line: 159,
								originalLength: 4,
								modifiedLength: 4,
							}, {
								line: 159,
								originalLength: 5,
								modifiedLength: 4,
							}, {
								line: 159,
								originalLength: 4,
								modifiedLength: 5,
							}, {
								line: 162,
								originalLength: 1,
								modifiedLength: 1,
							}]);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'issue #4302: Code doesn\'t come with backticks', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/4302.ts')
				],
				queries: [
					{
						file: '4302.ts',
						selection: [12, 0, 23, 0],
						query: 'put it all in one line',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							const edit = assertInlineEditShape(outcome, {
								line: 12,
								originalLength: 11,
								modifiedLength: undefined,
							});
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['clojure', 'coffeescript', 'fsharp', 'latex', 'markdown', 'pug', 'python', 'sql', 'yaml']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'issue #5710: Code doesn\'t come with backticks', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/5710.ts')
				],
				queries: [
					{
						file: '5710.ts',
						selection: [7, 66, 10, 5],
						query: 'Implement the stubbed-out class members for BinaryExpression with a useful implementation.',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, {
								line: 9,
								originalLength: 1,
								modifiedLength: 1,
							});
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['this.left', 'this.operator', 'this.right']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'issue #3575: Inline Chat in function expands to delete whole file', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/3575.ts')
				],
				queries: [
					{
						file: '3575.ts',
						selection: [51, 9, 51, 9],
						visibleRanges: [[14, 54]],
						query: 'make faster',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertInlineEditShape(outcome, [{
								line: 47,
								originalLength: 4,
								modifiedLength: undefined,
							}, {
								line: 47,
								originalLength: 5,
								modifiedLength: undefined,
							}, {
								line: 45,
								originalLength: 9,
								modifiedLength: 1,
							}, {
								line: 39,
								originalLength: 13,
								modifiedLength: undefined,
							}, {
								line: 39,
								originalLength: 15,
								modifiedLength: undefined,
							}, {
								line: 46,
								originalLength: 6,
								modifiedLength: undefined,
							}]);
							// assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['break']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'edit for cpp', language: 'cpp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('cpp/basic/main.cpp')
				],
				queries: [
					{
						file: 'main.cpp',
						selection: [4, 0, 17, 0],
						query: 'add a parameter to getName that controls whether or not to ask for a last name',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertContainsAllSnippets(outcome.fileContents, ['bool', 'lastName', 'if']);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'cpp');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'edit for macro', language: 'cpp', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('cpp/headers/abi_macros.hpp'),
				],
				queries: [
					{
						file: 'abi_macros.hpp',
						selection: [0, 0, 100, 0],
						query: 'Update the version to 4.2.4',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertContainsAllSnippets(outcome.fileContents, ['#define NLOHMANN_JSON_VERSION_MAJOR 4', '#define NLOHMANN_JSON_VERSION_MINOR 2', '#define NLOHMANN_JSON_VERSION_PATCH 4']);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'cpp');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'merge markdown sections', language: 'markdown', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/markdown/README.md')
				],
				queries: [
					{
						file: 'README.md',
						selection: [11, 0, 32, 0],
						query: 'merge these two sections in a single one',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertContainsAllSnippets(outcome.fileContents, ['npm install monaco-editor\n```']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'issue #5899: make this code more efficient inside markdown', language: 'markdown', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/markdown/explanation.md')
				],
				queries: [
					{
						file: 'explanation.md',
						selection: [4, 0, 17, 0],
						visibleRanges: [[0, 23]],
						query: 'make this code more efficient',
						expectedIntent: EditCodeIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertOccursOnce(outcome.fileContents, 'Here is an example');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				],
			});
		});

		stest({ description: 'issue #6276', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/6276.ts')
				],
				queries: [
					{
						file: '6276.ts',
						selection: [162, 0, 163, 39],
						query: 'declare as fields',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);
							assertInlineEdit(outcome);
							assert.ok(outcome.fileContents.length > outcome.originalFileContents.length / 2, 'File was truncated');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #7487', language: 'typescriptreact', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/issue-7487/EditForm.tsx')
				],
				queries: [
					{
						file: 'EditForm.tsx',
						selection: [138, 0, 147, 17],
						query: 'smaller lighter text with more padding',
						diagnostics: 'tsc',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertInlineEditShape(outcome, [{
								line: 142,
								originalLength: 1,
								modifiedLength: 1,
							}]);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #6329', language: 'javascript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [toFile({
					filePath: fromFixture('edit/issue-6329/math.js')
				})],
				queries: [
					{
						file: 'math.js',
						selection: [36, 0, 36, 0],
						query: 'use assert lib from nodejs to check that N is positive',
						diagnostics: 'tsc',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertInlineEdit(outcome);
							assertOccursOnce(outcome.fileContents, 'isPrime');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #7202', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/issue-7202/languageModelToolsContribution.ts')
				],
				queries: [
					{
						file: 'languageModelToolsContribution.ts',
						selection: [112, 127, 112, 127],
						visibleRanges: [[92, 132]],
						query: 'make this message match the format of the log message below',
						diagnostics: 'tsc',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');

							const edit = assertInlineEditShape(outcome, {
								line: 112,
								originalLength: 1,
								modifiedLength: 1,
							});
							assertContainsAllSnippets(edit.changedModifiedLines.join('\n'), ['Extension', 'CANNOT register']);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #6469', language: 'css', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit/issue-6469/inlineChat.css')],
				queries: [
					{
						file: 'inlineChat.css',
						selection: [80, 0, 81, 17],
						query: 'combine this',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertInlineEditShape(outcome, [{
								line: 80,
								originalLength: 2,
								modifiedLength: 1,
							}]);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #6956', language: 'javascript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('generate/issue-6956/.eslintrc.js')],
				queries: [
					{
						file: '.eslintrc.js',
						selection: [23, 6, 23, 6],
						query: 'turn prefer-const off for destructured variables',
						diagnostics: 'tsc',
						expectedIntent: 'generate',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'Issue #7282', language: 'javascript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit/issue-7282/math.js')],
				queries: [
					{
						file: 'math.js',
						selection: [1, 0, 8, 0],
						query: 'avoid recursion',
						diagnostics: 'tsc',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #6973', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [
					fromFixture('edit/issue-6973/utils.ts')
				],
				queries: [
					{
						file: 'utils.ts',
						selection: [7, 0, 17, 0],
						query: 'implement logging',
						diagnostics: 'tsc',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #7660', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('unknown/issue-7660/positionOffsetTransformer.spec.ts')],
				queries: [
					{
						file: 'positionOffsetTransformer.spec.ts',
						selection: [0, 0, 77, 0],
						query: 'convert to suite, test and assert',
						diagnostics: 'tsc',
						expectedIntent: 'unknown',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);
							const firstLine = outcome.fileContents.split('\n')[0];
							assert.ok(!firstLine.includes('import'), 'First line should not contain an import statement');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #6614', language: 'html', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit/issue-6614/workbench-dev.html')],
				queries: [
					{
						file: 'workbench-dev.html',
						selection: [75, 4, 75, 4],
						visibleRanges: [[37, 77]],
						query: 'add a style sheel from out/vs/workbench/workbench.web.main.css',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assertInlineEditShape(outcome, [{
								line: 76,
								originalLength: 0,
								modifiedLength: 1,
							}, {
								line: 75,
								originalLength: 0,
								modifiedLength: 1,
							}, {
								line: 71,
								originalLength: 0,
								modifiedLength: 1,
							}, {
								line: 72,
								originalLength: 0,
								modifiedLength: 1,
							}, {
								line: 66,
								originalLength: 0,
								modifiedLength: 1,
							}]);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'issue #6059', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit/issue-6059/serializers.ts')],
				queries: [
					{
						file: 'serializers.ts',
						selection: [202, 0, 211, 5],
						query: 'sort properties',
						diagnostics: 'tsc',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.ok(outcome.fileContents.length > outcome.originalFileContents.length / 2, 'File was truncated');
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});


		stest({ description: 'Issue #7996 - use entire context window', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit/issue-7996/codeEditorWidget.ts')],
				queries: [
					{
						file: 'codeEditorWidget.ts',
						selection: [1666, 0, 1757, 0],
						query: 'convert this to if/else',
						diagnostics: 'tsc',
						expectedIntent: 'edit',
						validate: async (outcome, workspace) => {
							assertInlineEdit(outcome);
							assert.ok(outcome.fileContents.length > outcome.originalFileContents.length / 2, 'File was truncated');
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});


		stest({ description: 'Issue #8129 (no errors)', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit/issue-8129/optimize.ts')],
				queries: [
					{
						file: 'optimize.ts',
						selection: [365, 6, 376, 79],
						query: 'adjust the sourcemaps if we have a filecontentmapper',
						diagnostics: 'tsc',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.ok(outcome.fileContents.length > outcome.originalFileContents.length / 2, 'File was truncated');
							await assertNoDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});

		stest({ description: 'Issue #8129 (no syntax errors)', language: 'typescript', nonExtensionConfigurations }, (testingServiceCollection) => {
			return executeEditTest(strategy, testingServiceCollection, {
				files: [fromFixture('edit/issue-8129/optimize.ts')],
				queries: [
					{
						file: 'optimize.ts',
						selection: [365, 6, 376, 79],
						query: 'adjust the sourcemaps if we have a filecontentmapper',
						diagnostics: 'tsc',
						expectedIntent: 'edit',
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.ok(outcome.fileContents.length > outcome.originalFileContents.length / 2, 'File was truncated');
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, KnownDiagnosticProviders.tscIgnoreImportErrors);
							assertNoElidedCodeComments(outcome.fileContents);
						}
					}
				]
			});
		});
	});
});
