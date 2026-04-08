/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { InlineDocIntent } from '../../src/extension/intents/node/docIntent';
import { ssuite, stest } from '../base/stest';
import { forInline, simulateInlineChatWithStrategy } from '../simulation/inlineChatSimulator';
import { assertInlineEdit, fromFixture } from '../simulation/stestUtil';
import { assertDocLines } from './slashDoc.util';

forInline((strategy, nonExtensionConfigurations, suffix) => {

	ssuite({ title: `/doc${suffix}`, language: 'java', location: 'inline' }, () => {

		stest({ description: 'class', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tlaplus/toolbox/org.lamport.tla.toolbox.doc/src/org/lamport/tla/toolbox/doc/HelpActivator.java'),
				],
				queries: [
					{
						file: 'HelpActivator.java',
						selection: [30, 21],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							const fileContents = outcome.fileContents;

							// no duplication of declaration
							assert.strictEqual([...fileContents.matchAll(/class HelpActivator/g)].length, 1);

							// no block bodies with a single comment
							assert.strictEqual([...fileContents.matchAll(/\/\/ \.\.\./g)].length, 0, 'no // ...');
							assert.strictEqual([...fileContents.matchAll(/details|implementation/g)].length, 1);

							// assert it contains doc comments above
							const lineWithCursor = 'public class HelpActivator';
							assertDocLines(fileContents, lineWithCursor);
						}
					}
				],
			});
		});

		stest({ description: 'method', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('tlaplus/toolbox/org.lamport.tla.toolbox.doc/src/org/lamport/tla/toolbox/doc/HelpActivator.java'),
				],
				queries: [
					{
						file: 'HelpActivator.java',
						selection: [40, 0, 43, 1],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							const fileContents = outcome.fileContents;

							// assert it contains doc comments above
							const lineWithCursor = '	public void start(BundleContext context) throws Exception {';
							assertDocLines(fileContents, lineWithCursor);
						}
					}
				],
			});
		});

	});

});
