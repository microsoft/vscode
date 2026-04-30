/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import { Intent } from '../../../src/extension/common/constants';
import { URI } from '../../../src/util/vs/base/common/uri';
import { ssuite, stest } from '../../base/stest';
import { forInline, simulateInlineChatWithStrategy } from '../inlineChatSimulator';
import { getFileContent } from '../outcomeValidators';
import { assertWorkspaceEdit, fromFixture } from '../stestUtil';


forInline((strategy, nonExtensionConfigurations, suffix) => {

	ssuite({ title: `/tests${suffix}`, location: 'inline', language: 'java', nonExtensionConfigurations }, () => {

		stest({ description: 'looks up pom.xml and junit framework info', }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				workspaceFolders: [
					URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/java-example-project'))
				],
				files: [
					fromFixture('tests/java-example-project', 'src/main/java/com/example/MyCalculator.java'),
				],
				queries: [{
					file: 'src/main/java/com/example/MyCalculator.java',
					selection: [4, 15],
					query: '/tests',
					expectedIntent: Intent.Tests,
					validate: async (outcome, workspace, accessor) => {
						assertWorkspaceEdit(outcome);
						assert.strictEqual(outcome.files.length, 1, 'Expected one file to be created');
						assert.ok(
							getFileContent(outcome.files[0]).includes('import org.junit.jupiter.api.Test;') || // JUnit 5 -- TODO@ulugbekna: we can't yet parse versions of test frameworks
							getFileContent(outcome.files[0]).includes('import org.junit.Test;') // JUnit 4
						);
					}
				}],
			});
		});

		stest({ description: 'looks up existing test file', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				workspaceFolders: [
					URI.file(path.join(__dirname, '../test/simulation/fixtures/tests/java-example-project-with-existing-test-file'))
				],
				files: [
					fromFixture('tests/java-example-project-with-existing-test-file', 'src/main/java/com/example/MyCalculator.java'),
				],
				queries: [{
					file: 'src/main/java/com/example/MyCalculator.java',
					selection: [4, 15],
					query: '/tests',
					expectedIntent: Intent.Tests,
					validate: async (outcome, workspace, accessor) => {
						assertWorkspaceEdit(outcome);
						assert.strictEqual(outcome.files.length, 1, 'Expected one file to be created');
						assert.ok(
							getFileContent(outcome.files[0]).includes('test #2')
						);
					}
				}],
			});
		});

	});

});
