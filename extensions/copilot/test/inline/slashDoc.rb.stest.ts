/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InlineDocIntent } from '../../src/extension/intents/node/docIntent';
import { ssuite, stest } from '../base/stest';
import { forInline, simulateInlineChatWithStrategy } from '../simulation/inlineChatSimulator';
import { assertInlineEdit, fromFixture } from '../simulation/stestUtil';
import { assertDocLinesForInlineComments } from './slashDoc.util';

function assertRubyDocComments(fileContents: string | string[], line: string) {
	assertDocLinesForInlineComments(fileContents, line, '#');
}

forInline((strategy, nonExtensionConfigurations, suffix) => {

	ssuite({ title: `/doc${suffix}`, language: 'ruby', location: 'inline' }, () => {

		stest({ description: 'method', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('doc-ruby/fib.rb'),
				],
				queries: [
					{
						file: 'fib.rb',
						selection: [14, 26],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							const fileContents = outcome.fileContents;

							// assert it contains doc comments above
							const lineWithCursor = '    def self.calculate_nth_number(n)';
							assertRubyDocComments(fileContents, lineWithCursor);
						}
					}
				],
			});
		});

		stest({ description: 'long method', nonExtensionConfigurations }, (testingServiceCollection) => {
			return simulateInlineChatWithStrategy(strategy, testingServiceCollection, {
				files: [
					fromFixture('doc-ruby/fib.rb'),
				],
				queries: [
					{
						file: 'fib.rb',
						selection: [30, 33],
						query: '/doc',
						expectedIntent: InlineDocIntent.ID,
						validate: async (outcome, workspace, accessor) => {
							assertInlineEdit(outcome);

							const fileContents = outcome.fileContents;

							// assert it contains doc comments above
							const lineWithCursor = '    def self.fibonacci_with_hardcoded_values(n)';
							assertRubyDocComments(fileContents, lineWithCursor);
						}
					}
				],
			});
		});
	});

});
