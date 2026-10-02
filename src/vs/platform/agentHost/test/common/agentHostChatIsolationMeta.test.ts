/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readAgentHostChatIsolationStates } from '../../common/meta/agentHostChatIsolationMeta.js';

suite('Agent Host chat isolation metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('validates isolation progress without interpreting host chat URIs', () => {
		assert.deepStrictEqual([
			readAgentHostChatIsolationStates(undefined),
			...[true, 'isolating', ['isolating'], null].map(value => readAgentHostChatIsolationStates({ _meta: { 'vscode.chatIsolationState': value } })),
			readAgentHostChatIsolationStates({
				_meta: {
					'vscode.chatIsolationState': {
						'other-host://opaque/chat': 'isolating',
						'other-host:peer': 'blocked',
						'other-host:workspace': 'changingWorkspace',
						'other-host:invalid': true,
						'other-host:future': 'future-state',
						'': 'isolating',
					}
				}
			}),
		], [{}, {}, {}, {}, {}, { 'other-host://opaque/chat': 'isolating', 'other-host:peer': 'blocked', 'other-host:workspace': 'changingWorkspace' }]);
	});
});
