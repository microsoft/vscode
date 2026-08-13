/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { IChatSessionRoutingDispatchResult } from '../../../common/sessionRouter.js';
import { GlobalOmniSessionBrokerClient, GlobalOmniSessionBrokerMessage, IGlobalOmniSessionBrokerChannel } from '../../../browser/chatInputWindow/globalOmniSessionBrokerClient.js';
import { decodeGlobalOmniSessionCandidateId, encodeGlobalOmniSessionCandidateId, GlobalOmniSessionBrokerModel, IGlobalOmniSessionSnapshotEntry } from '../../../browser/chatInputWindow/globalOmniSessionBrokerModel.js';

suite('GlobalOmniSessionBroker', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('aggregates same-profile snapshots and deduplicates local and remote resources', () => {
		const model = new GlobalOmniSessionBrokerModel('profile-a', 'local');
		model.acceptSnapshot({
			profileId: 'profile-b',
			sourceId: 'other-profile',
			sentAt: 0,
			sessions: [snapshot('agent-host-copilotcli:/ignored', 'Ignored')],
		}, 1);
		model.acceptSnapshot({
			profileId: 'profile-a',
			sourceId: 'source-b',
			sentAt: 0,
			sessions: [
				snapshot('agent-host-copilotcli:/shared', 'Shared from B'),
				snapshot('agent-host-copilotcli:/remote-b', 'Remote B'),
			],
		}, 2);
		model.acceptSnapshot({
			profileId: 'profile-a',
			sourceId: 'source-a',
			sentAt: 0,
			sessions: [
				snapshot('agent-host-copilotcli:/shared', 'Shared from A'),
				snapshot('agent-host-copilotcli:/local', 'Local duplicate'),
			],
		}, 3);

		const candidates = model.getCandidates(['agent-host-copilotcli:/local']);

		assert.deepStrictEqual(candidates.map(candidate => ({
			id: decodeGlobalOmniSessionCandidateId(candidate.sessionId),
			resource: candidate.rawSessionResource.toString(),
			label: candidate.label,
			status: candidate.status,
			repo: candidate.repo,
			cwd: candidate.cwd,
			description: candidate.description,
		})), [
			{
				id: { sourceId: 'source-a', resource: 'agent-host-copilotcli:/shared' },
				resource: 'agent-host-copilotcli:/shared',
				label: 'Shared from A',
				status: 'idle',
				repo: 'microsoft/vscode',
				cwd: '/work/vscode',
				description: 'Session description',
			},
			{
				id: { sourceId: 'source-b', resource: 'agent-host-copilotcli:/remote-b' },
				resource: 'agent-host-copilotcli:/remote-b',
				label: 'Remote B',
				status: 'idle',
				repo: 'microsoft/vscode',
				cwd: '/work/vscode',
				description: 'Session description',
			},
		]);
	});

	test('round trips remote candidate identity and removes goodbye or expired sources', () => {
		const candidateId = encodeGlobalOmniSessionCandidateId('window:1/source', 'agent-host-copilotcli:/session?x=1');
		assert.deepStrictEqual(decodeGlobalOmniSessionCandidateId(candidateId), {
			sourceId: 'window:1/source',
			resource: 'agent-host-copilotcli:/session?x=1',
		});

		const model = new GlobalOmniSessionBrokerModel('profile', 'local');
		model.acceptSnapshot({
			profileId: 'profile',
			sourceId: 'source-a',
			sentAt: 0,
			sessions: [snapshot('agent-host-copilotcli:/a', 'A')],
		}, 0);
		model.acceptSnapshot({
			profileId: 'profile',
			sourceId: 'source-b',
			sentAt: 0,
			sessions: [snapshot('agent-host-copilotcli:/b', 'B')],
		}, 5);

		assert.deepStrictEqual(model.expireSources(11, 10), ['source-a']);
		assert.deepStrictEqual(model.getCandidates([]).map(candidate => candidate.label), ['B']);
		assert.strictEqual(model.removeSource('other-profile', 'source-b'), false);
		assert.strictEqual(model.removeSource('profile', 'source-b'), true);
		assert.deepStrictEqual(model.getCandidates([]), []);
	});

	test('dispatches to the exact source and preserves URI-bearing request options', async () => {
		const bus = new TestBrokerBus();
		let sourceAInvocations = 0;
		let sourceBInvocation: { resource: string; message: string; attachment: string | undefined; tools: Record<string, boolean> | undefined } | undefined;
		const sourceA = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-a',
			bus.createChannel(),
			async () => {
				sourceAInvocations++;
				return { status: 'rejected' };
			},
			error => assert.fail(error instanceof Error ? error : String(error)),
		));
		const sourceB = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-b',
			bus.createChannel(),
			async (resource, message, options) => {
				sourceBInvocation = {
					resource: resource.toString(),
					message,
					attachment: IChatRequestVariableEntry.toUri(options.attachedContext?.[0]!)?.toString(),
					tools: options.userSelectedTools?.get(),
				};
				return { status: 'sent', resource, requestId: 'request-1' };
			},
			error => assert.fail(error instanceof Error ? error : String(error)),
		));
		sourceB.updateLocalSnapshot([snapshot('agent-host-copilotcli:/remote', 'Remote')]);
		const candidate = sourceA.getAdditionalCandidates([])[0];
		const attachment: IChatRequestVariableEntry = {
			id: 'file',
			name: 'file.ts',
			kind: 'file',
			value: URI.file('/work/vscode/file.ts'),
		};

		const result = await sourceA.dispatch(candidate.sessionId, 'Fix the file', {
			attachedContext: [attachment],
			userSelectedTools: constObservable({ terminal: true }),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			sourceAInvocations,
			sourceBInvocation,
			result: {
				status: result?.status,
				resource: result?.resource?.toString(),
				requestId: result?.requestId,
			},
		}, {
			sourceAInvocations: 0,
			sourceBInvocation: {
				resource: 'agent-host-copilotcli:/remote',
				message: 'Fix the file',
				attachment: URI.file('/work/vscode/file.ts').toString(),
				tools: { terminal: true },
			},
			result: {
				status: 'sent',
				resource: 'agent-host-copilotcli:/remote',
				requestId: 'request-1',
			},
		});
	});

	test('returns queued completion and rejects pending dispatch when the source closes', async () => {
		const bus = new TestBrokerBus();
		const queuedCompletion = new DeferredPromise<IChatSessionRoutingDispatchResult>();
		const pendingDispatch = new DeferredPromise<IChatSessionRoutingDispatchResult>();
		let dispatchCount = 0;
		const sourceA = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-a',
			bus.createChannel(),
			async () => ({ status: 'rejected' }),
			error => assert.fail(error instanceof Error ? error : String(error)),
		));
		const sourceB = new GlobalOmniSessionBrokerClient(
			'profile',
			'source-b',
			bus.createChannel(),
			async resource => {
				dispatchCount++;
				return dispatchCount === 1 ? {
					status: 'queued',
					resource,
					requestId: 'queued-1',
					completion: queuedCompletion.p,
				} : pendingDispatch.p;
			},
			error => assert.fail(error instanceof Error ? error : String(error)),
		);
		sourceB.updateLocalSnapshot([snapshot('agent-host-copilotcli:/remote', 'Remote')]);
		const candidate = sourceA.getAdditionalCandidates([])[0];

		const queued = await sourceA.dispatch(candidate.sessionId, 'First', {}, CancellationToken.None);
		queuedCompletion.complete({ status: 'sent', resource: candidate.rawSessionResource });
		const completed = await queued?.completion;

		const unavailablePromise = sourceA.dispatch(candidate.sessionId, 'Second', {}, CancellationToken.None);
		sourceB.dispose();
		const unavailable = await unavailablePromise;

		assert.deepStrictEqual({
			queued: queued?.status,
			completed: completed?.status,
			unavailable: {
				status: unavailable?.status,
				reasonCode: unavailable?.reasonCode,
			},
		}, {
			queued: 'queued',
			completed: 'sent',
			unavailable: {
				status: 'rejected',
				reasonCode: 'providerRemoved',
			},
		});
	});

	test('rejects cancellation and timeout without a success fallback', async () => {
		const clock = sinon.useFakeTimers();
		try {
			const bus = new TestBrokerBus();
			const receivedTokens: CancellationToken[] = [];
			const never = new Promise<IChatSessionRoutingDispatchResult>(() => { });
			const sourceA = disposables.add(new GlobalOmniSessionBrokerClient(
				'profile',
				'source-a',
				bus.createChannel(),
				async () => ({ status: 'rejected' }),
				error => assert.fail(error instanceof Error ? error : String(error)),
				{ heartbeatInterval: 1_000, sourceExpiry: 5_000, dispatchTimeout: 20 },
			));
			const sourceB = disposables.add(new GlobalOmniSessionBrokerClient(
				'profile',
				'source-b',
				bus.createChannel(),
				async (_resource, _message, _options, token) => {
					receivedTokens.push(token);
					return never;
				},
				error => assert.fail(error instanceof Error ? error : String(error)),
				{ heartbeatInterval: 1_000, sourceExpiry: 5_000, dispatchTimeout: 20 },
			));
			sourceB.updateLocalSnapshot([snapshot('agent-host-copilotcli:/remote', 'Remote')]);
			const candidate = sourceA.getAdditionalCandidates([])[0];
			const cts = disposables.add(new CancellationTokenSource());

			const cancelledPromise = sourceA.dispatch(candidate.sessionId, 'Cancel', {}, cts.token);
			cts.cancel();
			const cancelled = await cancelledPromise;
			const timedOutPromise = sourceA.dispatch(candidate.sessionId, 'Timeout', {}, CancellationToken.None);
			await clock.tickAsync(21);
			const timedOut = await timedOutPromise;

			assert.deepStrictEqual({
				cancelled: { status: cancelled?.status, reasonCode: cancelled?.reasonCode },
				timedOut: { status: timedOut?.status, reasonCode: timedOut?.reasonCode },
				sourceTokensCancelled: receivedTokens.map(token => token.isCancellationRequested),
			}, {
				cancelled: { status: 'rejected', reasonCode: 'cancelled' },
				timedOut: { status: 'rejected', reasonCode: 'cancelled' },
				sourceTokensCancelled: [true, true],
			});
		} finally {
			clock.restore();
		}
	});
});

class TestBrokerBus {

	private readonly channels = new Set<TestBrokerChannel>();

	createChannel(): IGlobalOmniSessionBrokerChannel {
		const channel = new TestBrokerChannel(this);
		this.channels.add(channel);
		return channel;
	}

	post(sender: TestBrokerChannel, message: GlobalOmniSessionBrokerMessage): void {
		for (const channel of this.channels) {
			if (channel !== sender) {
				channel.receive(message);
			}
		}
	}

	remove(channel: TestBrokerChannel): void {
		this.channels.delete(channel);
	}
}

class TestBrokerChannel extends Disposable implements IGlobalOmniSessionBrokerChannel {

	private readonly _onDidReceiveData = this._register(new Emitter<GlobalOmniSessionBrokerMessage>());
	readonly onDidReceiveData = this._onDidReceiveData.event;

	constructor(private readonly bus: TestBrokerBus) {
		super();
	}

	postData(message: GlobalOmniSessionBrokerMessage): void {
		this.bus.post(this, message);
	}

	receive(message: GlobalOmniSessionBrokerMessage): void {
		this._onDidReceiveData.fire(message);
	}

	override dispose(): void {
		this.bus.remove(this);
		super.dispose();
	}
}

function snapshot(resource: string, label: string): IGlobalOmniSessionSnapshotEntry {
	return {
		resource,
		label,
		status: 'idle',
		created: 1,
		lastActivity: 2,
		repo: 'microsoft/vscode',
		cwd: '/work/vscode',
		description: 'Session description',
	};
}
