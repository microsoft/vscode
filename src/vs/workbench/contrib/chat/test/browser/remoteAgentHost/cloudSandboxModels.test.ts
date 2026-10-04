/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ICloudSandboxApiService } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService, IPromptChoice, NoOpNotification } from '../../../../../../platform/notification/common/notification.js';
import { CloudSandboxModels } from '../../../browser/remoteAgentHost/cloudSandboxModels.js';
import { ILanguageModelsService } from '../../../common/languageModels.js';
import { AgentHostLanguageModelProvider } from '../../../browser/agentSessions/agentHost/agentHostLanguageModelProvider.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../../base/common/errors.js';

suite('CloudSandboxModels', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function setup(listModels: ICloudSandboxApiService['listModels'], modelProvider?: AgentHostLanguageModelProvider) {
		const instantiation = store.add(new TestInstantiationService());
		const accounts = store.add(new Emitter<string | undefined>());
		const errors: string[] = [];
		const retries: IPromptChoice[] = [];
		const notified = new DeferredPromise<void>();
		instantiation.stub(ICloudSandboxApiService, { onDidChangeAccount: accounts.event, listModels });
		instantiation.stub(IInstantiationService, instantiation);
		instantiation.stub(ILanguageModelsService, { deltaLanguageModelChatProviderDescriptors: () => { }, registerLanguageModelProvider: () => toDisposable(() => { }) });
		instantiation.stub(ILogService, new NullLogService());
		instantiation.stub(INotificationService, {
			prompt: (_severity, message, choices) => {
				errors.push(String(message));
				retries.push(...choices);
				notified.complete();
				return new NoOpNotification();
			},
		});
		const catalog = store.add(instantiation.createInstance(CloudSandboxModels, 'sandbox', 'sandbox-catalog', modelProvider));
		return { catalog, accounts, errors, retries, notified };
	}

	test('supplements the connected host catalog without dropping its models on account changes', async () => {
		const provider = store.add(new AgentHostLanguageModelProvider('sandbox', 'sandbox'));
		provider.updateModels([{ id: 'host-model', name: 'Host Model', provider: 'copilot' }]);
		const { catalog, accounts } = setup(async () => ({ models: [{ id: 'claude-sonnet-4.6', name: 'Sonnet 4.6', provider: 'copilot' }] }), provider);
		const ready = Event.toPromise(Event.filter(catalog.onDidChange, () => catalog.ready));
		catalog.load();
		await ready;
		const loaded = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		const refreshed = Event.toPromise(Event.filter(catalog.onDidChange, () => catalog.ready));
		accounts.fire('changed');
		const duringRefresh = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		await refreshed;
		catalog.dispose();
		const afterDispose = await provider.provideLanguageModelChatInfo(undefined, CancellationToken.None);
		assert.deepStrictEqual({
			loaded: loaded.map(model => model.metadata.id), duringRefresh: duringRefresh.map(model => model.metadata.id), afterDispose: afterDispose.map(model => model.metadata.id),
		}, { loaded: ['host-model', 'claude-sonnet-4.6'], duringRefresh: ['host-model'], afterDispose: ['host-model'] });
	});

	test('coalesces reads and caches the catalog until the account changes', async () => {
		let calls = 0;
		const { catalog, accounts } = setup(async () => ({
			defaultModel: 'new-model',
			models: [{ id: `model-${++calls}`, provider: 'copilot', name: 'New Model', configSchema: { type: 'object', properties: { reasoningEffort: { type: 'string', title: 'Effort', enum: ['low', 'high'] } } } }],
		}));
		const first = Event.toPromise(Event.filter(catalog.onDidChange, () => catalog.ready));
		catalog.load();
		catalog.load();
		await first;
		catalog.load();
		const before = catalog.models.map(model => model.metadata.id);
		const second = Event.toPromise(Event.filter(catalog.onDidChange, () => catalog.ready));
		accounts.fire('another-account');
		await second;
		assert.deepStrictEqual({ calls, before, after: catalog.models.map(model => model.metadata.id), efforts: catalog.models[0].metadata.configurationSchema?.properties?.reasoningEffort.enum }, {
			calls: 2, before: ['model-1'], after: ['model-2'], efforts: ['low', 'high'],
		});
	});

	test('offers an explicit retry after a failed request', async () => {
		let calls = 0;
		const { catalog, errors, retries, notified } = setup(async () => {
			if (++calls === 1) {
				throw new Error('catalog unavailable');
			}
			return { models: [{ id: 'model', provider: 'copilot', name: 'Model' }] };
		});
		catalog.load();
		await notified.p;
		const ready = Event.toPromise(Event.filter(catalog.onDidChange, () => catalog.ready));
		await retries[0].run();
		await ready;
		assert.deepStrictEqual({ calls, errors, ready: catalog.ready, ids: catalog.models.map(model => model.metadata.id) }, {
			calls: 2, errors: ['Could not load models for GitHub sandboxes.'], ready: true, ids: ['model'],
		});
	});

	test('cancels an in-flight catalog request when its owner is disposed', async () => {
		const cancelled = new DeferredPromise<void>();
		const { catalog, errors } = setup(async token => {
			store.add(token.onCancellationRequested(() => cancelled.complete()));
			await cancelled.p;
			throw new CancellationError();
		});
		catalog.load();
		catalog.dispose();
		await cancelled.p;
		assert.deepStrictEqual(errors, []);
	});

	test('ignores a late response from the previous account', async () => {
		const old = new DeferredPromise<Awaited<ReturnType<ICloudSandboxApiService['listModels']>>>();
		let calls = 0;
		const { catalog, accounts } = setup(() => ++calls === 1 ? old.p : Promise.resolve({ models: [{ id: 'current', provider: 'copilot', name: 'Current' }] }));
		catalog.load();
		const ready = Event.toPromise(Event.filter(catalog.onDidChange, () => catalog.ready));
		accounts.fire('current-account');
		await ready;
		await old.complete({ models: [{ id: 'old', provider: 'copilot', name: 'Old' }] });
		assert.deepStrictEqual(catalog.models.map(model => model.metadata.id), ['current']);
	});
});
