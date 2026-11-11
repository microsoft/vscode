/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import type { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import { LOCAL_MODEL_REQUEST_KEY, LOCAL_MODEL_STATUS_KEY, type ILocalModelConsent, type ILocalModelStatusV1, type ILocalTurnExecution } from '../../../common/localModel.js';
import type { ProtectedResourceMetadata } from '../../../common/state/protocol/state.js';
import { IAgentConfigurationService } from '../../../node/agentConfigurationService.js';
import type { ILocalModelLiveConfig, ILocalModelModelRow, ILocalModelProvider, ILocalModelSessionConfigContribution } from '../../../node/copilot/localModelBridge/localModelProvider.js';
import { createInitialLocalModelStatus } from '../../../node/copilot/localModelBridge/shim/shimLocalModelProvider.js';
import { LocalModelSetupChannel } from '../../../node/localModelSetupChannel.js';

class TestConfigurationService extends mock<IAgentConfigurationService>() implements IDisposable {
	private readonly _onDidRootConfigChange = new Emitter<void>();
	override readonly onDidRootConfigChange = this._onDidRootConfigChange.event;
	readonly values: Record<string, unknown> = {};
	readonly published: (ILocalModelStatusV1 | undefined)[] = [];

	override getRootConfigValues(): Readonly<Record<string, unknown>> {
		return this.values;
	}

	override updateRootConfig(patch: Record<string, unknown>): void {
		Object.assign(this.values, patch);
		this._onDidRootConfigChange.fire();
	}

	override publishRootTransientValues(patch: Readonly<Record<string, unknown>>): void {
		if (Object.hasOwn(patch, LOCAL_MODEL_STATUS_KEY)) {
			this.published.push(patch[LOCAL_MODEL_STATUS_KEY] as ILocalModelStatusV1 | undefined);
		}
		this.updateRootConfig({ ...patch });
	}

	dispose(): void {
		this._onDidRootConfigChange.dispose();
	}
}

class TestLocalModelProvider extends Disposable implements ILocalModelProvider {
	readonly statusValue = observableValue<ILocalModelStatusV1>(this, createInitialLocalModelStatus(true));
	readonly status = this.statusValue;
	readonly onDidChangeModelRows = this._register(new Emitter<void>()).event;
	readonly requestHandler = undefined;
	readonly calls: string[] = [];
	setUpAdmission = Promise.resolve();

	setUp(familyId: string, consent: ILocalModelConsent, _token: CancellationToken): Promise<void> {
		this.calls.push(`setUp:${familyId}:${consent.scope}`);
		return this.setUpAdmission;
	}
	async update(familyId: string): Promise<void> { this.calls.push(`update:${familyId}`); }
	async remove(familyId: string): Promise<void> { this.calls.push(`remove:${familyId}`); }
	cancel(operationId: string): void { this.calls.push(`cancel:${operationId}`); }
	pause(operationId: string): void { this.calls.push(`pause:${operationId}`); }
	async resume(operationId: string): Promise<void> { this.calls.push(`resume:${operationId}`); }
	async retry(operationId: string): Promise<void> { this.calls.push(`retry:${operationId}`); }
	async makeActive(familyId: string): Promise<void> { this.calls.push(`makeActive:${familyId}`); }
	async setContextSize(familyId: string, contextTokens: number): Promise<void> { this.calls.push(`setContextSize:${familyId}:${contextTokens}`); }
	async start(): Promise<void> { this.calls.push('start'); }
	async stop(options: { readonly stopNow: boolean }): Promise<void> { this.calls.push(options.stopNow ? 'stopNow' : 'stop'); }
	async stopPrevious(): Promise<void> { this.calls.push('stopPrevious'); }
	async refreshCatalog(): Promise<void> { this.calls.push('refreshCatalog'); }
	updateLiveConfig(_config: ILocalModelLiveConfig): void { }
	setSessionDirectFamily(): void { }
	contributeSessionConfig(): ILocalModelSessionConfigContribution { return { providers: [], models: [] }; }
	contributeProtectedResources(): readonly ProtectedResourceMetadata[] { return []; }
	authenticate(): boolean { return false; }
	onAutoSessionStarted(): void { }
	onAccountChanged(): void { }
	getModelRows(): readonly ILocalModelModelRow[] { return []; }
	beginTurn(): number { return 0; }
	endTurn(): ILocalTurnExecution | undefined { return undefined; }
}

function statusWithOperation(completedBytes: number): ILocalModelStatusV1 {
	return {
		...createInitialLocalModelStatus(true),
		families: [{
			familyId: 'mai-code-1.1-flash-local',
			capiId: 'mai-code-1.1-flash-local',
			autoCapable: true,
			displayName: 'Example Flash 1.0',
			operation: { id: 'op-1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes, totalBytes: 100 },
			usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 },
			consentGiven: true,
		}],
	};
}

suite('LocalModelSetupChannel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createChannel(options: { readonly pendingRequest?: unknown } = {}) {
		const configuration = store.add(new TestConfigurationService());
		if (options.pendingRequest !== undefined) {
			configuration.values[LOCAL_MODEL_REQUEST_KEY] = options.pendingRequest;
		}
		const provider = store.add(new TestLocalModelProvider());
		const channel = store.add(new LocalModelSetupChannel(provider, configuration, new NullLogService()));
		const request = (value: unknown) => configuration.updateRootConfig({ [LOCAL_MODEL_REQUEST_KEY]: value });
		return { channel, configuration, provider, request };
	}

	test('publishes status, coalesces byte-only changes and withdraws the status on dispose', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { channel, configuration, provider } = createChannel();
		provider.statusValue.set(statusWithOperation(10), undefined);
		provider.statusValue.set(statusWithOperation(20), undefined);
		provider.statusValue.set(statusWithOperation(30), undefined);
		const beforeInterval = configuration.published.length;
		await timeout(1000);
		const afterInterval = configuration.published.length;
		channel.dispose();

		assert.deepStrictEqual({
			beforeInterval,
			afterInterval,
			bytes: configuration.published.map(status => status?.families[0]?.operation?.completedBytes ?? null),
			last: configuration.published.at(-1),
		}, {
			beforeInterval: 2,
			afterInterval: 3,
			bytes: [null, 10, 30, null],
			last: undefined,
		});
	}));

	test('claims each nonce once, clears the key first and ignores malformed requests', async () => {
		const { configuration, provider, request } = createChannel();
		// An older client also sends how llama.cpp is provided: the scope alone is the consent.
		const consent = { scope: 'scope', runtimeChoice: 'installWithPackageManager' };
		request({ nonce: 'n1', action: 'setUp', familyId: 'mai-code-1.1-flash-local', consent });
		const keyAfterClaim = configuration.values[LOCAL_MODEL_REQUEST_KEY];
		request({ nonce: 'n1', action: 'setUp', familyId: 'mai-code-1.1-flash-local', consent });
		request({ nonce: 'n2', action: 'setUp', familyId: 'mai-code-1.1-flash-local' });
		// An older client's Switch to Public Build: no longer an action.
		request({ nonce: 'n3', action: 'replaceWithPublic', familyId: 'mai-code-1.1-flash-local', consent });
		request({ nonce: 'n4', action: 'start' });
		await timeout(0);

		assert.deepStrictEqual({ keyAfterClaim, key: configuration.values[LOCAL_MODEL_REQUEST_KEY], calls: provider.calls }, {
			keyAfterClaim: undefined,
			key: undefined,
			calls: ['setUp:mai-code-1.1-flash-local:scope', 'start'],
		});
	});

	test('runs cancel immediately while transitions wait for the previous admission', async () => {
		const { provider, request } = createChannel();
		const admission = new DeferredPromise<void>();
		provider.setUpAdmission = admission.p;
		request({ nonce: 'n1', action: 'setUp', familyId: 'f', consent: { scope: 'scope' } });
		request({ nonce: 'n2', action: 'makeActive', familyId: 'f' });
		await timeout(0);
		request({ nonce: 'n3', action: 'cancel', operationId: 'op-1' });
		const whileAdmitting = [...provider.calls];
		await admission.complete();
		await timeout(0);

		assert.deepStrictEqual({ whileAdmitting, calls: provider.calls }, {
			whileAdmitting: ['setUp:f:scope', 'cancel:op-1'],
			calls: ['setUp:f:scope', 'cancel:op-1', 'makeActive:f'],
		});
	});

	test('routes every action to the provider', async () => {
		const { provider, request } = createChannel();
		let nonce = 0;
		for (const value of [
			{ action: 'pause', operationId: 'op' },
			{ action: 'resume', operationId: 'op' },
			{ action: 'retry', operationId: 'op' },
			{ action: 'update', familyId: 'f' },
			{ action: 'remove', familyId: 'f' },
			{ action: 'setContextSize', familyId: 'f', contextTokens: 65536 },
			{ action: 'stop' },
			{ action: 'stopNow' },
			{ action: 'stopPrevious' },
			// An older client's Update llama.cpp and llama.cpp approval: no longer actions.
			{ action: 'updateRuntime' },
			{ action: 'approveRuntime', consent: { scope: 'runtime-scope' } },
			{ action: 'refreshCatalog' },
		]) {
			request({ ...value, nonce: `n${nonce++}` });
		}
		await timeout(0);

		assert.deepStrictEqual(provider.calls, [
			'pause:op',
			'refreshCatalog',
			'resume:op',
			'retry:op',
			'update:f',
			'remove:f',
			'setContextSize:f:65536',
			'stop',
			'stopNow',
			'stopPrevious',
		]);
	});

	test('discards a request written before the channel existed', async () => {
		const { configuration, provider } = createChannel({ pendingRequest: { nonce: 'stale', action: 'start' } });
		await timeout(0);

		assert.deepStrictEqual({ key: configuration.values[LOCAL_MODEL_REQUEST_KEY], calls: provider.calls }, { key: undefined, calls: [] });
	});
});
