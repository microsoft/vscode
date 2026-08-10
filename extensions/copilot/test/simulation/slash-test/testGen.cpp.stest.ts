/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Intent } from '../../../src/extension/common/constants';
import { ssuite, stest } from '../../base/stest';
import { forInline, simulateInlineChatWithStrategy } from '../inlineChatSimulator';
import { assertWorkspaceEdit, fromFixture } from '../stestUtil';

forInline((strategy, nonExtensionConfigurations, suffix) => {

	ssuite({ title: `/tests${suffix}`, location: 'inline', language: 'cpp', nonExtensionConfigurations }, () => {

		stest({ description: 'can create a new test file' }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('cpp/basic/main.cpp'),
				],
				queries: [{
					file: 'main.cpp',
					selection: [10, 16],
					query: '/tests',
					expectedIntent: Intent.Tests,
					validate: async (outcome, workspace, accessor) => {
						assertWorkspaceEdit(outcome);
						assert.strictEqual(outcome.files.length, 1);
					}
				}]
			});
		});
	});
});
