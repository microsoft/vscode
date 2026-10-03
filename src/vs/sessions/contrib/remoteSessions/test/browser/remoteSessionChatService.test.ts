/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter } from '../../../../../base/common/event.js';
import { derived, observableValue, transaction } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostConnectionsService, IAgentHostSessionResolution } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IChatModelReference, IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatSession, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatModel, IChatPendingRequest } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { RemoteSessionChatService } from '../../browser/remoteSessionChatService.js';

suite('RemoteSessionChatService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('remote-host-copilotcli:/session#peer');

	function setup() {
		const pendingChanged = store.add(new Emitter<void>());
		const disposed = store.add(new Emitter<void>());
		const connectionsChanged = store.add(new Emitter<void>());
		const resolutionChanged = store.add(new Emitter<void>());
		store.add(connectionsChanged.event(() => resolutionChanged.fire()));
		const active = observableValue('active', false);
		const waitingForApproval = observableValue('waitingForApproval', false);
		const queued: IChatPendingRequest[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override clientId = 'window-client';
		}();
		const resolution: IAgentHostSessionResolution = {
			connection,
			connectionAuthority: 'host',
			backendSession: URI.parse('copilotcli:/session'),
		};
		const state = {
			references: 0,
			claims: 0,
			loads: 0,
			connected: true,
			available: true,
			resolution,
			load: async () => { },
			getSession: async () => { },
			prepare: async () => { },
		};
		const model = upcastPartial<IChatModel>({
			requestInProgress: derived(reader => active.read(reader) && !waitingForApproval.read(reader)),
			hasActiveRequest: active,
			getPendingRequests: () => queued,
			onDidChangePendingRequests: pendingChanged.event,
			onDidDispose: disposed.event,
		});
		const service = store.add(new RemoteSessionChatService(
			new class extends mock<IChatService>() {
				override async acquireOrLoadSession(): Promise<IChatModelReference | undefined> {
					state.loads++;
					await state.load();
					if (!state.available) {
						return undefined;
					}
					state.references++;
					return { object: model, dispose: () => state.references-- };
				}
			}(),
			new class extends mock<IChatSessionsService>() {
				override async getOrCreateChatSession(): Promise<IChatSession> {
					await state.getSession();
					return upcastPartial<IChatSession>({
						prepareForClientTools: async () => {
							state.claims++;
							await state.prepare();
						},
					});
				}
			}(),
			new class extends mock<IAgentHostConnectionsService>() {
				override readonly onDidChangeConnections = connectionsChanged.event;
				override readonly onDidChangeSessionResolution = resolutionChanged.event;
				override resolveSessionResource(): IAgentHostSessionResolution | undefined {
					return state.connected ? state.resolution : undefined;
				}
			}(),
		));
		return { service, active, waitingForApproval, queued, pendingChanged, disposed, connectionsChanged, resolutionChanged, connection, state };
	}

	function replaceConnection(state: ReturnType<typeof setup>['state']): void {
		state.resolution = {
			...state.resolution,
			connection: upcastPartial<IAgentConnection>({ clientId: state.resolution.connection.clientId }),
		};
	}

	test('keeps the initial background chat alive while a tool is awaiting approval', async () => {
		const { service, state, active, waitingForApproval } = setup();
		const reference = await service.acquire(resource, CancellationToken.None);
		active.set(true, undefined);
		reference.releaseWhenIdle();
		waitingForApproval.set(true, undefined);
		assert.strictEqual(state.references, 1, 'an unfinished request is not idle while waiting for approval');
		waitingForApproval.set(false, undefined);
		assert.strictEqual(state.references, 1);
		active.set(false, undefined);
		assert.strictEqual(state.references, 0);
	});

	test('one parallel reply finishing does not release other chats waiting for approval', async () => {
		const chats = [setup(), setup(), setup()];
		for (const chat of chats) {
			const reference = await chat.service.acquire(resource, CancellationToken.None);
			chat.active.set(true, undefined);
			reference.releaseWhenIdle();
		}
		chats[1].waitingForApproval.set(true, undefined);
		chats[2].waitingForApproval.set(true, undefined);
		chats[0].active.set(false, undefined);
		assert.deepStrictEqual(chats.map(chat => chat.state.references), [0, 1, 1]);
		for (const chat of chats.slice(1)) {
			chat.waitingForApproval.set(false, undefined);
			chat.active.set(false, undefined);
		}
		assert.deepStrictEqual(chats.map(chat => chat.state.references), [0, 0, 0]);
	});

	test('keeps the chat alive while its initial background request runs', async () => {
		const { service, state, active } = setup();
		const reference = await service.acquire(resource, CancellationToken.None);
		assert.strictEqual(state.references, 1);
		active.set(true, undefined);
		reference.releaseWhenIdle();
		assert.strictEqual(state.references, 1);
		active.set(false, undefined);
		assert.strictEqual(state.references, 0);
	});

	test('retains a queued reply while the parent is active, across queue draining and its reply turn', async () => {
		const { service, state, active, queued, pendingChanged } = setup();
		const reference = await service.acquire(resource, CancellationToken.None, true);
		active.set(true, undefined);
		queued.push(upcastPartial<IChatPendingRequest>({}));
		reference.releaseWhenIdle();
		active.set(false, undefined);
		assert.deepStrictEqual({ references: state.references, claims: state.claims }, { references: 1, claims: 1 });
		transaction(tx => {
			active.set(true, tx);
			queued.pop();
			pendingChanged.fire();
		});
		assert.strictEqual(state.references, 1);
		active.set(false, undefined);
		assert.strictEqual(state.references, 0);
	});

	test('the last of three background chats retains its own client tool context', async () => {
		const chats = [setup(), setup(), setup()];
		for (const chat of chats) {
			const reference = await chat.service.acquire(resource, CancellationToken.None, true);
			chat.active.set(true, undefined);
			reference.releaseWhenIdle();
		}
		chats[0].active.set(false, undefined);
		chats[1].active.set(false, undefined);
		assert.deepStrictEqual(chats.map(chat => chat.state.references), [0, 0, 1]);
		chats[2].active.set(false, undefined);
		assert.deepStrictEqual(chats.map(chat => chat.state.references), [0, 0, 0]);
	});

	test('waits for the client tool claim before returning the background reference', async () => {
		const { service, state } = setup();
		const gate = new DeferredPromise<void>();
		state.prepare = () => gate.p;
		let acquired = false;
		const operation = service.acquire(resource, CancellationToken.None, true).then(reference => {
			acquired = true;
			return reference;
		});
		await Promise.resolve();
		assert.strictEqual(acquired, false);
		await gate.complete();
		(await operation).dispose();
		assert.deepStrictEqual({ acquired, claims: state.claims, references: state.references }, { acquired: true, claims: 1, references: 0 });
	});

	test('failed client-tool preparation releases the model', async () => {
		const { service, state } = setup();
		state.prepare = async () => { throw new Error('Preparation failed'); };
		await assert.rejects(service.acquire(resource, CancellationToken.None, true), /Preparation failed/);
		assert.strictEqual(state.references, 0);
	});

	test('disposes a model acquired after service shutdown', async () => {
		const { service, state } = setup();
		const gate = new DeferredPromise<void>();
		state.load = () => gate.p;
		const operation = assert.rejects(service.acquire(resource, CancellationToken.None, true), CancellationError);
		service.dispose();
		await gate.complete();
		await operation;
		assert.deepStrictEqual({ loads: state.loads, references: state.references, claims: state.claims }, { loads: 1, references: 0, claims: 0 });
	});

	test('cancellation while loading releases the acquired model without claiming client tools', async () => {
		const { service, state } = setup();
		const cancellation = store.add(new CancellationTokenSource());
		const gate = new DeferredPromise<void>();
		state.load = () => gate.p;
		const operation = assert.rejects(service.acquire(resource, cancellation.token, true), CancellationError);
		cancellation.cancel();
		await gate.complete();
		await operation;
		assert.deepStrictEqual({ references: state.references, claims: state.claims }, { references: 0, claims: 0 });
	});

	test('does not load a chat while its host is disconnected', async () => {
		const { service, state } = setup();
		state.connected = false;
		await assert.rejects(service.acquire(resource, CancellationToken.None, true), /no longer connected/);
		assert.deepStrictEqual({ loads: state.loads, references: state.references, claims: state.claims }, { loads: 0, references: 0, claims: 0 });
	});

	for (const phase of ['load', 'getSession', 'prepare'] as const) {
		for (const notify of [true, false]) {
			test(`rejects a replacement connection during ${phase} ${notify ? 'with' : 'without'} a resolution event`, async () => {
				const { service, state, resolutionChanged } = setup();
				const started = new DeferredPromise<void>();
				const gate = new DeferredPromise<void>();
				state[phase] = async () => {
					await started.complete();
					await gate.p;
				};
				const operation = assert.rejects(service.acquire(resource, CancellationToken.None, true), CancellationError);
				await started.p;
				replaceConnection(state);
				if (notify) {
					resolutionChanged.fire();
				}
				const retainedAfterReplacement = state.references;
				await gate.complete();
				await operation;
				assert.deepStrictEqual({ retainedAfterReplacement, references: state.references, claims: state.claims }, {
					retainedAfterReplacement: notify || phase === 'load' ? 0 : 1,
					references: 0,
					claims: phase === 'prepare' ? 1 : 0,
				});
			});
		}
	}

	for (const identity of ['connection', 'authority', 'backend session', 'client identity'] as const) {
		test(`releases a retained chat when its ${identity} changes`, async () => {
			const { service, state, active, waitingForApproval, connection, resolutionChanged } = setup();
			const reference = await service.acquire(resource, CancellationToken.None, true);
			active.set(true, undefined);
			waitingForApproval.set(true, undefined);
			reference.releaseWhenIdle();
			switch (identity) {
				case 'connection':
					replaceConnection(state);
					break;
				case 'authority':
					state.resolution = { ...state.resolution, connectionAuthority: 'replacement-host' };
					break;
				case 'backend session':
					state.resolution = { ...state.resolution, backendSession: URI.parse('copilot:/session') };
					break;
				case 'client identity':
					connection.clientId = 'replacement-client';
					break;
			}
			resolutionChanged.fire();
			const retainedAfterReplacement = state.references;
			reference.dispose();
			assert.deepStrictEqual({ retainedAfterReplacement, references: state.references, claims: state.claims }, {
				retainedAfterReplacement: 0, references: 0, claims: 1,
			});
		});
	}

	test('unrelated connection and resolution events preserve the retained approval-aware chat', async () => {
		const { service, state, active, waitingForApproval, connectionsChanged, resolutionChanged } = setup();
		const reference = await service.acquire(resource, CancellationToken.None, true);
		active.set(true, undefined);
		waitingForApproval.set(true, undefined);
		reference.releaseWhenIdle();
		state.resolution = { ...state.resolution, backendSession: URI.parse('copilotcli:/session') };
		connectionsChanged.fire();
		resolutionChanged.fire();
		const retainedAfterEvents = state.references;
		active.set(false, undefined);
		assert.deepStrictEqual({ retainedAfterEvents, references: state.references, claims: state.claims }, {
			retainedAfterEvents: 1, references: 0, claims: 1,
		});
	});

	test('cancelled queued work releases its retained chat', async () => {
		const { service, state, queued, pendingChanged } = setup();
		const reference = await service.acquire(resource, CancellationToken.None);
		queued.push(upcastPartial<IChatPendingRequest>({}));
		reference.releaseWhenIdle();
		queued.pop();
		pendingChanged.fire();
		assert.strictEqual(state.references, 0);
	});

	test('disconnect and service shutdown release background references', async () => {
		const { service, state, active, connectionsChanged } = setup();
		await service.acquire(resource, CancellationToken.None);
		active.set(true, undefined);
		state.connected = false;
		connectionsChanged.fire();
		assert.strictEqual(state.references, 0);
		state.connected = true;
		await service.acquire(resource, CancellationToken.None);
		service.dispose();
		assert.strictEqual(state.references, 0);
	});

	test('missing and cancelled chats do not acquire a background reference', async () => {
		const { service, state } = setup();
		await assert.rejects(service.acquire(resource, CancellationToken.Cancelled));
		state.available = false;
		await assert.rejects(service.acquire(resource, CancellationToken.None), /Unable to load/);
		assert.strictEqual(state.references, 0);
	});
});
