/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Intent } from '../../../src/extension/common/constants';
import { IRelativeFile } from '../../../src/platform/test/node/simulationWorkspace';
import { Uri } from '../../../src/vscodeTypes';
import { ssuite, stest } from '../../base/stest';
import { simulateInlineChat } from '../inlineChatSimulator';
import { assertNoStrings, assertSomeStrings, assertWorkspaceEdit, fromFixture } from '../stestUtil';
import { getFileContent } from '../outcomeValidators';

ssuite({ title: '/tests', location: 'inline', language: 'js' }, () => {

	stest({ description: 'generate-jest', }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [
				fromFixture('tests/generate-jest/', 'some/sum.test.js'),
				fromFixture('tests/generate-jest/', 'some/sum.js'),
				fromFixture('tests/generate-jest/', 'some/app.js'),
			],
			queries: [{
				file: 'some/app.js',
				selection: [3, 0, 7, 1],
				query: '/tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					assertWorkspaceEdit(outcome);

					assert.strictEqual(outcome.files.length, 1);

					const [first] = outcome.files;
					assertSomeStrings(getFileContent(first), ['test', 'expect', 'toBe', 'sum', 'app.js']);
				}
			}],
		});
	});

	stest({ description: 'add another test to existing file', }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [
				fromFixture('tests/generate-jest/', 'some/sum.test.js'),
				fromFixture('tests/generate-jest/', 'some/sum.js'),
				fromFixture('tests/generate-jest/', 'some/app.js'),
			],
			queries: [{
				file: 'some/sum.js',
				selection: [4, 20],
				query: '/tests',
				expectedIntent: Intent.Tests,
				validate: async (outcome, workspace, accessor) => {
					assertWorkspaceEdit(outcome);

					assert.strictEqual(outcome.files.length, 1);

					const [first] = outcome.files;
					assert.strictEqual((<IRelativeFile>first).fileName, 'sum.test.js');
					assertSomeStrings(getFileContent(first), ['test', 'expect', 'toBe', 'subtract']);
					assertNoStrings(getFileContent(first), ['import']);

				}
			}],
		});
	});

	stest({ description: '/tests: with package.json info', }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [
				fromFixture('tests/simple-js-proj/src/index.js'),
				fromFixture('tests/simple-js-proj/package.json'),
			],
			queries: [
				{
					file: 'index.js',
					selection: [0, 0, 2, 1],
					query: '/tests',
					expectedIntent: Intent.Tests,
					validate: async (outcome, workspace, accessor) => {
						assert.strictEqual(outcome.type, 'workspaceEdit');
					},
				},
			],
		});
	});

	stest({ description: 'issue #1261: Failed to create new test file when in an untitled file', }, (testingServiceCollection) => {
		const uri = Uri.parse('untitled:Untitled-1');
		return simulateInlineChat(testingServiceCollection, {
			files: [{
				kind: 'qualifiedFile',
				uri,
				fileContents: 'function sum(a, b) {\n\treturn a + b;\n}\n\n',
				languageId: 'javascript'
			}],
			queries: [
				{
					file: uri,
					selection: [4, 0],
					query: 'Write a test for this function',
					expectedIntent: Intent.Tests,
					validate: async (outcome, workspace, accessor) => {
						assertWorkspaceEdit(outcome);
						assert.strictEqual(outcome.files.length, 1);
						const file = outcome.files[0];

						// Check if it's the old format (with kind and uri)
						if ('kind' in file && 'uri' in file) {
							assert.strictEqual(file.kind, 'qualifiedFile');
							assert.strictEqual(file.uri.scheme, 'untitled');
						}
						// Otherwise if it's the new format (with srcUri)
						else if ('srcUri' in file) {
							assert.ok(file.srcUri.startsWith('untitled:'), 'URI should be untitled scheme');
						}

						// Use getFileContent to get the content regardless of format
						const content = getFileContent(file);
						assert.strictEqual(content.includes('// BEGIN:'), false);
						assert.strictEqual(content.includes('// END:'), false);
					},
				},
			],
		});
	});

});
