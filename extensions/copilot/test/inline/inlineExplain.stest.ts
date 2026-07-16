/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Intent } from '../../src/extension/common/constants';
import { ssuite, stest } from '../base/stest';
import { simulateInlineChat } from '../simulation/inlineChatSimulator';
import { assertConversationalOutcome, fromFixture } from '../simulation/stestUtil';

ssuite({ title: 'explain', location: 'inline' }, () => {
	stest({ description: 'is not distracted by project context', language: 'css' }, (testingServiceCollection) => {
		return simulateInlineChat(testingServiceCollection, {
			files: [
				fromFixture('explain-project-context/inlineChat.css'),
				fromFixture('explain-project-context/package.json'),
				fromFixture('explain-project-context/tsconfig.json'),
			],
			queries: [
				{
					file: 'inlineChat.css',
					selection: [152, 0, 158, 1],
					query: 'explain',
					expectedIntent: Intent.Explain,
					validate: async (outcome, workspace, accessor) => {
						assertConversationalOutcome(outcome);
						const css = outcome.chatResponseMarkdown.indexOf('CSS');
						assert.ok(css >= 0, 'Explanation did not mention CSS');
					}
				}
			],
		});
	});
});
