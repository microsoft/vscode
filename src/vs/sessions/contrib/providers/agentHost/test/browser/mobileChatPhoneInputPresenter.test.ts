/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { CopilotImageGenerationEnabledSettingId } from '../../../../../../platform/agentHost/common/copilotCliConfig.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ResolveSessionConfigResult } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IUriIdentityService } from '../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IChatPetService } from '../../../../../../workbench/contrib/chat/browser/chatPetService.js';
import { ChatPhoneInputPresenterRequest, IChatPhoneInputSessionContext } from '../../../../../../workbench/contrib/chat/browser/widget/input/chatPhoneInputPresenter.js';
import { ChatMode, IChatModes } from '../../../../../../workbench/contrib/chat/common/chatModes.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelProviderDescriptor, ILanguageModelsService } from '../../../../../../workbench/contrib/chat/common/languageModels.js';
import { IWorkbenchLayoutService } from '../../../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../../services/sessions/browser/sessionsService.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionConfigProvider, ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { MobileChatPhoneInputPresenter } from '../../browser/mobile/mobileChatPhoneInputPresenter.js';

suite('MobileChatPhoneInputPresenter images', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const key = SessionConfigKey.ImageGenerationEnabled;

	function setup(kind: 'session' | 'delegates', options: { available?: boolean; readOnly?: boolean; control?: boolean; catalog?: boolean; writeError?: Error; imagesEnabled?: boolean; imageRatesMissing?: boolean } = {}) {
		const container = dom.append(document.body, dom.$('.monaco-workbench.monaco-reduce-motion'));
		store.add(toDisposable(() => container.remove()));
		const config: ResolveSessionConfigResult = {
			schema: { type: 'object', properties: options.control === false ? {} : { [key]: { type: 'boolean', title: 'Image Generation', default: true, sessionMutable: true, readOnly: options.readOnly } } },
			values: { [key]: true },
		};
		const changed = store.add(new Emitter<string>());
		const modelsChanged = store.add(new Emitter<void>());
		const resolving = observableValue('resolving', false);
		const writes: { session: string; value: unknown }[] = [];
		const delegateWrites: boolean[] = [];
		const modelSelections: string[] = [];
		let models: ILanguageModelChatMetadataAndIdentifier[] = [{
			identifier: 'opaque-chat-model',
			metadata: upcastPartial<ILanguageModelChatMetadata>({
				id: 'chat', name: 'Chat Model', vendor: 'copilot',
				imageModels: options.catalog === false ? undefined : [{
					id: 'opaque/runtime-image', name: 'Image From Runtime', isDefault: true, supportedOperations: ['generate'],
					availability: options.available === false ? 'unavailable' : 'available',
					pricing: { batchSize: 100_000, textInputPrice: 50, ...(options.imageRatesMissing ? {} : { imageInputPrice: 80.125, imageOutputPrice: 0 }) },
				}],
			}),
		}];
		const sessionConfig: ISessionConfigProvider = {
			onDidChangeSessionConfig: changed.event,
			getSessionConfig: () => config,
			getCreateSessionConfig: () => ({}),
			isSessionConfigResolving: () => resolving,
			setSessionConfigValue: async (session, property, value) => {
				assert.strictEqual(property, key);
				if (options.writeError) { throw options.writeError; }
				writes.push({ session, value });
				config.values[key] = value;
				changed.fire(session);
			},
		};
		const provider = new class extends mock<ISessionsProvider>() {
			override readonly id = kind === 'delegates' ? 'local-agent-host' : 'opaque-provider';
			override readonly sessionConfig = sessionConfig;
			override readonly onDidChangeModels = modelsChanged.event;
			override getModelsSnapshot() { return upcastPartial<ReturnType<ISessionsProvider['getModelsSnapshot']>>({ models }); }
			getSessionConfig() { return config; }
			override getModelPickerOptions() { return { showUnavailableFeatured: false, showManageModelsAction: false }; }
		}();
		let scoped: IChatPhoneInputSessionContext | undefined = {
			providerId: provider.id, sessionId: 'input-owner', sessionType: 'test', chatResource: URI.parse('opaque:/input-chat'), modelId: models[0].identifier,
		};
		let delegateResource = scoped.chatResource;
		const active = new class extends mock<IActiveSession>() {
			override readonly providerId = provider.id;
			override readonly sessionId = 'other-active-session';
			override readonly sessionType = 'test';
			override readonly activeChat = constObservable(upcastPartial<ReturnType<IActiveSession['activeChat']['get']>>({ resource: URI.parse('opaque:/other-chat') }));
			override readonly modelId = constObservable(models[0].identifier);
		}();
		const instantiation = store.add(new TestInstantiationService());
		const configuration = new TestConfigurationService({ [CopilotImageGenerationEnabledSettingId]: options.imagesEnabled ?? true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiation.set(IConfigurationService, configuration);
		instantiation.stub(IContextKeyService, { onDidChangeContext: Event.None });
		instantiation.stub(IContextKeyService, 'getContextKeyValue', true);
		instantiation.stub(ICommandService, {});
		instantiation.stub(IWorkbenchLayoutService, { mainContainer: container });
		instantiation.stub(ISessionsService, { activeSession: constObservable(active) });
		instantiation.stub(ISessionsProvidersService, { onDidChangeProviders: Event.None });
		instantiation.stub(ISessionsProvidersService, 'getProvider', () => provider);
		instantiation.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
		instantiation.stub(IChatPetService, {});
		instantiation.stub(ILanguageModelsService, {
			onDidChangeLanguageModels: Event.map(modelsChanged.event, () => 'copilot'),
			getVendors: () => [upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'copilot', displayName: 'Copilot', isDefault: true })],
			getLanguageModelGroups: () => [],
		});
		const presenter = store.add(instantiation.createInstance(MobileChatPhoneInputPresenter));
		const request: ChatPhoneInputPresenterRequest = kind === 'session' ? {
			kind, getSessionContext: () => scoped, selectModel: id => { modelSelections.push(id); return true; },
		} : {
			kind,
			modeDelegate: { currentMode: constObservable(ChatMode.Agent), currentChatModes: constObservable(upcastPartial<IChatModes>({ builtin: [ChatMode.Agent], custom: [] })), sessionResource: () => delegateResource },
			modelDelegate: {
				currentModel: constObservable(models[0]), getModels: () => models,
				getPresentationOptions: () => ({ showUnavailableFeatured: false, showManageModelsAction: false, showAutoModel: true, showModelIcon: false }),
				setModel: model => modelSelections.push(model.identifier),
				imageGeneration: options.control === false ? undefined : {
					onDidChange: Event.map(changed.event, () => undefined),
					getState: () => ({ enabled: config.values[key] === true, readOnly: options.readOnly === true }),
					setEnabled: async value => { delegateWrites.push(value); config.values[key] = value; changed.fire('input-owner'); },
				},
			},
		};
		const opening = presenter.showCombinedModeAndModelSheet(container, request);
		const row = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('.mobile-picker-sheet-item')]
			.find(row => row.querySelector('.mobile-picker-sheet-label')?.textContent === label);
		const waitFor = (condition: () => boolean) => new Promise<void>(resolve => {
			if (condition()) { resolve(); return; }
			const observer = new MutationObserver(() => {
				if (condition()) { observer.disconnect(); resolve(); }
			});
			observer.observe(container, { childList: true, subtree: true });
			store.add(toDisposable(() => observer.disconnect()));
		});
		return {
			container, config, row, opening, writes, delegateWrites, modelSelections,
			disableImages: async () => {
				await configuration.setUserConfiguration(CopilotImageGenerationEnabledSettingId, false);
				configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: key => key === CopilotImageGenerationEnabledSettingId }));
			},
			openImages: async () => {
				const images = row('Images');
				assert.ok(images);
				images.click();
				await waitFor(() => !!row('Off') || !!row('Image From Runtime Details'));
			},
			replaceCatalog: async () => {
				models = models.map(model => ({ ...model, metadata: { ...model.metadata, imageModels: undefined } }));
				modelsChanged.fire();
				await waitFor(() => !!row('Image model information is currently unavailable.'));
			},
			inspectDetails: async () => {
				row('Image From Runtime Details')!.click();
				await waitFor(() => !!container.querySelector('.chat-model-card-name'));
			},
			disableExternally: async () => {
				config.values[key] = false;
				changed.fire('input-owner');
				await waitFor(() => row('Off')?.getAttribute('aria-current') === 'true');
			},
			switchOwner: () => { scoped = undefined; delegateResource = URI.parse('opaque:/replacement'); },
			close: async () => {
				presenter.dispose();
				container.querySelector<HTMLButtonElement>('.mobile-picker-sheet-done')?.click();
				await opening;
			},
		};
	}

	for (const kind of ['session', 'delegates'] as const) {
		test(`${kind} shows dashes for unreported image prices without changing consent`, async () => {
			const rig = setup(kind, { imageRatesMissing: true });
			try {
				await rig.openImages();
				await rig.inspectDetails();
				rig.container.querySelector<HTMLButtonElement>('.chat-model-card-pricing-toggle')!.click();
				assert.deepStrictEqual({
					prices: Array.from(rig.container.querySelectorAll('.chat-model-card-pricing-row'), row => [
						row.querySelector('.chat-model-card-pricing-label')?.textContent,
						row.querySelector('.chat-model-card-pricing-value')?.textContent,
					]),
					writes: rig.writes,
					delegateWrites: rig.delegateWrites,
					modelSelections: rig.modelSelections,
				}, {
					prices: [['Text Input', '500'], ['Image Input', '-'], ['Image Output', '-']],
					writes: [], delegateWrites: [], modelSelections: [],
				});
			} finally { await rig.close(); }
		});

		test(`${kind} hides Images when the feature setting is off`, async () => {
			const rig = setup(kind, { imagesEnabled: false });
			try {
				assert.strictEqual(rig.row('Images'), undefined);
			} finally { await rig.close(); }
		});

		test(`${kind} image choices write to the input owner independently of chat selection`, async () => {
			const rig = setup(kind);
			try {
				await rig.openImages();
				assert.ok(rig.row('Off')!.textContent?.includes('The image generation tool won\'t be called.'));
				assert.ok(rig.row('Image From Runtime')!.textContent?.includes('Generate images'));
				assert.strictEqual(rig.row('Image From Runtime')!.querySelector('.mobile-picker-sheet-badge')?.textContent, 'Preview');
				rig.row('Off')!.click();
				await rig.opening;
				assert.deepStrictEqual(rig.writes, kind === 'session' ? [{ session: 'input-owner', value: false }] : []);
				assert.deepStrictEqual(rig.delegateWrites, kind === 'delegates' ? [false] : []);
				assert.deepStrictEqual(rig.modelSelections, []);
			} finally { await rig.close(); }
		});

		test(`${kind} refuses a choice after its input changes owner`, async () => {
			const rig = setup(kind);
			try {
				await rig.openImages();
				rig.switchOwner();
				rig.row('Off')!.click();
				await rig.opening;
				assert.deepStrictEqual([rig.writes, rig.delegateWrites, rig.modelSelections], [[], [], []]);
			} finally { await rig.close(); }
		});
	}

	for (const options of [{ available: false }, { readOnly: true }, { control: false }]) {
		test(`unselectable models retain an accessible details action (${JSON.stringify(options)})`, async () => {
			const rig = setup('session', options);
			try {
				await rig.openImages();
				assert.strictEqual(rig.row('Image From Runtime')!.disabled, true);
				assert.strictEqual(rig.row('Image From Runtime Details')!.disabled, false);
				assert.strictEqual(!!rig.row('Off'), options.control !== false);
				if (options.available === false) {
					assert.strictEqual(rig.row('Off')!.getAttribute('aria-current'), 'true');
				}
				await rig.inspectDetails();
				assert.strictEqual(rig.container.querySelector('.chat-model-card-name')?.textContent, 'Image From Runtime');
				assert.ok(!rig.container.textContent?.includes('Not Reported'));
				assert.ok(rig.container.textContent?.includes('Actual usage and cost are shown after each image tool call.'));
				const pricing = rig.container.querySelector<HTMLButtonElement>('.chat-model-card-pricing-toggle');
				assert.ok(pricing);
				assert.strictEqual(pricing.getAttribute('aria-expanded'), 'false');
				pricing.click();
				assert.strictEqual(pricing.getAttribute('aria-expanded'), 'true');
				assert.deepStrictEqual(Array.from(rig.container.querySelectorAll('.chat-model-card-pricing-row'), row => [
					row.querySelector('.chat-model-card-pricing-label')?.textContent,
					row.querySelector('.chat-model-card-pricing-value')?.textContent,
				]), [['Text Input', '500'], ['Image Input', '801.25'], ['Image Output', '0']]);
				assert.deepStrictEqual(rig.writes, []);
			} finally { await rig.close(); }
		});
	}

	test('catalog withdrawal refreshes the open image sheet without removing Off', async () => {
		const rig = setup('session');
		try {
			await rig.openImages();
			await rig.replaceCatalog();
			assert.strictEqual(rig.row('Image From Runtime'), undefined);
			rig.row('Off')!.click();
			await rig.opening;
			assert.deepStrictEqual(rig.writes, [{ session: 'input-owner', value: false }]);
		} finally { await rig.close(); }
	});

	test('external consent changes refresh the checked choice without writing another preference', async () => {
		const rig = setup('session');
		try {
			await rig.openImages();
			await rig.disableExternally();
			assert.deepStrictEqual(rig.writes, []);
		} finally { await rig.close(); }
	});

	test('turning off the setting closes an open phone image picker', async () => {
		const rig = setup('session');
		try {
			await rig.openImages();
			await rig.disableImages();
			await rig.opening;
			assert.strictEqual(rig.row('Off'), undefined);
			assert.deepStrictEqual(rig.writes, []);
		} finally { await rig.close(); }
	});

	test('failed preference writes reject the presenter request and preserve the stored choice', async () => {
		const error = new Error('Configuration write failed');
		const rig = setup('session', { writeError: error });
		const rejected = assert.rejects(rig.opening, error);
		await rig.openImages();
		rig.row('Off')!.click();
		await rejected;
		assert.strictEqual(rig.config.values[key], true);
		assert.deepStrictEqual(rig.writes, []);
	});
});
