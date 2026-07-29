/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { GITHUB_REPO_PROTECTED_RESOURCE, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AHP_AUTH_REQUIRED_ERROR_NAME } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import type { InvokeChangesetOperationParams } from '../../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js';
import { AuthRequiredReason } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import type { IAgentHostAuthenticationRecoveryService } from '../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { invokeChangesetOperationWithAuthenticationRecovery } from '../../browser/agentHostSessionChangesets.js';

suite('AgentHostSessionChangesets', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('recovers authentication and retries a create pull request operation once', async () => {
		const params: InvokeChangesetOperationParams = {
			channel: 'agent:///session/changeset/session',
			operationId: 'create-pr',
		};
		const connection = new class extends mock<IAgentConnection>() {
			calls = 0;
			private readonly _rootState = {
				agents: [{
					provider: 'copilot',
					displayName: 'Copilot',
					description: '',
					models: [],
					protectedResources: [GITHUB_REPO_PROTECTED_RESOURCE],
				}]
			};
			override readonly rootState = {
				value: this._rootState,
				verifiedValue: this._rootState,
				onDidChange: Event.None,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			};
			override async invokeChangesetOperation(): Promise<{}> {
				this.calls++;
				if (this.calls === 1) {
					const error = new Error('Authentication required');
					error.name = AHP_AUTH_REQUIRED_ERROR_NAME;
					throw error;
				}
				return {};
			}
		}();
		const recoveryCalls: Array<{ resources: readonly string[]; reason: AuthRequiredReason }> = [];
		const recoveryService: IAgentHostAuthenticationRecoveryService = {
			_serviceBrand: undefined,
			register: () => ({ dispose() { } }),
			recover: async (_connection, resources, reason) => {
				recoveryCalls.push({ resources: resources.map(resource => resource.resource), reason });
				return true;
			},
		};

		await invokeChangesetOperationWithAuthenticationRecovery(connection, params, recoveryService);

		assert.deepStrictEqual({
			operationCalls: connection.calls,
			recoveryCalls,
		}, {
			operationCalls: 2,
			recoveryCalls: [{
				resources: [GITHUB_REPO_PROTECTED_RESOURCE.resource],
				reason: AuthRequiredReason.Expired,
			}],
		});
	});
});
