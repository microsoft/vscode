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
import { CheckoutBlockedByLocalChangesError, IAgentHostGitService } from '../../common/agentHostGitService.js';
import { buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { CheckoutOperationPreAction, checkoutOperationMeta } from '../../common/meta/agentCheckoutOperationMeta.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { SessionStatus } from '../../common/state/sessionState.js';
import { AgentHostCheckoutOperationHandler } from '../../node/agentHostCheckoutOperationHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

suite('AgentHostCheckoutOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('checks out the selected branch without probing the working directory', async () => {
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
				return true;
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
				`checkout:${workingDirectory.toString()}:dev`,
				`branchExists:${workingDirectory.toString()}:missing`,
			],
			refreshedSessions: [session.toString()],
			message: { markdown: 'Checked out branch `dev`.' },
			optionErrorCode: JsonRpcErrorCodes.InvalidParams,
			missingBranchErrorCode: JsonRpcErrorCodes.InvalidParams,
		});
	});

	test('requires and performs a pre-checkout action after checkout fails for a dirty working directory', async () => {
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
			dirty = true;

			override async branchExists(resource: URI, branchName: string): Promise<boolean> {
				gitCalls.push(`branchExists:${resource.toString()}:${branchName}`);
				return true;
			}

			override async createStash(resource: URI, options?: { readonly message?: string; readonly includeUntracked?: boolean; readonly staged?: boolean }): Promise<void> {
				gitCalls.push(`createStash:${resource.toString()}:${options?.message}:${options?.includeUntracked}:${options?.staged}`);
				this.dirty = false;
			}

			override async commitAll(resource: URI, message: string): Promise<void> {
				gitCalls.push(`commitAll:${resource.toString()}:${message}`);
				this.dirty = false;
			}

			override async checkout(resource: URI, treeish: string): Promise<void> {
				gitCalls.push(`checkout:${resource.toString()}:${treeish}`);
				if (this.dirty) {
					throw new CheckoutBlockedByLocalChangesError('Local changes would be overwritten by checkout.');
				}
			}
		}();
		const refreshedSessions: string[] = [];
		const handler = new AgentHostCheckoutOperationHandler(
			sessionKey => stateManager.getSessionState(sessionKey),
			async sessionKey => { refreshedSessions.push(sessionKey); },
			gitService,
			new NullLogService(),
		);
		const invoke = (preCheckoutAction?: CheckoutOperationPreAction) => handler.invoke({
			channel: buildUncommittedChangesetUri(session.toString()),
			operationId: AgentHostCheckoutOperationHandler.OPERATION_CHECKOUT,
			_meta: checkoutOperationMeta('dev', preCheckoutAction),
		}, CancellationToken.None);

		let dirtyError: ProtocolError | undefined;
		try {
			await invoke();
		} catch (error) {
			dirtyError = error as ProtocolError;
		}
		const stashResult = await invoke(CheckoutOperationPreAction.Stash);
		gitService.dirty = true;
		const commitResult = await invoke(CheckoutOperationPreAction.Commit);

		assert.deepStrictEqual({
			dirtyError: {
				code: dirtyError?.code,
				data: dirtyError?.data,
			},
			gitCalls,
			refreshedSessions,
			messages: [stashResult.message, commitResult.message],
		}, {
			dirtyError: {
				code: JsonRpcErrorCodes.InvalidParams,
				data: { reason: 'dirtyWorkingTree' },
			},
			gitCalls: [
				`branchExists:${workingDirectory.toString()}:dev`,
				`checkout:${workingDirectory.toString()}:dev`,
				`branchExists:${workingDirectory.toString()}:dev`,
				`createStash:${workingDirectory.toString()}:WIP: Changes before checking out dev:true:undefined`,
				`checkout:${workingDirectory.toString()}:dev`,
				`branchExists:${workingDirectory.toString()}:dev`,
				`commitAll:${workingDirectory.toString()}:WIP: Save changes before checking out dev`,
				`checkout:${workingDirectory.toString()}:dev`,
			],
			refreshedSessions: [session.toString(), session.toString()],
			messages: [
				{ markdown: 'Checked out branch `dev`.' },
				{ markdown: 'Checked out branch `dev`.' },
			],
		});
	});

	test('does not classify unrelated checkout failures as dirty working tree conflicts', async () => {
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
		const gitService = new class extends mock<IAgentHostGitService>() {
			declare readonly _serviceBrand: undefined;

			override async branchExists(): Promise<boolean> {
				return true;
			}

			override async checkout(): Promise<void> {
				throw new Error('Branch \'dev\' is already checked out in another worktree.');
			}
		}();
		const handler = new AgentHostCheckoutOperationHandler(
			sessionKey => stateManager.getSessionState(sessionKey),
			() => { },
			gitService,
			new NullLogService(),
		);

		let checkoutError: ProtocolError | undefined;
		try {
			await handler.invoke({
				channel: buildUncommittedChangesetUri(session.toString()),
				operationId: AgentHostCheckoutOperationHandler.OPERATION_CHECKOUT,
				_meta: checkoutOperationMeta('dev'),
			}, CancellationToken.None);
		} catch (error) {
			checkoutError = error as ProtocolError;
		}

		assert.deepStrictEqual({
			code: checkoutError?.code,
			data: checkoutError?.data,
			message: checkoutError?.message,
		}, {
			code: JsonRpcErrorCodes.InternalError,
			data: undefined,
			message: 'Failed to check out \'dev\': Branch \'dev\' is already checked out in another worktree.',
		});
	});
});
