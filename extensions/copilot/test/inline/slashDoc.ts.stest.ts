/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Intent } from '../../src/extension/common/constants';
import { InlineDocIntent } from '../../src/extension/intents/node/docIntent';
import { ssuite, stest } from '../base/stest';
import { forInline, simulateInlineChatWithStrategy } from '../simulation/inlineChatSimulator';
import { assertLooksLikeJSDoc, assertNoSyntacticDiagnosticsAsync } from '../simulation/outcomeValidators';
import { assertInlineEdit, assertInlineEditShape, fromFixture } from '../simulation/stestUtil';
import { assertDocLines } from './slashDoc.util';

forInline((strategy, nonExtensionConfigurations, suffix) => {

	ssuite({ title: `/doc${suffix}`, location: 'inline', language: 'typescript' }, () => {

		stest({ description: 'large function', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('doc-ts-large-fn/resolver.ts'),
				],
				queries: [
					{
						file: 'resolver.ts',
						selection: [0, 10],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.ok(
								outcome.fileContents.includes(`*/\nfunction handleRemovals(rules: ResolvedKeybindingItem[]): ResolvedKeybindingItem[] {\n\t// Do a first pass and construct a hash-map for removals`),
								`keeps the original function's 1st line with its comment below`
							);
							assert.ok(
								!outcome.fileContents.includes(`function handleRemovals(rules: ResolvedKeybindingItem[]): ResolvedKeybindingItem[] {\n\t// implementation`),
								`makes correct edit`
							);
							assert.ok(
								!outcome.fileContents.includes(`function handleRemovals(rules: ResolvedKeybindingItem[]): ResolvedKeybindingItem[] {\n\t// ...`),
								`makes correct edit - 2`
							);
						},
					}
				],
			});
		});

		stest({ description: 'interface', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('doc-ts-interface/codeImportPatterns.ts'),
				],
				queries: [
					{
						file: 'codeImportPatterns.ts',
						selection: [18, 18],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							assertDocLines(outcome.fileContents, 'interface RawImportPatternsConfig ');

							assert.strictEqual([...outcome.fileContents.matchAll(/target: string/g)].length, 3, 'detected block duplication');
						}
					}
				],
			});
		});

		stest({ description: 'class', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('doc-ts-class/keybindingResolver.ts'),
				],
				queries: [
					{
						file: 'keybindingResolver.ts',
						selection: [37, 15],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							const fileContents = outcome.fileContents;

							// no duplication of declaration
							assert.strictEqual([...fileContents.matchAll(/class KeybindingResolver \{/g)].length, 1);

							// no block bodies with a single comment
							assert.strictEqual([...fileContents.matchAll(/\/\/ \.\.\./g)].length, 0, 'no // ...');
							assert.strictEqual([...fileContents.matchAll(/implementation/g)].length, 0);

							// assert it contains doc comments above
							const lineWithCursor = 'export class KeybindingResolver';
							assertDocLines(fileContents, lineWithCursor);
						}
					}
				],
			});
		});

		stest({ description: 'able to document whole class, which is larger than context length', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('doc-ts-class-full/keybindingResolver.ts'),
				],
				queries: [
					{
						file: 'keybindingResolver.ts',
						selection: [37, 15],
						query: '/doc the whole class',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							const fileContents = outcome.fileContents;

							// no duplication of declaration
							assert.strictEqual([...fileContents.matchAll(/class KeybindingResolver/g)].length, 1);

							// no block bodies with a single comment
							assert.strictEqual([...fileContents.matchAll(/\/\/ \.\.\./g)].length, 0, 'no // ...');
							assert.strictEqual([...fileContents.matchAll(/implementation/g)].length, 0);

							// assert it contains doc comments above
							const fileLines = fileContents.split('\n');

							assertDocLines(fileLines, 'export class KeybindingResolver');
							assertDocLines(fileLines, '	private static _isTargetedForRemoval');
							assertDocLines(fileLines, '	public getDefaultBoundCommands()');

						}
					}
				],
			});
		});

		stest({ description: 'does not include types in the documentation comment - function', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('vscode/src/vs/workbench/api/common/extHostChat.ts'),
				],
				queries: [
					{
						file: 'extHostChat.ts',
						selection: [277, 8],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							const fileContents = outcome.fileContents;

							// no duplication of declaration
							assert.strictEqual([...fileContents.matchAll(/registerSlashCommandProvider\(extension: Readonly<IRelaxedExtensionDescription>, chatProviderId: string, provider: vscode.InteractiveSlashCommandProvider\): vscode.Disposable \{/g)].length, 1);

							// assert it contains doc comments above
							const lineWithCursor = '	registerSlashCommandProvider(extension: Readonly<IRelaxedExtensionDescription>, chatProviderId: string, provider: vscode.InteractiveSlashCommandProvider): vscode.Disposable {';
							assertDocLines(fileContents, lineWithCursor, line => assert.ok(!line.match(/\{(function|string|AssertionError)\}/)));
						}
					}
				],
			});
		});

		stest({ description: 'issue #3692: add jsdoc comment - colors.ts', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('doc-hello-world/colors.ts')],
				queries: [
					{
						file: 'colors.ts',
						selection: [66, 0, 68, 1],
						query: 'write a jsdoc comment',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertDocLines(outcome.fileContents, 'export function helloWorld() {');
						},
					},
				],
			});
		});

		stest({ description: 'issue #3692: add jsdoc comment using /doc - colors.ts', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [fromFixture('doc-hello-world/colors.ts')],
				queries: [
					{
						file: 'colors.ts',
						selection: [66, 0, 68, 1],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							assertDocLines(outcome.fileContents, 'export function helloWorld() {');
						},
					},
				],
			});
		});

		stest({ description: 'issue #3763: doc everywhere', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('doc-everywhere-issue-3763/githubServer.ts'),
				],
				queries: [
					{
						file: 'githubServer.ts',
						selection: [14, 0, 14, 105],
						query: 'Add jsdoc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, {
								line: 14,
								originalLength: 0,
								modifiedLength: undefined,
							});
							assertLooksLikeJSDoc(edit.changedModifiedLines.join('\n'));
						},
					},
				],
			});
		});

		stest({ description: 'doc explain ts code', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('doc-explain-ts-code/charCode.ts'),
					fromFixture('doc-explain-ts-code/strings.ts'),
				],
				queries: [
					{
						file: 'strings.ts',
						selection: [7, 16, 27, 0],
						query: 'write jsdoc for it',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							await assertNoSyntacticDiagnosticsAsync(accessor, outcome, workspace, 'tsc');
							const edit = assertInlineEditShape(outcome, {
								line: 7,
								originalLength: 0,
								modifiedLength: undefined,
							});
							assertLooksLikeJSDoc(edit.changedModifiedLines.join('\n'));
						},
					},
					{
						query: 'explain this',
						expectedIntent: Intent.Explain,
						validate: async (outcome, workspace, accessor) => {
							assert.equal(outcome.type, 'conversational');
						}
					}
				],
			});
		});

		stest({ description: 'issue #6406', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('doc/issue-6406/debugModel.ts'),
				],
				queries: [
					{
						file: 'debugModel.ts',
						selection: [36, 20],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							// Assert we get back a single inline edit that does not remove any existing text from the file.
							assertInlineEdit(outcome);
							const edit = assertInlineEditShape(outcome, {
								line: 36,
								originalLength: 0,
								modifiedLength: undefined,
							});
							assertLooksLikeJSDoc(edit.changedModifiedLines.join('\n'));
						},
					},
				],
			});
		});

		stest({ description: 'supports chat variables', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/simple-ts-proj/src/index.ts'),
					fromFixture('tests/simple-ts-proj/src/math.ts'),
				],
				queries: [
					{
						file: 'index.ts',
						selection: [0, 17],
						query: '/doc keep in mind #file:math.ts',
						expectedIntent: Intent.Tests,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);
							assert.ok(/subtract/i.test(outcome.fileContents), 'contains math.ts content');
						},
					},
				],
			});
		});
	});

});
