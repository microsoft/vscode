/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { InvokeChangesetOperationParams, InvokeChangesetOperationResult } from '../../../../../../platform/agentHost/common/state/protocol/channels-changeset/commands.js';
import { createPullRequestOperationMeta, createPullRequestValidationMeta, PREPARE_PULL_REQUEST_OPERATION_ID } from '../../../../../../platform/agentHost/common/meta/agentPullRequestOperationMeta.js';
import { AgentHostPullRequestCreation } from '../../browser/agentHostPullRequestCreation.js';

suite('AgentHostPullRequestCreation', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const channel = URI.parse('changeset:/session-1');
	const options = { title: 'Title', description: '', draft: false, agentMerge: false };
	const context = { workingDirectory: 'file:///repo', repository: 'microsoft/vscode', branchName: 'feature/test', baseBranchName: 'main' };

	test('validates through the read-only preparation operation and forwards identity on creation', async () => {
		const invocations: InvokeChangesetOperationParams[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override async invokeChangesetOperation(params: InvokeChangesetOperationParams): Promise<InvokeChangesetOperationResult> {
				invocations.push(params);
				return {};
			}
		}();
		const creation = new AgentHostPullRequestCreation(() => connection, () => channel, (operationId, metadata) =>
			connection.invokeChangesetOperation({ operationId, channel: channel.toString(), _meta: metadata }));
		const chatRequest = await creation.prepareChatRequest('Create the PR', { ...options, expectedContext: context });
		assert.deepStrictEqual(chatRequest, { query: 'Create the PR', metadata: createPullRequestOperationMeta({ ...options, expectedContext: context }) });
		await creation.create({ ...options, expectedContext: context });
		assert.deepStrictEqual(invocations, [
			{ channel: channel.toString(), operationId: PREPARE_PULL_REQUEST_OPERATION_ID, _meta: createPullRequestValidationMeta(context) },
			{ channel: channel.toString(), operationId: 'create-pr', _meta: createPullRequestOperationMeta({ ...options, expectedContext: context }) },
		]);
	});

	test('reports an unavailable connection or channel', async () => {
		const withoutConnection = new AgentHostPullRequestCreation(() => undefined, () => channel, async () => ({}));
		const withoutChannel = new AgentHostPullRequestCreation(() => new class extends mock<IAgentConnection>() { }(), () => undefined, async () => ({}));

		await assert.rejects(() => withoutConnection.prepare(CancellationToken.None), /connection or changeset is unavailable/);
		await assert.rejects(() => withoutChannel.prepare(CancellationToken.None), /connection or changeset is unavailable/);
		await assert.rejects(() => withoutConnection.prepareChatRequest('Create the PR', { ...options, expectedContext: context }), /connection or changeset is unavailable/);
	});

	test('discards preparation results when cancelled in flight', async () => {
		const result = new DeferredPromise<InvokeChangesetOperationResult>();
		const connection = new class extends mock<IAgentConnection>() {
			override invokeChangesetOperation(): Promise<InvokeChangesetOperationResult> {
				return result.p;
			}
		}();
		const creation = new AgentHostPullRequestCreation(() => connection, () => channel, async () => ({}));
		const cancellation = disposables.add(new CancellationTokenSource());
		const prepared = creation.prepare(cancellation.token);
		cancellation.cancel();
		const rejected = assert.rejects(prepared, /Canceled/);
		await result.complete({});
		await rejected;
	});

	test('reports a cancelled submission', async () => {
		const creation = new AgentHostPullRequestCreation(() => undefined, () => channel, async () => undefined);
		await assert.rejects(() => creation.create(options), /Canceled/);
	});

	test('preserves plain-text outcomes and renders markdown outcomes as plain text', async () => {
		const outcomes = [
			undefined,
			'Created; auto-merge could not be enabled.',
			{ markdown: '**Created**; auto-merge could not be enabled.' },
		];
		const messages: (string | void)[] = [];
		for (const message of outcomes) {
			const creation = new AgentHostPullRequestCreation(() => undefined, () => channel, async () => ({ message }));
			messages.push(await creation.create(options));
		}
		assert.deepStrictEqual(messages, [
			undefined,
			'Created; auto-merge could not be enabled.',
			'Created; auto-merge could not be enabled.',
		]);
	});
});
