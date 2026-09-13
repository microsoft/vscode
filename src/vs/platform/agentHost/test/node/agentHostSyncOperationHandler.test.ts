/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { GitRefType, IAgentHostGitService, type IPullOptions, type IPushOptions } from '../../common/agentHostGitService.js';
import { buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import { JsonRpcErrorCodes, ProtocolError } from '../../common/state/sessionProtocol.js';
import { SessionStatus, withSessionGitState } from '../../common/state/sessionState.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostSyncOperationHandler } from '../../node/agentHostSyncOperationHandler.js';

suite('AgentHostSyncOperationHandler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const session = URI.parse('agent:/session');
	const workingDirectory = URI.file('/repo');

	function createHandler(gitService: IAgentHostGitService, branchName = 'local-name') {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		stateManager.createSession({
			resource: session.toString(),
			provider: 'copilot',
			title: 'Session',
			status: SessionStatus.Idle,
			createdAt: new Date(1).toISOString(),
			modifiedAt: new Date(1).toISOString(),
			workingDirectories: [workingDirectory.toString()],
			_meta: withSessionGitState(undefined, { branchName, baseBranchName: 'main' }),
		});
		const refreshedSessions: string[] = [];
		return {
			handler: new AgentHostSyncOperationHandler(
				sessionKey => stateManager.getSessionState(sessionKey),
				async sessionKey => { refreshedSessions.push(sessionKey); },
				gitService,
				new NullLogService(),
			),
			refreshedSessions,
		};
	}

	function invoke(handler: AgentHostSyncOperationHandler, token = CancellationToken.None) {
		return handler.invoke({
			channel: buildUncommittedChangesetUri(session.toString()),
			operationId: AgentHostSyncOperationHandler.OPERATION_SYNC,
		}, token);
	}

	test('syncs the configured upstream branch when its name differs from the local branch', async () => {
		const gitCalls: Array<{ readonly operation: string; readonly options?: IPullOptions | IPushOptions }> = [];
		const gitService = new class extends mock<IAgentHostGitService>() {
			declare readonly _serviceBrand: undefined;

			override async getCurrentBranchName(): Promise<string> {
				return 'local-name';
			}

			override async getBranch() {
				return {
					ref: 'refs/heads/local-name',
					name: 'local-name',
					upstream: {
						ref: 'refs/remotes/origin/remote-name',
						name: 'origin/remote-name',
						remote: 'origin',
					},
					kind: GitRefType.Head,
				} as const;
			}

			override async pull(_workingDirectory: URI, options?: IPullOptions): Promise<void> {
				gitCalls.push({ operation: 'pull', options });
			}

			override async push(_workingDirectory: URI, options?: IPushOptions): Promise<void> {
				gitCalls.push({ operation: 'push', options });
			}
		}();
		const { handler, refreshedSessions } = createHandler(gitService);

		const result = await invoke(handler);

		assert.deepStrictEqual({
			gitCalls,
			refreshedSessions,
			message: result.message,
		}, {
			gitCalls: [
				{ operation: 'pull', options: { remote: 'origin', ref: 'remote-name' } },
				{ operation: 'push', options: { remote: 'origin', ref: 'refs/heads/local-name:refs/heads/remote-name' } },
			],
			refreshedSessions: [session.toString()],
			message: { markdown: 'Synced changes.' },
		});
	});

	test('rejects a cached branch that no longer matches the current checkout', async () => {
		let branchLookup = false;
		const gitService = new class extends mock<IAgentHostGitService>() {
			declare readonly _serviceBrand: undefined;

			override async getCurrentBranchName(): Promise<string> {
				return 'other-name';
			}

			override async getBranch() {
				branchLookup = true;
				return undefined;
			}
		}();
		const { handler } = createHandler(gitService);

		let error: ProtocolError | undefined;
		try {
			await invoke(handler);
		} catch (candidate) {
			error = candidate as ProtocolError;
		}

		assert.deepStrictEqual({
			branchLookup,
			code: error?.code,
			message: error?.message,
		}, {
			branchLookup: false,
			code: JsonRpcErrorCodes.InternalError,
			message: `Current branch changed from local-name to other-name for ${workingDirectory}`,
		});
	});

	test('stops after branch lookup when cancellation is requested', async () => {
		const cancellation = disposables.add(new CancellationTokenSource());
		let pullCalled = false;
		const gitService = new class extends mock<IAgentHostGitService>() {
			declare readonly _serviceBrand: undefined;

			override async getCurrentBranchName(): Promise<string> {
				return 'local-name';
			}

			override async getBranch() {
				cancellation.cancel();
				return {
					ref: 'refs/heads/local-name',
					name: 'local-name',
					upstream: {
						ref: 'refs/remotes/origin/remote-name',
						name: 'origin/remote-name',
						remote: 'origin',
					},
					kind: GitRefType.Head,
				} as const;
			}

			override async pull(): Promise<void> {
				pullCalled = true;
			}
		}();
		const { handler } = createHandler(gitService);

		let error: ProtocolError | undefined;
		try {
			await invoke(handler, cancellation.token);
		} catch (candidate) {
			error = candidate as ProtocolError;
		}

		assert.deepStrictEqual({
			pullCalled,
			code: error?.code,
			message: error?.message,
		}, {
			pullCalled: false,
			code: JsonRpcErrorCodes.InternalError,
			message: 'Sync operation was cancelled.',
		});
	});
});
