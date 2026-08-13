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
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustRequestService, ResourceTrustRequestOptions, WorkspaceTrustRequestOptions } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { ChatSendResult, IChatModelReference, IChatSendRequestOptions, IChatService } from '../../../common/chatService/chatService.js';
import { IChatSessionsService } from '../../../common/chatSessionsService.js';
import { IChatResponseModel, IChatModel } from '../../../common/model/chatModel.js';
import { IChatAgentData } from '../../../common/participants/chatAgents.js';
import { IChatSessionRoutingDispatchResult } from '../../../common/sessionRouter.js';
import { AgentSessionProviders } from '../../../browser/agentSessions/agentSessions.js';
import { IAgentHostNewSessionFolderService } from '../../../browser/agentSessions/agentHost/agentHostNewSessionFolderService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from '../../../browser/agentSessions/agentHost/agentHostSessionWorkingDirectoryResolver.js';
import { AgentSessionStatus, IAgentSession } from '../../../browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../browser/agentSessions/agentSessionsService.js';
import { createGlobalOmniSessionSnapshotEntry, GlobalOmniSessionSourceRequestHandler } from '../../../browser/chatInputWindow/globalOmniSessionBroker.js';
import { GlobalOmniSessionBrokerClient, GlobalOmniSessionBrokerMessage, IGlobalOmniSessionBrokerChannel } from '../../../browser/chatInputWindow/globalOmniSessionBrokerClient.js';
import { decodeGlobalOmniSessionCandidateId, encodeGlobalOmniSessionCandidateId, GlobalOmniSessionBrokerModel, IGlobalOmniSessionSnapshotEntry } from '../../../browser/chatInputWindow/globalOmniSessionBrokerModel.js';

suite('GlobalOmniSessionBroker', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('aggregates same-profile snapshots and deduplicates local and remote resources', () => {
		const model = new GlobalOmniSessionBrokerModel('profile-a', null, 'local');
		model.acceptSnapshot({
			profileId: 'profile-b',
			remoteAuthority: null,
			sourceId: 'other-profile',
			sentAt: 0,
			sessions: [snapshot('agent-host-copilotcli:/ignored', 'Ignored')],
		}, 1);
		model.acceptSnapshot({
			profileId: 'profile-a',
			remoteAuthority: 'ssh-remote+other',
			sourceId: 'other-authority',
			sentAt: 0,
			sessions: [snapshot('agent-host-copilotcli:/also-ignored', 'Also ignored')],
		}, 1);
		model.acceptSnapshot({
			profileId: 'profile-a',
			remoteAuthority: null,
			sourceId: 'source-b',
			sentAt: 0,
			sessions: [
				snapshot('agent-host-copilotcli:/shared', 'Shared from B'),
				snapshot('agent-host-copilotcli:/remote-b', 'Remote B'),
			],
		}, 2);
		model.acceptSnapshot({
			profileId: 'profile-a',
			remoteAuthority: null,
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
		})), [
			{
				id: { sourceId: 'source-a', resource: 'agent-host-copilotcli:/shared' },
				resource: 'agent-host-copilotcli:/shared',
				label: 'Shared from A',
				status: 'idle',
				repo: 'microsoft/vscode',
			},
			{
				id: { sourceId: 'source-b', resource: 'agent-host-copilotcli:/remote-b' },
				resource: 'agent-host-copilotcli:/remote-b',
				label: 'Remote B',
				status: 'idle',
				repo: 'microsoft/vscode',
			},
		]);
	});

	test('round trips remote candidate identity and removes goodbye or expired sources', () => {
		const candidateId = encodeGlobalOmniSessionCandidateId('window:1/source', 'agent-host-copilotcli:/session?x=1');
		assert.deepStrictEqual(decodeGlobalOmniSessionCandidateId(candidateId), {
			sourceId: 'window:1/source',
			resource: 'agent-host-copilotcli:/session?x=1',
		});

		const model = new GlobalOmniSessionBrokerModel('profile', null, 'local');
		model.acceptSnapshot({
			profileId: 'profile',
			remoteAuthority: null,
			sourceId: 'source-a',
			sentAt: 0,
			sessions: [snapshot('agent-host-copilotcli:/a', 'A')],
		}, 0);
		model.acceptSnapshot({
			profileId: 'profile',
			remoteAuthority: null,
			sourceId: 'source-b',
			sentAt: 0,
			sessions: [snapshot('agent-host-copilotcli:/b', 'B')],
		}, 5);

		assert.deepStrictEqual(model.expireSources(11, 10), ['source-a']);
		assert.deepStrictEqual(model.getCandidates([]).map(candidate => candidate.label), ['B']);
		assert.strictEqual(model.removeSource('other-profile', null, 'source-b'), false);
		assert.strictEqual(model.removeSource('profile', null, 'source-b'), true);
		assert.deepStrictEqual(model.getCandidates([]), []);
	});

	test('serializes only privacy-safe session routing metadata', () => {
		const session = new class extends mock<IAgentSession>() {
			override readonly resource = URI.parse('agent-host-copilotcli:/private-session');
			override readonly label = 'Fix the confidential authentication prompt';
			override readonly description = 'The user asked to rotate a private credential';
			override readonly status = AgentSessionStatus.InProgress;
			override readonly timing = { created: 1, lastRequestStarted: 2, lastRequestEnded: 3 };
			override readonly metadata = {
				owner: 'microsoft',
				name: 'vscode',
				workingDirectoryPath: '/Users/example/secret-worktree',
			};
		};

		const entry = createGlobalOmniSessionSnapshotEntry(session);
		const serialized = JSON.stringify(entry);

		assert.deepStrictEqual({
			entry,
			containsDisplayLabel: serialized.includes(session.label),
			containsDescription: serialized.includes(session.description),
			containsWorkingDirectory: serialized.includes(session.metadata.workingDirectoryPath),
		}, {
			entry: {
				resource: session.resource.toString(),
				label: 'Agent session in microsoft/vscode',
				status: 'working',
				created: 1,
				lastActivity: 3,
				repo: 'microsoft/vscode',
			},
			containsDisplayLabel: false,
			containsDescription: false,
			containsWorkingDirectory: false,
		});
	});

	test('requests one snapshot resync when a heartbeat rediscovers an expired source', () => {
		const bus = new TestBrokerBus();
		let now = 0;
		const timings = { heartbeatInterval: 1_000_000, sourceExpiry: 10 };
		const sourceA = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-a',
			null,
			bus.createChannel(),
			async () => ({ status: 'rejected' }),
			error => assert.fail(error instanceof Error ? error : String(error)),
			timings,
			() => now,
		));
		const sourceB = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-b',
			null,
			bus.createChannel(),
			async () => ({ status: 'rejected' }),
			error => assert.fail(error instanceof Error ? error : String(error)),
			timings,
			() => now,
		));
		sourceB.updateLocalSnapshot([snapshot('agent-host-copilotcli:/remote', 'Remote')]);
		const heartbeat = (client: GlobalOmniSessionBrokerClient) =>
			(Reflect.get(client, '_heartbeat') as () => void).call(client);

		now = 11;
		heartbeat(sourceA);
		const candidatesAfterExpiry = sourceA.getAdditionalCandidates([]).map(candidate => candidate.label);
		heartbeat(sourceB);
		const resyncsAfterRestore = bus.messages.filter(message => message.type === 'resyncRequest').length;
		const candidatesAfterRestore = sourceA.getAdditionalCandidates([]).map(candidate => candidate.label);
		heartbeat(sourceB);

		assert.deepStrictEqual({
			candidatesAfterExpiry,
			candidatesAfterRestore,
			resyncsAfterRestore,
			resyncsAfterAnotherHeartbeat: bus.messages.filter(message => message.type === 'resyncRequest').length,
		}, {
			candidatesAfterExpiry: [],
			candidatesAfterRestore: ['Remote'],
			resyncsAfterRestore: 1,
			resyncsAfterAnotherHeartbeat: 1,
		});
	});

	test('rejects incompatible remote authorities on a shared channel', async () => {
		const bus = new TestBrokerBus();
		const localChannel = bus.createChannel();
		let incompatibleDispatches = 0;
		const local = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-local',
			null,
			localChannel,
			async () => ({ status: 'rejected' }),
			error => assert.fail(error instanceof Error ? error : String(error)),
		));
		const incompatible = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-remote',
			'ssh-remote+host',
			bus.createChannel(),
			async () => {
				incompatibleDispatches++;
				return { status: 'sent' };
			},
			error => assert.fail(error instanceof Error ? error : String(error)),
		));
		incompatible.updateLocalSnapshot([snapshot('agent-host-copilotcli:/incompatible', 'Incompatible')]);
		const incompatibleCandidates = local.getAdditionalCandidates([]);

		const incompatibleChannel = disposables.add(bus.createChannel());
		incompatibleChannel.postData({
			type: 'dispatchRequest',
			profileId: 'profile',
			remoteAuthority: null,
			sourceId: 'forged-local',
			targetSourceId: 'source-remote',
			requestId: 'forged-request',
			candidateId: encodeGlobalOmniSessionCandidateId('source-remote', 'agent-host-copilotcli:/incompatible'),
			resource: 'agent-host-copilotcli:/incompatible',
			message: 'Do not accept',
			serializedOptions: '{}',
		});

		const pendingSourceDispatch = new DeferredPromise<IChatSessionRoutingDispatchResult>();
		const compatible = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-compatible',
			null,
			bus.createChannel(),
			() => pendingSourceDispatch.p,
			error => assert.fail(error instanceof Error ? error : String(error)),
		));
		compatible.updateLocalSnapshot([snapshot('agent-host-copilotcli:/compatible', 'Compatible')]);
		const candidate = local.getAdditionalCandidates([])[0];
		const dispatchPromise = local.dispatch(candidate.sessionId, 'Run tests', {}, CancellationToken.None);
		const dispatchRequest = [...bus.messages].reverse().find(
			(message): message is Extract<GlobalOmniSessionBrokerMessage, { readonly type: 'dispatchRequest' }> => message.type === 'dispatchRequest' && message.sourceId === 'source-local'
		);
		assert.ok(dispatchRequest);
		localChannel.receive({
			type: 'dispatchResult',
			profileId: 'profile',
			remoteAuthority: 'ssh-remote+host',
			sourceId: 'source-compatible',
			targetSourceId: 'source-local',
			requestId: dispatchRequest.requestId,
			result: { status: 'sent', resource: candidate.rawSessionResource.toString() },
		});
		let completedByIncompatibleResult = false;
		void dispatchPromise.then(() => completedByIncompatibleResult = true);
		await Promise.resolve();
		const completedBeforeCompatibleSourceClosed = completedByIncompatibleResult;
		compatible.dispose();
		const result = await dispatchPromise;
		pendingSourceDispatch.complete({ status: 'rejected' });

		assert.deepStrictEqual({
			incompatibleCandidates,
			incompatibleDispatches,
			completedByIncompatibleResult: completedBeforeCompatibleSourceClosed,
			result: { status: result?.status, reasonCode: result?.reasonCode },
		}, {
			incompatibleCandidates: [],
			incompatibleDispatches: 0,
			completedByIncompatibleResult: false,
			result: { status: 'rejected', reasonCode: 'providerRemoved' },
		});
	});

	test('dispatches to the exact source and preserves URI-bearing request options', async () => {
		const bus = new TestBrokerBus();
		let sourceAInvocations = 0;
		let sourceBInvocation: { resource: string; message: string; attachment: string | undefined; tools: Record<string, boolean> | undefined } | undefined;
		const sourceA = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-a',
			null,
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
			null,
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
				canOpenInCurrentWindow: result?.canOpenInCurrentWindow,
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
				canOpenInCurrentWindow: false,
			},
		});
	});

	test('trusted current-workspace source requests workspace trust before sending', async () => {
		const workspaceFolder = URI.parse('vscode-remote://ssh-remote+host/work/vscode');
		const harness = createSourceHarness({
			metadataWorkingDirectoryPath: '/work/vscode',
			workspaceFolder,
			remoteAuthority: 'ssh-remote+host',
			defaultUriScheme: 'vscode-remote',
			trusted: true,
		});

		const result = await harness.handler.sendRequest(harness.session.resource, 'Fix it', {
			userSelectedTools: constObservable({ terminal: true }),
		}, CancellationToken.None);

		assert.deepStrictEqual({
			result: { status: result.status, resource: result.resource?.toString(), requestId: result.requestId },
			trustRequests: harness.trustRequests,
			order: harness.order,
			sendCount: harness.sendOptions.length,
			tools: harness.sendOptions[0]?.userSelectedTools?.get(),
			disposedReferences: harness.disposedReferences(),
		}, {
			result: { status: 'sent', resource: harness.session.resource.toString(), requestId: 'request-1' },
			trustRequests: [{ kind: 'workspace' }],
			order: ['workspaceTrust', 'acquire', 'send'],
			sendCount: 1,
			tools: { terminal: true },
			disposedReferences: 1,
		});
	});

	test('declined standalone source trust rejects without loading or sending', async () => {
		const targetFolder = URI.parse('vscode-agent-host://remote-host/work/repo?_ah=metadata');
		const harness = createSourceHarness({
			resolvedWorkingDirectory: targetFolder,
			trusted: false,
		});

		const result = await harness.handler.sendRequest(harness.session.resource, 'Fix it', {}, CancellationToken.None);

		assert.deepStrictEqual({
			result: { status: result.status, resource: result.resource?.toString(), reasonCode: result.reasonCode },
			trustRequests: harness.trustRequests,
			order: harness.order,
			sendCount: harness.sendOptions.length,
		}, {
			result: {
				status: 'rejected',
				resource: harness.session.resource.toString(),
				reasonCode: 'workspaceNotTrusted',
			},
			trustRequests: [{ kind: 'resource', uri: targetFolder.toString() }],
			order: ['resourceTrust'],
			sendCount: 0,
		});
	});

	test('evaluates source trust at dispatch time and preserves the typed rejection over the broker', async () => {
		const bus = new TestBrokerBus();
		const harness = createSourceHarness({
			resolvedWorkingDirectory: URI.file('/standalone/repo'),
			trusted: true,
		});
		const sourceA = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-a',
			null,
			bus.createChannel(),
			async () => ({ status: 'rejected' }),
			error => assert.fail(error instanceof Error ? error : String(error)),
		));
		const sourceB = disposables.add(new GlobalOmniSessionBrokerClient(
			'profile',
			'source-b',
			null,
			bus.createChannel(),
			(resource, message, options, token) => harness.handler.sendRequest(resource, message, options, token),
			error => assert.fail(error instanceof Error ? error : String(error)),
		));
		sourceB.updateLocalSnapshot([snapshot(harness.session.resource.toString(), 'Remote')]);
		const candidate = sourceA.getAdditionalCandidates([])[0];
		harness.setTrusted(false);

		const result = await sourceA.dispatch(candidate.sessionId, 'Fix it', {}, CancellationToken.None);

		assert.deepStrictEqual({
			result: { status: result?.status, reasonCode: result?.reasonCode },
			trustRequests: harness.trustRequests,
			sendCount: harness.sendOptions.length,
		}, {
			result: { status: 'rejected', reasonCode: 'workspaceNotTrusted' },
			trustRequests: [{ kind: 'resource', uri: URI.file('/standalone/repo').toString() }],
			sendCount: 0,
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
			null,
			bus.createChannel(),
			async () => ({ status: 'rejected' }),
			error => assert.fail(error instanceof Error ? error : String(error)),
		));
		const sourceB = new GlobalOmniSessionBrokerClient(
			'profile',
			'source-b',
			null,
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
				null,
				bus.createChannel(),
				async () => ({ status: 'rejected' }),
				error => assert.fail(error instanceof Error ? error : String(error)),
				{ heartbeatInterval: 1_000, sourceExpiry: 5_000, dispatchTimeout: 20 },
			));
			const sourceB = disposables.add(new GlobalOmniSessionBrokerClient(
				'profile',
				'source-b',
				null,
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
	readonly messages: GlobalOmniSessionBrokerMessage[] = [];

	createChannel(): TestBrokerChannel {
		const channel = new TestBrokerChannel(this);
		this.channels.add(channel);
		return channel;
	}

	post(sender: TestBrokerChannel, message: GlobalOmniSessionBrokerMessage): void {
		this.messages.push(message);
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
	};
}

function createSourceHarness(options: {
	readonly resolvedWorkingDirectory?: URI;
	readonly metadataWorkingDirectoryPath?: string;
	readonly workspaceFolder?: URI;
	readonly remoteAuthority?: string;
	readonly defaultUriScheme?: string;
	readonly trusted: boolean;
}) {
	const state = { trusted: options.trusted };
	const order: string[] = [];
	const trustRequests: ({ readonly kind: 'workspace' } | { readonly kind: 'resource'; readonly uri: string })[] = [];
	const sendOptions: IChatSendRequestOptions[] = [];
	let disposedReferences = 0;
	const session = new class extends mock<IAgentSession>() {
		override readonly resource = URI.parse('agent-host-copilotcli:/source-session');
		override readonly providerType = AgentSessionProviders.AgentHostCopilot;
		override readonly metadata = options.metadataWorkingDirectoryPath
			? { workingDirectoryPath: options.metadataWorkingDirectoryPath }
			: undefined;
		override isArchived(): boolean { return false; }
	};
	const agentSessionsService = new class extends mock<IAgentSessionsService>() {
		override getSession(resource: URI): IAgentSession | undefined {
			return resource.toString() === session.resource.toString() ? session : undefined;
		}
	};
	const chatSessionsService = new class extends mock<IChatSessionsService>() {
		override getChatSessionContribution(): undefined { return undefined; }
	};
	const chatService = new class extends mock<IChatService>() {
		override async acquireOrLoadSession(): Promise<IChatModelReference> {
			order.push('acquire');
			return {
				object: new class extends mock<IChatModel>() { },
				dispose: () => disposedReferences++,
			};
		}
		override async sendRequest(_resource: URI, _message: string, requestOptions: IChatSendRequestOptions): Promise<ChatSendResult> {
			order.push('send');
			sendOptions.push(requestOptions);
			const response = new class extends mock<IChatResponseModel>() {
				override readonly requestId = 'request-1';
			};
			return {
				kind: 'sent',
				data: {
					agent: {} as IChatAgentData,
					responseCreatedPromise: Promise.resolve(response),
					responseCompletePromise: Promise.resolve(),
				},
			};
		}
	};
	const newSessionFolderService = new class extends mock<IAgentHostNewSessionFolderService>() {
		override getFolder(): undefined { return undefined; }
	};
	const workingDirectoryResolver = new class extends mock<IAgentHostSessionWorkingDirectoryResolver>() {
		override resolve(): URI | undefined { return options.resolvedWorkingDirectory; }
	};
	const workspaceContextService = new class extends mock<IWorkspaceContextService>() {
		override getWorkspaceFolder(resource: URI) {
			const workspaceFolder = options.workspaceFolder;
			if (workspaceFolder?.toString() === resource.toString()) {
				return { uri: workspaceFolder, name: 'workspace', index: 0, toResource: () => workspaceFolder };
			}
			return null;
		}
	};
	const workspaceTrustRequestService = new class extends mock<IWorkspaceTrustRequestService>() {
		override async requestWorkspaceTrust(_options?: WorkspaceTrustRequestOptions): Promise<boolean | undefined> {
			order.push('workspaceTrust');
			trustRequests.push({ kind: 'workspace' });
			return state.trusted;
		}
		override async requestResourcesTrust(requestOptions: ResourceTrustRequestOptions): Promise<boolean | undefined> {
			order.push('resourceTrust');
			trustRequests.push({ kind: 'resource', uri: requestOptions.uri.toString() });
			return state.trusted;
		}
	};
	const pathService = new class extends mock<IPathService>() {
		override readonly defaultUriScheme = options.defaultUriScheme ?? 'file';
		override async fileURI(path: string): Promise<URI> { return URI.file(path); }
	};
	const environmentService = new class extends mock<IWorkbenchEnvironmentService>() {
		override readonly remoteAuthority = options.remoteAuthority;
	};
	const logService = new class extends mock<ILogService>() {
		override warn(): void { }
	};
	const handler = new GlobalOmniSessionSourceRequestHandler(
		agentSessionsService,
		chatSessionsService,
		chatService,
		newSessionFolderService,
		workingDirectoryResolver,
		workspaceContextService,
		workspaceTrustRequestService,
		pathService,
		environmentService,
		logService,
	);
	return {
		handler,
		session,
		order,
		trustRequests,
		sendOptions,
		disposedReferences: () => disposedReferences,
		setTrusted: (trusted: boolean) => state.trusted = trusted,
	};
}
