/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ChatAgentLocation, ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { IChatSessionsService } from '../../../../contrib/chat/common/chatSessionsService.js';
import { ILanguageModelChatMetadataAndIdentifier, ILanguageModelNewSessionDefault, ILanguageModelsService } from '../../../../contrib/chat/common/languageModels.js';
import { ChatModel } from '../../../../contrib/chat/common/model/chatModel.js';
import { NullLanguageModelsService } from '../../../../contrib/chat/test/common/languageModels.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';
import { IChatWidgetFixtureHandle, renderChatWidget } from './chatWidget.fixture.js';

const rememberedModelKey = 'chat.currentLanguageModel.panel';
const models: ILanguageModelChatMetadataAndIdentifier[] = [
	['model-a', 'Model A'],
	['auto', 'Auto'],
].map(([id, name]) => ({
	identifier: `copilot/${id}`,
	metadata: {
		extension: new ExtensionIdentifier('fixture.synthetic-models'),
		id,
		name,
		vendor: 'copilot',
		version: '1.0',
		family: id,
		maxInputTokens: 128000,
		maxOutputTokens: 16000,
		isDefaultForLocation: { [ChatAgentLocation.Chat]: id === 'model-a' },
		capabilities: { toolCalling: true },
	},
}));

/** Synthetic service decisions exercise the real composer and controller, without contacting CAPI. */
async function renderNewSessionDefault(context: ComponentFixtureContext, variant: ILanguageModelNewSessionDefault['variant']): Promise<void> {
	const storage = context.disposableStore.add(new InMemoryStorageService());
	storage.store(rememberedModelKey, 'copilot/model-a', StorageScope.PROFILE, StorageTarget.USER);
	let refreshCount = 0;
	const languageModels: ILanguageModelsService = Object.assign(new NullLanguageModelsService(), {
		getLanguageModelIds: () => models.map(model => model.identifier),
		getLanguageModels: () => models,
		lookupLanguageModel: (id: string) => models.find(model => model.identifier === id)?.metadata,
		hasResolvedVendor: () => true,
		selectLanguageModels: async () => models.map(model => model.identifier),
		refreshNewSessionDefault: async (vendor: string): Promise<ILanguageModelNewSessionDefault | undefined> => {
			if (vendor !== 'copilot') {
				throw new Error(`Unexpected fixture vendor: ${vendor}`);
			}
			refreshCount++;
			return { variant, assignmentContext: `synthetic-fixture-${variant}` };
		},
	});
	let handle: IChatWidgetFixtureHandle | undefined;
	await renderChatWidget(context, {
		messages: [],
		width: 640,
		height: 240,
		listHeight: 100,
		additionalServices: reg => {
			reg.defineInstance(IStorageService, storage);
			reg.defineInstance(ILanguageModelsService, languageModels);
			reg.define(IActionWidgetService, ActionWidgetService);
			reg.define(IContextViewService, ContextViewService);
			reg.defineInstance(ILayoutService, upcastPartial<ILayoutService>({
				getContainer: () => context.container,
				mainContainer: context.container,
				activeContainer: context.container,
				onDidChangeActiveContainer: Event.None,
				onDidAddContainer: Event.None,
				onDidLayoutMainContainer: Event.None,
				onDidLayoutActiveContainer: Event.None,
				onDidLayoutContainer: Event.None,
			}));
		},
		onRendered: rendered => handle = rendered,
	});
	if (!handle) {
		throw new Error('Chat fixture did not render');
	}
	const { inputPart, instantiationService } = handle;
	instantiationService.get(IChatSessionsService).setSessionOption = () => true;
	const configuration = instantiationService.get(IConfigurationService);
	if (configuration.getValue(ChatConfiguration.DefaultModel) !== undefined) {
		throw new Error('The fixture must not configure a default model');
	}
	// Bind a genuinely new input model to the shared helper's newly allocated, empty session.
	const newSession = context.disposableStore.add(instantiationService.createInstance(ChatModel, undefined, {
		initialLocation: ChatAgentLocation.Chat,
		canUseTools: true,
		resource: handle.model.sessionResource,
		isNewSession: true,
	}));
	inputPart.setInputModel(newSession.inputModel, true, newSession.sessionResource);
	await Promise.resolve();
	await Promise.resolve();
	const expectedId = variant === 'treatment' ? 'copilot/auto' : 'copilot/model-a';
	const expectedLabel = variant === 'treatment' ? 'Auto' : 'Model A';
	const picker = context.container.querySelector<HTMLElement>('.model-picker-name');
	if (!newSession.inputModel.isNewSession || newSession.getRequests().length !== 0
		|| refreshCount !== 1 || inputPart.currentLanguageModel !== expectedId
		|| newSession.inputModel.state.get()?.selectedModel?.identifier !== expectedId
		|| !picker?.textContent?.includes(expectedLabel)
		|| configuration.getValue(ChatConfiguration.DefaultModel) !== undefined
		|| storage.get(rememberedModelKey, StorageScope.PROFILE) !== 'copilot/model-a') {
		throw new Error(`New session ${variant} failed: ${JSON.stringify({
			refreshCount, selected: inputPart.currentLanguageModel, picker: picker?.textContent,
			remembered: storage.get(rememberedModelKey, StorageScope.PROFILE),
		})}`);
	}
	context.container.dataset.assignment = variant;
	context.container.dataset.selectedModel = inputPart.currentLanguageModel;
	context.container.dataset.rememberedModel = storage.get(rememberedModelKey, StorageScope.PROFILE);
	context.container.dataset.freshRequests = String(refreshCount);
	context.container.dataset.newSession = String(newSession.inputModel.isNewSession);
	context.container.dataset.validated = 'true';
}

export default defineThemedFixtureGroup({ path: 'chat/input/newSessionAutoDefault' }, {
	BeforeControl: defineComponentFixture({ render: context => renderNewSessionDefault(context, 'control') }),
	AfterTreatment: defineComponentFixture({ render: context => renderNewSessionDefault(context, 'treatment') }),
});
