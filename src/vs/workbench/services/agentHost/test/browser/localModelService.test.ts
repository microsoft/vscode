/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { IAgentConnection, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { LOCAL_MODEL_REQUEST_KEY, LOCAL_MODEL_STATUS_KEY, LocalModelUseInAutoSettingId, type ILocalModelFamilyV1, type ILocalModelStatusV1 } from '../../../../../platform/agentHost/common/localModel.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { IRootConfigChangedAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import type { RootState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { LocalModelService } from '../../browser/localModelService.js';
import { getLocalModelServerStopId, getLocalModelStopNowId, type ILocalModelInteractionHandler } from '../../common/localModelService.js';

class TestRootState implements IAgentSubscription<RootState> {
	private readonly _onDidChange = new Emitter<RootState>();
	readonly onDidChange = this._onDidChange.event;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;
	value: RootState | undefined;

	get verifiedValue(): RootState | undefined {
		return this.value;
	}

	set(values: Record<string, unknown>): void {
		this.value = { agents: [], config: { schema: { type: 'object', properties: {} }, values } };
		this._onDidChange.fire(this.value);
	}

	dispose(): void {
		this._onDidChange.dispose();
	}
}

class TestConnection extends mock<IAgentHostService>() {
	private readonly _onAgentHostStart = new Emitter<void>();
	override readonly onAgentHostStart = this._onAgentHostStart.event;
	readonly dispatched: unknown[] = [];
	current = new TestRootState();
	private readonly _previous: TestRootState[] = [];

	/** Like the real ambient connection: a getter over whichever protocol client is current. */
	override readonly rootState: IAgentSubscription<RootState> = (() => {
		const self = this;
		return {
			get value() { return self.current.value; },
			get verifiedValue() { return self.current.value; },
			get onDidChange() { return self.current.onDidChange; },
			onWillApplyAction: Event.None,
			onDidApplyAction: Event.None,
		};
	})();

	override dispatch(_channel: string, action: IRootConfigChangedAction): void {
		this.dispatched.push(action.config[LOCAL_MODEL_REQUEST_KEY]);
	}

	/** Simulates a host restart: a new protocol client with its own root state. */
	restart(values: Record<string, unknown>): void {
		this._previous.push(this.current);
		this.current = new TestRootState();
		this.current.set(values);
		this._onAgentHostStart.fire();
	}

	dispose(): void {
		this._onAgentHostStart.dispose();
		this.current.dispose();
		this._previous.forEach(state => state.dispose());
	}
}

class RecordingConfigurationService extends TestConfigurationService {
	readonly updates: [string, unknown][] = [];

	override updateValue(key: string, value: unknown): Promise<void> {
		this.updates.push([key, value]);
		return Promise.resolve();
	}
}

const family: ILocalModelFamilyV1 = {
	familyId: 'mai-code-1.1-flash-local',
	capiId: 'mai-code-1.1-flash-local',
	autoCapable: true,
	displayName: 'Example Flash 1.0',
	install: { contentId: 'c1', adopted: false, owned: true, modelId: 'MAI-Code-1.1-Flash' },
	usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
	consentGiven: true,
};

const otherFamily: ILocalModelFamilyV1 = {
	...family,
	familyId: 'example-coder-local',
	capiId: 'example-coder-local',
	displayName: 'Example Coder',
	install: { contentId: 'c2', adopted: false, owned: true, modelId: 'Example-Coder' },
	usage: { runningStreams: 1, boundDirectChats: 0, liveAutoRoutes: 0 },
};

const status: ILocalModelStatusV1 = {
	schemaVersion: 1,
	device: { confidence: 'measured' },
	runtime: { version: 'b11459' },
	catalog: { state: 'ready', registries: { azureml: 'empty' } },
	families: [family, otherFamily],
	active: { familyId: otherFamily.familyId, contentId: 'c2', servingGeneration: 1, server: 'ready' },
	useInAuto: true,
};

suite('LocalModelService', () => {
	const disposables = new DisposableStore();
	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const local = new TestConnection();
		const remote = new TestConnection();
		disposables.add({ dispose: () => { local.dispose(); remote.dispose(); } });
		local.current.set({ [LOCAL_MODEL_STATUS_KEY]: status });
		remote.current.set({ unrelated: true });
		const configurationService = new RecordingConfigurationService();
		const service = disposables.add(new LocalModelService(local, configurationService, new NullLogService()));
		return { local, remote, service, configurationService };
	}

	test('holds status per connection; a host that publishes none shows nothing and receives no requests', () => {
		const { local, remote, service } = setup();
		const remoteConnection: IAgentConnection = remote;

		assert.deepStrictEqual({
			local: service.getStatus(local).get()?.families.map(candidate => candidate.familyId),
			remote: service.getStatus(remoteConnection).get(),
			sentToRemote: service.cancel(remoteConnection, 'op-1'),
			remoteDispatched: remote.dispatched,
			sentToLocal: service.cancel(local, 'op-1'),
			localDispatched: local.dispatched.map(request => ({ ...request as object, nonce: typeof (request as { nonce?: unknown }).nonce })),
		}, {
			local: [family.familyId, otherFamily.familyId],
			remote: undefined,
			sentToRemote: false,
			remoteDispatched: [],
			sentToLocal: true,
			localDispatched: [{ action: 'cancel', operationId: 'op-1', nonce: 'string' }],
		});
	});

	test('follows the ambient host across restarts', () => {
		const { local, service } = setup();
		const seen: (number | undefined)[] = [];
		disposables.add(autorun(reader => seen.push(service.getStatus(local).read(reader)?.families.length)));
		local.restart({});
		local.current.set({ [LOCAL_MODEL_STATUS_KEY]: { ...status, families: [family] } });

		assert.deepStrictEqual(seen, [2, undefined, 1]);
	});

	test('sends consent given on the detail page, loads another model without asking, and confirmed actions only after the registered confirmation', async () => {
		const { local, service } = setup();
		const consent = { scope: 'scope' } as const;
		const withoutHandler = await service.remove(local, family.familyId);
		const asked: string[] = [];
		const handler: ILocalModelInteractionHandler = {
			confirmStopNow: async () => true,
			confirmRemove: async (_connection, _status, target) => { asked.push(`remove:${target.familyId}`); return false; },
		};
		disposables.add(service.registerInteractionHandler(handler));

		const results = {
			withoutHandler,
			setUp: service.setUp(local, family.familyId, consent),
			unknownFamily: service.setUp(local, 'unknown', consent),
			// The active model is in use: the swap is still sent at once; the host drains it first.
			makeActive: service.makeActive(local, family.familyId),
			activeAgain: service.makeActive(local, otherFamily.familyId),
			unknownMakeActive: service.makeActive(local, 'unknown'),
			remove: await service.remove(local, family.familyId),
			stopNow: await service.stopNow(local),
		};

		assert.deepStrictEqual({
			results,
			asked,
			dispatched: local.dispatched.map(request => {
				const { nonce: _nonce, ...rest } = request as Record<string, unknown>;
				return rest;
			}),
		}, {
			results: { withoutHandler: false, setUp: true, unknownFamily: false, makeActive: true, activeAgain: true, unknownMakeActive: false, remove: false, stopNow: true },
			asked: [`remove:${family.familyId}`],
			dispatched: [
				{ action: 'setUp', familyId: family.familyId, consent },
				{ action: 'makeActive', familyId: family.familyId },
				{ action: 'makeActive', familyId: otherFamily.familyId },
				{ action: 'stopNow' },
			],
		});
	});

	test('blocks sending to an installed model that is not active and writes the Auto toggle', async () => {
		const { local, remote, service, configurationService } = setup();
		await service.setUseInAuto(false);

		assert.deepStrictEqual({
			inactive: await service.checkBeforeSend(local, URI.parse('agent-host-copilotcli:/s1'), family.install!.modelId),
			active: await service.checkBeforeSend(local, URI.parse('agent-host-copilotcli:/s1'), otherFamily.install!.modelId),
			cloud: await service.checkBeforeSend(local, URI.parse('agent-host-copilotcli:/s1'), 'gpt-5.5'),
			remote: await service.checkBeforeSend(remote, URI.parse('remote-x-copilotcli:/s1'), family.install!.modelId),
			useInAuto: configurationService.updates,
		}, {
			inactive: { kind: 'block', reason: 'modelNotActive', familyId: family.familyId, activeFamilyId: otherFamily.familyId },
			active: { kind: 'allow' },
			cloud: { kind: 'allow' },
			remote: { kind: 'allow' },
			useInAuto: [[LocalModelUseInAutoSettingId, false]],
		});
	});

	test('a stop shows as pending until the operation\'s state or phase changes, once, or for at most 10 seconds', () => runWithFakedTimers({}, async () => {
		const { local, service } = setup();
		const operation = { id: 'op-1', kind: 'update', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes: 1, totalBytes: 10 } as const;
		const publish = (op: ILocalModelFamilyV1['operation'], active = status.active) => local.current.set({ [LOCAL_MODEL_STATUS_KEY]: { ...status, families: [{ ...family, operation: op }, otherFamily], active } });
		const pending = service.getPendingStops(local);
		const seen: string[][] = [];
		disposables.add(autorun(reader => seen.push([...pending.read(reader)])));
		publish(operation);
		service.pause(local, 'op-1');
		publish({ ...operation, completedBytes: 5 });
		publish({ ...operation, state: 'paused', pausedReason: 'user' });
		// Resumed: the pause took effect, so it doesn't show again.
		publish(operation);
		const afterResume = [...pending.get()];
		// A cancel the host never acts on stops showing after a while.
		service.cancel(local, 'op-1');
		const afterCancel = [...pending.get()];
		await timeout(10_000);
		const afterTimeout = [...pending.get()];
		// Stop Now stops the drain of the operation waiting for it.
		disposables.add(service.registerInteractionHandler(upcastPartial<ILocalModelInteractionHandler>({ confirmStopNow: async () => true })));
		publish({ ...operation, id: 'swap-1', kind: 'swap', phase: 'draining' }, { ...status.active!, drain: { runningStreams: 1 } });
		await service.stopNow(local);
		const afterStopNow = [...pending.get()];
		publish({ ...operation, id: 'swap-1', kind: 'swap', phase: 'loading' });
		assert.deepStrictEqual({ seen, afterResume, afterCancel, afterTimeout, afterStopNow, afterLoading: [...pending.get()] }, {
			seen: [[], ['op-1'], [], ['op-1'], [], ['stopNow:swap-1'], []],
			afterResume: [],
			afterCancel: ['op-1'],
			afterTimeout: [],
			// Its own key, so a Cancel of the same drain reads differently.
			afterStopNow: [getLocalModelStopNowId('swap-1')],
			afterLoading: [],
		});
	}));

	test('Stop shows the active model\'s server as pending until its state changes, or for at most 10 seconds', () => runWithFakedTimers({}, async () => {
		const { local, service } = setup();
		const publish = (server: NonNullable<ILocalModelStatusV1['active']>['server']) => local.current.set({ [LOCAL_MODEL_STATUS_KEY]: { ...status, active: { ...status.active!, server } } });
		const pending = service.getPendingStops(local);
		const seen: string[][] = [];
		disposables.add(autorun(reader => seen.push([...pending.read(reader)])));
		service.stop(local);
		publish('ready');
		publish('stopping');
		publish('ready');
		// A stop the host never acts on stops showing after a while.
		service.stop(local);
		await timeout(10_000);
		assert.deepStrictEqual({ seen, stopId: getLocalModelServerStopId(otherFamily.familyId), dispatched: local.dispatched.map(request => (request as { action: string }).action) }, {
			seen: [[], [getLocalModelServerStopId(otherFamily.familyId)], [], [getLocalModelServerStopId(otherFamily.familyId)], []],
			stopId: 'server:example-coder-local',
			dispatched: ['stop', 'stop'],
		});
	}));

	test('sends a context size only when it is one of the installed family\'s options', () => {
		const { local, service } = setup();
		const context = { tokens: 131072, options: [{ tokens: 65536, gpuBytes: 6917 * 1024 ** 2 }, { tokens: 131072, gpuBytes: 8729 * 1024 ** 2 }] };
		local.current.set({ [LOCAL_MODEL_STATUS_KEY]: { ...status, families: [{ ...family, context }, otherFamily] } });

		assert.deepStrictEqual({
			option: service.setContextSize(local, family.familyId, 65536),
			notAnOption: service.setContextSize(local, family.familyId, 262144),
			noContext: service.setContextSize(local, otherFamily.familyId, 65536),
			unknownFamily: service.setContextSize(local, 'unknown', 65536),
			dispatched: local.dispatched.map(request => ({ ...request as object, nonce: typeof (request as { nonce?: unknown }).nonce })),
		}, {
			option: true,
			notAnOption: false,
			noContext: false,
			unknownFamily: false,
			dispatched: [{ action: 'setContextSize', familyId: family.familyId, contextTokens: 65536, nonce: 'string' }],
		});
	});
});
