/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Intent } from '../../../src/extension/common/constants';
import { isQualifiedFile, isRelativeFile } from '../../../src/platform/test/node/simulationWorkspace';
import { Schemas } from '../../../src/util/vs/base/common/network';
import { ssuite, stest } from '../../base/stest';
import { forInline, simulateInlineChatWithStrategy } from '../inlineChatSimulator';
import { getFileContent } from '../outcomeValidators';
import { assertSomeStrings, assertWorkspaceEdit, fromFixture } from '../stestUtil';

forInline((strategy, nonExtensionConfigurations, suffix) => {

	ssuite({ title: `/tests${suffix}`, location: 'inline', language: 'csharp', nonExtensionConfigurations }, () => {

		stest({ description: 'creates new test file with some assertions and uses correct file name', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tests/cs-newtest/', 'src/services/Model.cs'),
				],
				queries: [{
					file: 'src/services/Model.cs',
					selection: [4, 8, 4, 8],
					query: '/tests',
					expectedIntent: Intent.Tests,
					validate: async (outcome, workspace, accessor) => {
						assertWorkspaceEdit(outcome);

						assert.strictEqual(outcome.files.length, 1);

						const [first] = outcome.files;

						assertSomeStrings(getFileContent(first), ['Assert', 'Test', 'MyObject', 'MyMethod']);
						if (isQualifiedFile(first)) {
							assert.strictEqual(first.uri.scheme, Schemas.untitled);
							assert.ok(first.uri.path.endsWith('ModelTest.cs'));
						} else if (isRelativeFile(first)) {
							assert.ok(first.fileName.endsWith('ModelTest.cs'));
						}
					}
				}]
			});
		});

	});

});
