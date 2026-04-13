/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { remoteAgentHostSessionTypeId } from '../../common/remoteAgentHostSessionType.js';

suite('remoteAgentHostSessionType', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// This pins the exact wire format that spans three boundaries:
	//  - `ISession.sessionType` returned by `RemoteAgentHostSessionsProvider`
	//  - The resource URI scheme registered via `registerChatSessionContentProvider`
	//    in `remoteAgentHost.contribution.ts`
	//  - `AgentHostLanguageModelProvider.targetChatSessionType`
	// If these drift, the model picker filter
	// (`m.metadata.targetChatSessionType === session.sessionType`) stops
	// matching the remote host's own models.
	test('remoteAgentHostSessionTypeId pins the wire format', () => {
		assert.strictEqual(remoteAgentHostSessionTypeId('foo', 'copilot'), 'remote-foo-copilot');
		assert.strictEqual(remoteAgentHostSessionTypeId('10.0.0.1__8080', 'copilot'), 'remote-10.0.0.1__8080-copilot');
		// Provider-agnostic: the helper formats any agent provider name.
		assert.strictEqual(remoteAgentHostSessionTypeId('foo', 'openai'), 'remote-foo-openai');
	});
});
