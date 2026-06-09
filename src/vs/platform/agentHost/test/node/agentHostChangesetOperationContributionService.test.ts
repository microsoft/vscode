/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { DisposableStore, type IDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IChangesetOperationContribution, IChangesetOperationContext, IChangesetOperationHandler, IChangesetOperationRegistry } from '../../common/changesetOperation.js';
import { buildUncommittedChangesetUri } from '../../common/changesetUri.js';
import type { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../../common/state/protocol/channels-changeset/commands.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { ChangesetOperationScope, ChangesetOperationStatus, type ChangesetOperation } from '../../common/state/sessionState.js';
import { AgentHostChangesetOperationContributionService } from '../../node/agentHostChangesetOperationContributionService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import type { AgentHostSessionGitStateService } from '../../node/agentHostSessionGitStateService.js';

class TestHandler implements IChangesetOperationHandler {
	calls = 0;
	private _resolve: ((value: InvokeChangesetOperationResult) => void) | undefined;
	readonly pending = new Promise<InvokeChangesetOperationResult>(resolve => { this._resolve = resolve; });

	invoke(_params: InvokeChangesetOperationParams, _token: CancellationToken): Promise<InvokeChangesetOperationResult> {
		this.calls++;
		return this.pending;
	}

	complete(result: InvokeChangesetOperationResult): void {
		this._resolve?.(result);
	}
}

class TestContribution implements IChangesetOperationContribution {
	constructor(private readonly handler: IChangesetOperationHandler) { }

	registerHandlers(registry: IChangesetOperationRegistry): IDisposable {
		const store = new DisposableStore();
		store.add(registry.registerChangesetOperationHandler('commit', this.handler));
		return store;
	}

	getOperations(_context: IChangesetOperationContext): readonly ChangesetOperation[] | undefined {
		return undefined;
	}

	dispose(): void { }
}

suite('AgentHostChangesetOperationContributionService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('joins duplicate in-flight invocations for the same changeset operation', async () => {
		const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const sessionKey = 'agent:/session';
		const changesetUri = buildUncommittedChangesetUri(sessionKey);
		stateManager.registerChangeset(changesetUri);
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetOperationsChanged,
			operations: [{ id: 'commit', label: 'Commit', scopes: [ChangesetOperationScope.Changeset], status: ChangesetOperationStatus.Idle }],
		});

		const service = disposables.add(new AgentHostChangesetOperationContributionService(
			stateManager,
			{ refreshSessionGitState: async () => undefined } as unknown as AgentHostSessionGitStateService,
		));
		const handler = new TestHandler();
		disposables.add(service.registerContribution(new TestContribution(handler)));

		const params = { channel: changesetUri, operationId: 'commit' };
		const first = service.invokeChangesetOperation(params);
		const second = service.invokeChangesetOperation(params);
		handler.complete({ message: { markdown: 'Committed' } });

		const [firstResult, secondResult] = await Promise.all([first, second]);

		assert.deepStrictEqual({ calls: handler.calls, firstResult, secondResult }, {
			calls: 1,
			firstResult: { message: { markdown: 'Committed' } },
			secondResult: { message: { markdown: 'Committed' } },
		});
	});
});
