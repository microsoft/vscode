/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { beforeEach, describe, expect, it } from 'vitest';
import { CopilotToken, createTestExtendedTokenInfo } from '../../../authentication/common/copilotToken';
import { ICopilotTokenStore } from '../../../authentication/common/copilotTokenStore';
import { ConfigKey } from '../../../configuration/common/configurationService';
import { DefaultsOnlyConfigurationService } from '../../../configuration/common/defaultsOnlyConfigurationService';
import { InMemoryConfigurationService } from '../../../configuration/test/common/inMemoryConfigurationService';
import { ILogService } from '../../../log/common/logService';
import { IProxyModelsService } from '../../../proxyModels/common/proxyModelsService';
import { NullExperimentationService } from '../../../telemetry/common/nullExperimentationService';
import { NullTelemetryService } from '../../../telemetry/common/nullTelemetryService';
import { TestLogService } from '../../../testing/common/testLogService';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { Emitter, Event } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { autorun } from '../../../../util/vs/base/common/observable';
import { WireTypes } from '../../common/dataTypes/inlineEditsModelsTypes';
import { ModelConfiguration, PromptingStrategy } from '../../common/dataTypes/xtabPromptOptions';
import { NullUndesiredModelsManager } from '../../common/inlineEditsModelService';
import { InlineEditsModelService } from '../../node/inlineEditsModelService';

class FakeProxyModelsService implements IProxyModelsService {
	declare readonly _serviceBrand: undefined;

	private readonly _onModelListUpdated = new Emitter<void>();
	readonly onModelListUpdated = this._onModelListUpdated.event;

	private _models: WireTypes.ModelList.t | undefined;
	ensureModelsLoadedCallCount = 0;

	get models() { return this._models; }
	get nesModels() { return this._models?.models.filter(m => m.serviceType === 'NESChat'); }
	get cursorJumpModels() { return undefined; }
	get instantApplyModels() { return undefined; }
	get modelsLoaded() { return this._models !== undefined; }
	async ensureModelsLoaded(): Promise<void> {
		this.ensureModelsLoadedCallCount++;
	}

	/** Stands in for the `/models` response landing. */
	respondWith(promptStrategy: PromptingStrategy, name = 'fetched-model'): void {
		this._models = { models: [{ serviceType: 'NESChat', name, provider: 'test', capabilities: { promptStrategy } }] };
		this._onModelListUpdated.fire();
	}
}

describe('InlineEditsModelService', () => {
	const store = new DisposableStore();
	let proxyModelsService: FakeProxyModelsService;
	let configurationService: InMemoryConfigurationService;

	beforeEach(() => {
		store.clear();
		proxyModelsService = new FakeProxyModelsService();
		configurationService = new InMemoryConfigurationService(new DefaultsOnlyConfigurationService());
	});

	function createService(copilotToken?: CopilotToken): InlineEditsModelService {
		const tokenStore: ICopilotTokenStore = { copilotToken, onDidStoreUpdate: Event.None } as ICopilotTokenStore;
		return store.add(new InlineEditsModelService(
			tokenStore,
			proxyModelsService,
			new NullUndesiredModelsManager(),
			configurationService,
			new NullExperimentationService(),
			new NullTelemetryService(),
			new TestLogService() as unknown as ILogService,
		));
	}

	it('uses Lysithea 24 as the default model for paid users', () => {
		const paidToken = new CopilotToken(createTestExtendedTokenInfo({
			sku: 'copilot_individual',
			copilot_plan: 'individual',
		}));
		const service = createService(paidToken);

		expect(service.defaultModelConfiguration().modelName).toBe('copilot-nes-lysithea-24');
	});

	it('keeps the existing default model while the user plan is unknown', () => {
		const service = createService();

		expect(service.defaultModelConfiguration().modelName).toBe('copilot-nes-oct');
	});

	it('reports no opinion for a model whose strategy does not bake the capability in', () => {
		const service = createService();

		proxyModelsService.respondWith(PromptingStrategy.Xtab275);

		expect(service.supportsUnifiedCompletions.get()).toBeUndefined();
	});

	it('reports the capability the selected model bakes in', () => {
		const service = createService();

		proxyModelsService.respondWith(PromptingStrategy.PatchBased02Unified);

		expect(service.supportsUnifiedCompletions.get()).toBe(true);
	});

	it('notifies observers when the selected model changes the answer', () => {
		const service = createService();
		const observed: (boolean | undefined)[] = [];
		store.add(autorun(reader => { observed.push(service.supportsUnifiedCompletions.read(reader)); }));

		proxyModelsService.respondWith(PromptingStrategy.PatchBased02Unified);

		// Registration reads this observable, so it has to re-run when `/models` changes the pick.
		expect(observed).toEqual([undefined, true]);
	});

	it('reports a locally configured model\'s capability', async () => {
		const localModel: ModelConfiguration = {
			modelName: 'local-model',
			promptingStrategy: PromptingStrategy.PatchBased02Unified,
			includeTagsInCurrentFile: false,
			lintOptions: undefined,
		};
		await configurationService.setConfig(ConfigKey.Advanced.InlineEditsXtabProviderModelConfiguration, localModel);
		const service = createService();
		await service.ensureModelSelection(CancellationToken.None);

		expect({
			supportsUnifiedCompletions: service.supportsUnifiedCompletions.get(),
			modelLoads: proxyModelsService.ensureModelsLoadedCallCount,
		}).toEqual({
			supportsUnifiedCompletions: true,
			modelLoads: 0,
		});
	});

	it('loads server models when they can replace the default selection', async () => {
		const service = createService();

		await service.ensureModelSelection(CancellationToken.None);

		expect(proxyModelsService.ensureModelsLoadedCallCount).toBe(1);
	});

	it('does not load server models when slash models are disabled', async () => {
		await configurationService.setConfig(ConfigKey.TeamInternal.InlineEditsUseSlashModels, false);
		const service = createService();

		await service.ensureModelSelection(CancellationToken.None);

		expect(proxyModelsService.ensureModelsLoadedCallCount).toBe(0);
	});
});
