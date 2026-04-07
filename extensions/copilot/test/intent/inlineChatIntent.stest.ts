/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { join } from 'path';
import { Intent } from '../../src/extension/common/constants';
import { InlineDocIntent } from '../../src/extension/intents/node/docIntent';
import { EditCodeIntent } from '../../src/extension/intents/node/editCodeIntent';
import { GenerateCodeIntent } from '../../src/extension/intents/node/generateCodeIntent';
import { ChatLocation } from '../../src/platform/chat/common/commonTypes';
import { ssuite, stest } from '../base/stest';
import { simulateInlineChat } from '../simulation/inlineChatSimulator';
import { fromFixture } from '../simulation/stestUtil';
import { generateIntentTest } from './intentTest';

ssuite({ title: 'intent', location: 'inline' }, () => {
	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'convert',
		query: 'convert private property to lowercase',
		expectedIntent: EditCodeIntent.ID,
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'log to console',
		query: 'log to console in case the action is missing',
		// Actually gives Explain
		expectedIntent: [EditCodeIntent.ID, GenerateCodeIntent.ID],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'add a cat',
		query: 'Add a cat to this comment',
		// Actually gives Unknown
		expectedIntent: [EditCodeIntent.ID, GenerateCodeIntent.ID],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'make simpler',
		query: 'make simpler',
		expectedIntent: [EditCodeIntent.ID, Intent.Fix],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'add comment',
		query: 'add comment',
		expectedIntent: InlineDocIntent.ID,
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'generate',
		query: 'generate a nodejs server that responds with "Hello World"',
		expectedIntent: GenerateCodeIntent.ID,
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'rewrite',
		query: 'Rewrite the selection to use async/await',
		expectedIntent: EditCodeIntent.ID,
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'write jsdoc',
		query: 'write a jsdoc comment',
		expectedIntent: InlineDocIntent.ID,
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'print',
		query: 'print seconds in a week',
		expectedIntent: [EditCodeIntent.ID, GenerateCodeIntent.ID],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'add a column to dataframe',
		query: 'add a new column called adjusted to the dataframe and set it to the value of the activity column minus 2',
		expectedIntent: [EditCodeIntent.ID, GenerateCodeIntent.ID],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'plot dataframe',
		query: 'plot the data frame',
		expectedIntent: [EditCodeIntent.ID, GenerateCodeIntent.ID],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'add test',
		query: 'add another test for containsUppercaseCharacter with other non latin chars',
		expectedIntent: 'tests',
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'add types',
		query: 'Add types to `reviewRequiredCheck`',
		expectedIntent: [EditCodeIntent.ID, GenerateCodeIntent.ID],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'issue #1126: expand comments',
		query: 'Expand comments to a full paragraph`',
		expectedIntent: [EditCodeIntent.ID, GenerateCodeIntent.ID],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'issue #1126: change to GDPR',
		query: 'change to GDPR documentation`',
		expectedIntent: [EditCodeIntent.ID, GenerateCodeIntent.ID],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: `create a vscode launch task`,
		query: `create a launch task that invokes MOCHA_GREP='Edit Generation' make test-extension`,
		expectedIntent: [EditCodeIntent.ID, GenerateCodeIntent.ID],
	});

	generateIntentTest({
		location: ChatLocation.Editor,
		name: 'create basic jest config',
		query: 'create basic jest config',
		expectedIntent: [GenerateCodeIntent.ID],
	});

	const additionalCases = JSON.parse(fs.readFileSync(join(__dirname, '../test/intent/inline-chat.json'), { encoding: 'utf8' }));
	if (additionalCases && Array.isArray(additionalCases)) {
		additionalCases.forEach((testCase: any) => {
			if (typeof testCase === 'object' && !!testCase && testCase['Location'] === 'inline') {
				const query: string = testCase['Request'];
				generateIntentTest({ location: ChatLocation.Editor, name: query.split('\n')[0], query, expectedIntent: testCase['Intent'] });
			}
		});
	}

	stest('/tests cannot be intent-detected', (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [fromFixture('notebook/fibonacci.ipynb')],
			queries: [
				{
					file: 'fibonacci.ipynb',
					activeCell: 0,
					selection: [0, 9],
					query: 'generate tests',
					expectedIntent: 'generate',
					validate: async (outcome, workspace, accessor) => {
						// @ulugbekna: left empty on purpose
					}
				}
			]
		});
	});

});
