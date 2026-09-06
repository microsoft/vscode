/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as fs from 'fs';
import '../../src/extension/intents/node/allIntents'; // make sure all intents are registered
import { ChatLocation } from '../../src/platform/chat/common/commonTypes';
import { join } from '../../src/util/vs/base/common/path';
import { ssuite } from '../base/stest';
import { generateIntentTest } from './intentTest';

ssuite({ title: 'intent', location: 'panel' }, () => {
	runAdditionalCases(join(__dirname, '../test/intent/panel-chat.json'));
	// Uncomment this line to run additional intent detection tests
	// runAdditionalCases(join(__dirname, '../test/intent/panel-chat-github.json'));
	// runAdditionalCases(join(__dirname, '../test/intent/panel-chat-unknown.json'));
});

function runAdditionalCases(sourceFile: string) {
	const additionalCases = JSON.parse(fs.readFileSync(sourceFile, { encoding: 'utf8' }));
	if (additionalCases && Array.isArray(additionalCases)) {
		additionalCases.forEach((testCase: any) => {
			if (typeof testCase === 'object' && !!testCase && testCase['Location'] === 'panel') {
				const query = testCase['Request'];
				const expectedIntent = testCase['Intent'];
				for (const strictMode of [true, false]) {
					generateIntentTest({
						location: ChatLocation.Panel,
						name: (strictMode ? '[strict] ' : '[relaxed] ') + `[${expectedIntent === 'github' ? 'github' : 'builtin'}] ` + query,
						query,
						expectedIntent: (['workspace', 'vscode', 'new', 'newNotebook', 'unknown', 'tests', 'setupTests', 'terminalExplain', 'github.copilot-dynamic.platform'].includes(expectedIntent)
							? (strictMode ? expectedIntent : [expectedIntent, 'unknown'])
							: 'unknown'),
					});
				}
			}
		});
	}
}
