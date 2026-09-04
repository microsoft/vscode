/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IAgentHostGitService } from '../../common/agentHostGitService.js';
import { buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { checkoutOperationMeta } from '../../common/meta/agentCheckoutOperationMeta.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostCheckoutOperationHandler } from '../../node/agentHostCheckoutOperationHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

suite('AgentHostCheckoutOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('checks out the selected branch from a clean working directory', async () => {
		const session = URI.parse('agent:/session');
		const workingDirectory = URI.file('/repo');
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: session.toString(),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: [workingDirectory.toString()],
		});
		const gitCalls: string[] = [];
		const gitService = new class extends mock<IAgentHostGitService>() {
			declare readonly _serviceBrand: undefined;

			override async hasUncommittedChanges(resource: URI): Promise<boolean> {
				gitCalls.push(`hasUncommittedChanges:${resource.toString()}`);
				return false;
			}

			override async branchExists(resource: URI, branchName: string): Promise<boolean> {
				gitCalls.push(`branchExists:${resource.toString()}:${branchName}`);
				return branchName === 'dev';
			}

			override async checkout(resource: URI, treeish: string): Promise<void> {
				gitCalls.push(`checkout:${resource.toString()}:${treeish}`);
			}
		}();
		const refreshedSessions: string[] = [];
		const handler = new AgentHostCheckoutOperationHandler(
			sessionKey => stateManager.getSessionState(sessionKey),
			async sessionKey => { refreshedSessions.push(sessionKey); },
			gitService,
			new NullLogService(),
		);

		const result = await handler.invoke({
			channel: buildUncommittedChangesetUri(session.toString()),
			operationId: AgentHostCheckoutOperationHandler.OPERATION_CHECKOUT,
			_meta: checkoutOperationMeta('dev'),
		}, CancellationToken.None);
		let optionError: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildUncommittedChangesetUri(session.toString()),
				operationId: AgentHostCheckoutOperationHandler.OPERATION_CHECKOUT,
				_meta: checkoutOperationMeta('-Bmain'),
			}, CancellationToken.None);
		} catch (error) {
			optionError = error as ProtocolError;
		}
		let missingBranchError: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildUncommittedChangesetUri(session.toString()),
				operationId: AgentHostCheckoutOperationHandler.OPERATION_CHECKOUT,
				_meta: checkoutOperationMeta('missing'),
			}, CancellationToken.None);
		} catch (error) {
			missingBranchError = error as ProtocolError;
		}

		assert.deepStrictEqual({
			gitCalls,
			refreshedSessions,
			message: result.message,
			optionErrorCode: optionError?.code,
			missingBranchErrorCode: missingBranchError?.code,
		}, {
			gitCalls: [
				`branchExists:${workingDirectory.toString()}:dev`,
				`hasUncommittedChanges:${workingDirectory.toString()}`,
				`checkout:${workingDirectory.toString()}:dev`,
				`branchExists:${workingDirectory.toString()}:missing`,
			],
			refreshedSessions: [session.toString()],
			message: { markdown: 'Checked out branch `dev`.' },
			optionErrorCode: JsonRpcErrorCodes.InvalidParams,
			missingBranchErrorCode: JsonRpcErrorCodes.InvalidParams,
		});
	});
});
