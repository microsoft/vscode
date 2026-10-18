/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventHelper, EventType } from '../../../../../base/browser/dom.js';
import { toAction } from '../../../../../base/common/actions.js';
import { IStringDictionary } from '../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { extUri } from '../../../../../base/common/resources.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { isDefined } from '../../../../../base/common/types.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { localize } from '../../../../../nls.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { autoModeTiers, defaultAutoModeTier, getAutoModeTierDescription, getAutoModeTierLabel, getFusionAutoModeTierLabel } from '../../../../../platform/agentHost/common/autoModeTiers.js';
import { ILocalModelContextV1, ILocalModelFamilyV1, ILocalModelStatusV1, LOCAL_MODEL_SENTINEL_PROVIDER_NAME, LocalModelEnabledSettingId } from '../../../../../platform/agentHost/common/localModel.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { getReasoningEffortDescription, getReasoningEffortLabel } from '../../../../../platform/agentHost/common/reasoningEffort.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IContextViewDelegate, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { IConfigurationService, IConfigurationValue } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { HoverService } from '../../../../../platform/hover/browser/hoverService.js';
import { IMarkdownRendererService, MarkdownRendererService } from '../../../../../platform/markdown/browser/markdownRenderer.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IUpdateService, StateType } from '../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILocalModelService } from '../../../../services/agentHost/common/localModelService.js';
import { ITerminalService } from '../../../../contrib/terminal/browser/terminal.js';
import { ChatContextKeys } from '../../../../contrib/chat/common/actions/chatContextKeys.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelProviderDescriptor, ILanguageModelsService, IModelControlEntry } from '../../../../contrib/chat/common/languageModels.js';
import { ChatConfiguration } from '../../../../contrib/chat/common/constants.js';
import { IModelConfigPropertySchema, IModelConfigurationAccess } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ModelPickerActionItem } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerActionItem.js';
import { IPricingDisclosure, ModelCard } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerCard.js';
import { ITabbedModelPickerContext, TabbedModelPicker } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerTabbedWidget.js';
import { createLocalModelPickerPresentation } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerLocalModelItems.js';
import { SessionType } from '../../../../contrib/chat/common/chatSessionsService.js';
import { IModelPickerComparison } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerComparison.js';
import { IModelPickerProviderPlaceholder } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerTabs.js';
import { NullLanguageModelsService } from '../../../../contrib/chat/test/common/languageModels.js';
import { TestChatEntitlementService } from '../../../common/workbenchTestServices.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';
import '../../../../contrib/chat/browser/widget/input/modelPicker/media/modelPicker.css';

const EXTENSION = new ExtensionIdentifier('fixture.models');

interface IFixtureModelOptions {
	readonly vendor?: string;
	readonly category?: string;
	readonly priceCategory?: string;
	readonly detail?: string;
	readonly tooltip?: string;
	readonly effortValues?: readonly string[];
	readonly effortLabels?: readonly string[];
	readonly effortDescriptions?: readonly string[];
	readonly effortTitle?: string;
	readonly effortDefault?: string;
	readonly contextLabels?: readonly string[];
	readonly costs?: boolean;
	readonly isBYOK?: boolean;
	readonly promoDiscount?: number;
	readonly retiring?: boolean;
	readonly byokModelIdentifier?: string;
	readonly modelGroupId?: string;
	readonly targetChatSessionType?: string;
}

function createModel(id: string, name: string, options: IFixtureModelOptions = {}): ILanguageModelChatMetadataAndIdentifier {
	const vendor = options.vendor ?? 'copilot';
	const properties: NonNullable<ILanguageModelChatMetadata['configurationSchema']>['properties'] = {};
	if (options.effortValues) {
		properties.reasoningEffort = {
			type: 'string',
			title: options.effortTitle,
			group: 'navigation',
			enum: [...options.effortValues],
			enumItemLabels: options.effortLabels ? [...options.effortLabels] : undefined,
			enumDescriptions: options.effortDescriptions
				? [...options.effortDescriptions]
				: ['Fastest, least thorough', 'Balanced reasoning and speed', 'Slowest, most thorough'],
			default: options.effortDefault ?? options.effortValues[1],
		};
	}
	if (options.contextLabels) {
		properties.contextSize = {
			type: 'number',
			group: 'tokens',
			enum: [264000, 1000000],
			enumItemLabels: [...options.contextLabels],
			// Real providers describe the standard window as "Default", which says nothing
			// the segment does not already say.
			enumDescriptions: ['Default', 'Extended context window'],
			default: 264000,
		};
	}
	return {
		identifier: `${vendor}/${id}`,
		metadata: upcastPartial<ILanguageModelChatMetadata>({
			extension: EXTENSION,
			id,
			name,
			vendor,
			version: '1.0',
			family: id,
			detail: options.detail,
			tooltip: options.tooltip,
			category: options.category,
			priceCategory: options.priceCategory,
			isBYOK: options.isBYOK,
			byokModelIdentifier: options.byokModelIdentifier,
			modelGroup: options.modelGroupId ? { id: options.modelGroupId } : undefined,
			targetChatSessionType: options.targetChatSessionType,
			promo: options.promoDiscount ? { id: 'promo', discountPercent: options.promoDiscount, message: 'Discounted for a limited time.' } : undefined,
			warningText: options.retiring ? { model_pending_deprecation: 'This model is retiring soon.' } : undefined,
			maxInputTokens: 264000,
			maxOutputTokens: 64000,
			isDefaultForLocation: {},
			inputCost: options.costs ? 40 : undefined,
			outputCost: options.costs ? 200 : undefined,
			cacheCost: options.costs ? 4 : undefined,
			cacheWriteCost: options.costs ? 50 : undefined,
			longContextInputCost: options.costs ? 80 : undefined,
			longContextOutputCost: options.costs ? 400 : undefined,
			longContextCacheCost: options.costs ? 8 : undefined,
			longContextCacheWriteCost: options.costs ? 100 : undefined,
			configurationSchema: Object.keys(properties).length ? { properties } : undefined,
		}),
	};
}

// Built from the runtime's own routing profiles so the fixture cannot drift from the
// values the Auto model actually offers.
const AUTO_MODEL = createModel('auto', 'Auto', {
	detail: '10% off',
	effortTitle: localize('copilot.modelAutoTier.title', "Optimize for"),
	effortValues: [...autoModeTiers],
	effortLabels: autoModeTiers.map(getAutoModeTierLabel),
	effortDescriptions: autoModeTiers.map(tier => getAutoModeTierDescription(tier) ?? ''),
	effortDefault: defaultAutoModeTier,
});

const FUSION_MODEL: ILanguageModelChatMetadataAndIdentifier = {
	...AUTO_MODEL,
	metadata: {
		...AUTO_MODEL.metadata, name: 'Fusion', autoModelFusion: { balanceUsesHydraFusion: true },
		configurationSchema: {
			properties: {
				tier: {
					type: 'string', group: 'navigation', enum: ['balance', 'intelligence'],
					enumItemLabels: [getFusionAutoModeTierLabel('balance'), getFusionAutoModeTierLabel('intelligence')],
					default: 'balance',
				},
			},
		},
	},
};

const COPILOT_MODELS = [
	createModel('gemini-3-1-pro', 'Gemini 3.1 Pro', {
		category: 'powerful', priceCategory: 'medium', costs: true,
		effortValues: ['minimal', 'medium', 'high'], effortLabels: ['Minimal', 'Medium', 'High'],
		contextLabels: ['264K', '1M'],
	}),
	createModel('gpt-5-5', 'GPT-5.5', {
		category: 'powerful', priceCategory: 'high', costs: true,
		effortValues: ['low', 'medium', 'xhigh'], effortLabels: ['Low', 'Medium', 'Extra high'],
		contextLabels: ['264K', '1M'],
	}),
	createModel('claude-sonnet-5', 'Claude Sonnet 5', { category: 'powerful', priceCategory: 'medium', costs: true, tooltip: 'A capable model for coding, analysis, and careful reasoning.' }),
	createModel('gpt-5-3-codex', 'GPT-5.3-Codex', { category: 'versatile', priceCategory: 'low' }),
	createModel('gemini-3-5-flash', 'Gemini 3.5 Flash', { category: 'lightweight', priceCategory: 'low' }),
];

/** Copilot models plus the states a row can advertise: an offer and a retirement. */
const COPILOT_NOTICE_MODELS = [
	...COPILOT_MODELS,
	createModel('gpt-5-1', 'GPT-5.1', { category: 'versatile', priceCategory: 'low', promoDiscount: 25 }),
	createModel('gpt-4-turbo', 'GPT-4 Turbo', { category: 'versatile', priceCategory: 'medium', retiring: true }),
];

/** The full effort ladder a real model can publish, where the labels vary in width. */
const MANY_EFFORT_MODEL = createModel('gpt-5-6-terra', 'GPT-5.6 Terra', {
	category: 'powerful', priceCategory: 'medium', costs: true,
	effortValues: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
	effortLabels: ['None', 'Low', 'Medium', 'High', 'Extra High', 'Max'],
	contextLabels: ['272K', '1M'],
});

const DEMOTED_MODELS = Array.from({ length: 21 }, (_, index) => createModel(`older-${index}`, `Older Model ${index + 1}`));

const OLLAMA_MODELS = [
	createModel('llama-3-70b', 'Llama 3 70B', { vendor: 'ollama', isBYOK: true }),
	createModel('mistral-large', 'Mistral Large', { vendor: 'ollama', isBYOK: true }),
];

const OPENAI_MODELS = [
	createModel('gpt-4o', 'GPT-4o', { vendor: 'openai', isBYOK: true }),
];

const ANTHROPIC_MODELS = [
	createModel('example-opus-4', 'Example Opus 4', { vendor: 'anthropic', isBYOK: true }),
];

const GOOGLE_MODELS = [
	createModel('gemini-2-flash', 'Gemini 2 Flash', { vendor: 'google', isBYOK: true }),
];

/** A model the provider also offers at a second speed, named by an id suffix. */
const SPEED_VARIANT_MODELS = [
	createModel('example-2.5', 'Example 2.5', { category: 'powerful', priceCategory: 'high', costs: true }),
	createModel('example-2.5-fast', 'Example 2.5 (fast mode)', { category: 'powerful', priceCategory: 'very_high', costs: true }),
];

const COPILOT_ONLY_MODELS = [AUTO_MODEL, ...COPILOT_MODELS];

/** How the Copilot agent host relays models: its own vendor, BYOK stamped on everything. */
const RELAYED_MODELS = [
	createModel('auto', 'Auto', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'copilot', detail: '10% off', effortValues: [...autoModeTiers], effortLabels: autoModeTiers.map(getAutoModeTierLabel), effortDescriptions: autoModeTiers.map(tier => getAutoModeTierDescription(tier) ?? ''), effortDefault: defaultAutoModeTier }),
	createModel('gpt-5-5', 'GPT-5.5', { vendor: 'agent-host-copilotcli', isBYOK: true, byokModelIdentifier: 'copilot/gpt-5-5', modelGroupId: 'copilot', category: 'powerful', priceCategory: 'high' }),
	createModel('claude-sonnet-5', 'Claude Sonnet 5', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'copilot', category: 'powerful' }),
	createModel('llama-3-70b', 'Llama 3 70B', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'ollama' }),
];
/**
 * A relayed Copilot list as long as a typical one. Copilot's tab sets the popup's
 * height, so this leaves room for every on-device family's row.
 */
const ON_DEVICE_RELAYED_MODELS = [
	...RELAYED_MODELS,
	createModel('gemini-3-1-pro', 'Gemini 3.1 Pro', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'copilot', category: 'powerful' }),
	createModel('gpt-5-3-codex', 'GPT-5.3-Codex', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'copilot', category: 'versatile' }),
	createModel('gemini-3-5-flash', 'Gemini 3.5 Flash', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'copilot', category: 'lightweight' }),
];
/** The research preview the Copilot agent host adds when enabled, offered as a model of its own beside Auto. */
const HYDRA_FUSION_MODEL: ILanguageModelChatMetadataAndIdentifier = (() => {
	const model = createModel('hydrafusion', 'HydraFusion', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'copilotcli', detail: 'Research preview' });
	return { ...model, metadata: { ...model.metadata, tooltip: 'HydraFusion routes the first eligible turn and may use multiple models.' } };
})();
/** HydraFusion v2's Max, which makes Default and Max HydraFusion's tiers. */
const HYDRA_FUSION_MAX_MODEL: ILanguageModelChatMetadataAndIdentifier = (() => {
	const model = createModel('hydrafusion-max', 'HydraFusion Max', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'copilotcli', detail: 'Research preview' });
	return { ...model, metadata: { ...model.metadata, tooltip: 'HydraFusion Max routes the first eligible turn and may use multiple models.' } };
})();
const ALL_MODELS = [...COPILOT_ONLY_MODELS, ...OLLAMA_MODELS];

const GB = 1024 ** 3;
const MiB = 1024 ** 2;

/** How an on-device model's chat template controls thinking: Example Flash's reasoning effort, or Qwen's on/off switch. */
export type OnDeviceThinking = 'effort' | 'toggle';

/** The `thinkingLevel` property the Copilot agent host advertises on a direct row whose chat template supports thinking. */
const ON_DEVICE_THINKING: Record<OnDeviceThinking, IModelConfigPropertySchema> = {
	effort: { type: 'string', group: 'navigation', enum: ['low', 'medium', 'high'], enumItemLabels: ['low', 'medium', 'high'].map(getReasoningEffortLabel), enumDescriptions: ['low', 'medium', 'high'].map(level => getReasoningEffortDescription(level) ?? ''), default: 'medium' },
	toggle: { type: 'string', group: 'navigation', enum: ['none', 'medium'], enumItemLabels: ['Off', 'On'], enumDescriptions: ['Answers without thinking first', 'Thinks before answering'], default: 'medium' },
};

/**
 * The context sizes of an installed family, with the GPU memory llama.cpp
 * projects for each on a measured device (`llama-fit-params`).
 */
export const ON_DEVICE_CONTEXT = {
	exampleFlash: { tokens: 131072, options: [{ tokens: 65536, gpuBytes: 57242 * MiB }, { tokens: 131072, gpuBytes: 59034 * MiB }, { tokens: 262144, gpuBytes: 62618 * MiB }] },
	qwen: { tokens: 131072, options: [{ tokens: 65536, gpuBytes: 6917 * MiB }, { tokens: 131072, gpuBytes: 8729 * MiB }, { tokens: 262144, gpuBytes: 12825 * MiB }] },
} satisfies Record<string, ILocalModelContextV1>;

/**
 * The direct-selection row the Copilot agent host publishes for an installed
 * on-device model, named after its family, with its thinking level when its
 * chat template supports one.
 */
function createOnDeviceModel(family: ILocalModelFamilyV1, thinking?: OnDeviceThinking): ILanguageModelChatMetadataAndIdentifier | undefined {
	if (!family.install) {
		return undefined;
	}
	const alias = family.install.modelId.replace(`${LOCAL_MODEL_SENTINEL_PROVIDER_NAME}/`, '');
	const model = createModel(`${LOCAL_MODEL_SENTINEL_PROVIDER_NAME}/${alias}`, family.displayName, {
		vendor: SessionType.AgentHostCopilot, isBYOK: true, modelGroupId: LOCAL_MODEL_SENTINEL_PROVIDER_NAME, targetChatSessionType: SessionType.AgentHostCopilot,
	});
	return thinking ? { ...model, metadata: { ...model.metadata, configurationSchema: { properties: { thinkingLevel: ON_DEVICE_THINKING[thinking] } } } } : model;
}

/** One on-device model family; the rest of the fields are filled in for a model that fits this device. */
function createOnDeviceFamily(familyId: string, displayName: string, overrides: Partial<ILocalModelFamilyV1> = {}): ILocalModelFamilyV1 {
	return { familyId, capiId: familyId, autoCapable: true, displayName, usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 }, consentGiven: true, ...overrides };
}

/** An on-device model status for a device with room for the offered models. */
function createOnDeviceStatus(families: readonly ILocalModelFamilyV1[], active?: ILocalModelStatusV1['active'], overrides: Partial<ILocalModelStatusV1> = {}): ILocalModelStatusV1 {
	return { schemaVersion: 1, device: { capacityBytes: 102 * GB, confidence: 'measured' }, runtime: { version: 'b11459' }, catalog: { state: 'ready', registries: { azureml: 'ready' } }, families, active, useInAuto: true, ...overrides };
}

/** The serving state of the loaded on-device model. */
function createOnDeviceActive(familyId: string, overrides: Partial<NonNullable<ILocalModelStatusV1['active']>> = {}): NonNullable<ILocalModelStatusV1['active']> {
	return { familyId, contentId: 'c1', servingGeneration: 1, server: 'ready', profile: 'full-gpu', autoEligible: true, ...overrides };
}

const ON_DEVICE_OFFER = { fit: 'full', requiredGpuBytes: 60 * GB, downloadBytes: 56.7 * GB, peakDiskBytes: 60 * GB, licenseName: 'MIT', licenseUrl: 'https://example.com/license' } as const;

function createOnDeviceInstall(modelId: string, overrides: Partial<NonNullable<ILocalModelFamilyV1['install']>> = {}): NonNullable<ILocalModelFamilyV1['install']> {
	return { contentId: modelId, adopted: false, owned: true, modelId: `${LOCAL_MODEL_SENTINEL_PROVIDER_NAME}/${modelId}`, ...overrides };
}

/** One family in each state a user meets: loaded and ready, installed but not loaded, downloading, failed, and offered. */
const ON_DEVICE_STATUS = createOnDeviceStatus([
	createOnDeviceFamily('example-flash', 'Example Flash 1.0', { install: createOnDeviceInstall('Example-Flash', { update: { contentId: 'example-flash-2', downloadBytes: 2.1 * GB } }), offer: ON_DEVICE_OFFER, context: ON_DEVICE_CONTEXT.exampleFlash }),
	createOnDeviceFamily('example-coder', 'Example Coder 14B', { install: createOnDeviceInstall('Example-Coder'), offer: ON_DEVICE_OFFER, context: ON_DEVICE_CONTEXT.qwen }),
	createOnDeviceFamily('example-vision', 'Example Vision 7B', { offer: ON_DEVICE_OFFER, operation: { id: 'op1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes: 23.8 * GB, totalBytes: 56.7 * GB } }),
	createOnDeviceFamily('example-reasoner', 'Example Reasoner 32B', { offer: ON_DEVICE_OFFER, operation: { id: 'op2', kind: 'setup', state: 'error', resumeOnStartup: false, error: { code: 'network', message: 'The download was interrupted. Select Retry to resume.', actions: ['retry'] } } }),
	createOnDeviceFamily('example-mini', 'Example Mini 3B', { offer: { ...ON_DEVICE_OFFER, downloadBytes: 2.4 * GB, requiredGpuBytes: 4 * GB } }),
], createOnDeviceActive('example-flash'));
/** Example Flash sets a reasoning effort; the coder model has no thinking control, so its summary is its context size. */
const ON_DEVICE_THINKING_BY_FAMILY: IStringDictionary<OnDeviceThinking> = { 'example-flash': 'effort' };
const ON_DEVICE_SELECTED_MODEL = createOnDeviceModel(ON_DEVICE_STATUS.families[0], 'effort')!;
const ON_DEVICE_PICKER = { models: ON_DEVICE_RELAYED_MODELS, localModels: ON_DEVICE_STATUS, onDeviceThinking: ON_DEVICE_THINKING_BY_FAMILY } as const;

/** Example Flash selected in the chat input: swapped in and loading for the first time at its context size, and once ready. */
const ON_DEVICE_INPUT_FAMILY = createOnDeviceFamily('example-flash', 'Example Flash 1.0', { install: createOnDeviceInstall('Example-Flash'), context: ON_DEVICE_CONTEXT.exampleFlash });
const ON_DEVICE_INPUT_MODEL = createOnDeviceModel(ON_DEVICE_INPUT_FAMILY, 'effort')!;
const ON_DEVICE_INPUT_LOADING = createOnDeviceStatus(
	[{ ...ON_DEVICE_INPUT_FAMILY, operation: { id: 'swap-1', kind: 'swap', state: 'running', resumeOnStartup: false, phase: 'loading' } }],
	createOnDeviceActive('example-flash', { server: 'starting', load: { step: 'loading', startedAt: 0 } }),
);
/** The selected model reloads for a new context size: the host swaps it to itself. */
const ON_DEVICE_INPUT_RELOADING = createOnDeviceStatus(
	[{ ...ON_DEVICE_INPUT_FAMILY, operation: { id: 'reload-1', kind: 'swap', state: 'running', resumeOnStartup: false, phase: 'loading' } }],
	createOnDeviceActive('example-flash', { server: 'starting', swapTo: 'example-flash', load: { step: 'loading', startedAt: 0 } }),
);
const ON_DEVICE_INPUT_READY = createOnDeviceStatus([ON_DEVICE_INPUT_FAMILY], createOnDeviceActive('example-flash', { contextTokens: ON_DEVICE_CONTEXT.exampleFlash.tokens }));

const CONTROL_MODELS: IStringDictionary<IModelControlEntry> = {
	'gemini-3-1-pro': { label: 'Gemini 3.1 Pro', featured: true, exists: true },
	'claude-sonnet-5': { label: 'Claude Sonnet 5', featured: true, exists: true },
};

/** Adds curated models the account cannot reach, plus one gated behind a newer build. */
const CONTROL_MODELS_WITH_LOCKED: IStringDictionary<IModelControlEntry> = {
	...CONTROL_MODELS,
	'example-locked-5': { label: 'Example Locked 5', featured: true, exists: false },
	'gpt-6': { label: 'GPT-6', featured: true, exists: false, minVSCodeVersion: '99.0.0' },
};

/** The curated list a Free or Student account sees, none of which it can select. */
const FREE_PLAN_CONTROL_MODELS: IStringDictionary<IModelControlEntry> = {
	'claude-haiku-4.5': { label: 'Claude Haiku 4.5', featured: true, exists: false },
	'gpt-5.6-terra': { label: 'GPT-5.6 Terra', featured: true, exists: false },
	'claude-sonnet-4.6': { label: 'Claude Sonnet 4.6', featured: true, exists: false },
	'gpt-5-mini': { label: 'GPT-5 mini', demoted: true, exists: false },
};

/** In-memory model configuration so the fixture's cards and tiers are interactive. */
function createConfigurationAccess(): IModelConfigurationAccess {
	const values = new Map<string, IStringDictionary<unknown>>();
	return {
		getModelConfiguration: modelId => values.get(modelId),
		setModelConfiguration: async (modelId, next) => { values.set(modelId, { ...values.get(modelId), ...next }); },
		getModelConfigurationActions: () => [],
	};
}

/** A disclosure backed by a plain flag, so a fixture can render either state. */
function createPricingDisclosure(disposableStore: DisposableStore, expanded: boolean): IPricingDisclosure {
	const emitter = disposableStore.add(new Emitter<void>());
	let current = expanded;
	return {
		isExpanded: () => current,
		setExpanded: next => { current = next; emitter.fire(); },
		onDidChange: emitter.event,
	};
}

function createLanguageModelsService(): ILanguageModelsService {
	// Only the fields the picker reads. The rest of the descriptor never comes up here.
	const vendor = (vendor: string, displayName: string, isDefault: boolean) =>
		upcastPartial<ILanguageModelProviderDescriptor>({ vendor, displayName, isDefault });
	return upcastPartial<ILanguageModelsService>({
		getVendors: () => [
			vendor('copilot', 'GitHub Copilot', true),
			vendor('ollama', 'Ollama', false),
			vendor('openai', 'OpenAI', false),
		],
		getLanguageModelGroups: () => [],
	});
}

/** Renders the popup inline in the fixture container instead of a floating context view. */
function createInlineContextViewService(container: HTMLElement, disposables: ComponentFixtureContext['disposableStore']): IContextViewService {
	let activeHost: HTMLElement | undefined;
	let activeRender: { dispose(): void } | undefined;
	const hide = () => {
		activeRender?.dispose();
		activeHost?.remove();
		activeRender = undefined;
		activeHost = undefined;
	};
	disposables.add({ dispose: hide });
	return upcastPartial<IContextViewService>({
		showContextView: (delegate: IContextViewDelegate) => {
			hide();
			activeHost = document.createElement('div');
			container.appendChild(activeHost);
			const rendered = delegate.render(activeHost);
			activeRender = rendered ?? undefined;
			return { close: hide };
		},
		hideContextView: hide,
		getContextViewElement: () => container,
		layout: () => { },
		anchorAlignment: 0,
		_serviceBrand: undefined,
	});
}

function setupContainer(container: HTMLElement, width: number): void {
	container.classList.add('monaco-workbench');
	container.style.width = `${width}px`;
	container.style.padding = '8px';
	container.style.backgroundColor = 'var(--vscode-editor-background)';
}

interface IPickerFixtureOptions {
	readonly anchored?: boolean;
	readonly anchorRight?: boolean;
	readonly selectedModelId?: string;
	readonly managedDefaultModel?: string;
	readonly pinnedModelIds?: readonly string[];
	/** Opens details through the model row's configuration action. */
	readonly openDetailsFor?: string;
	readonly openSelectedDetails?: boolean;
	readonly cacheWarm?: boolean;
	readonly pricingExpanded?: boolean;
	readonly motionReduced?: boolean;
	/** Providers with no models, which show a welcome body instead of a list. */
	readonly providerPlaceholders?: readonly IModelPickerProviderPlaceholder[];
	/** Starts on this destination, matched against the tab label. */
	readonly initialTabLabel?: string;
	/** Overrides the models offered, e.g. to show the picker without any added models. */
	readonly models?: readonly ILanguageModelChatMetadataAndIdentifier[];
	/** Opens search, which replaces the tab strip with the filter field. */
	readonly search?: boolean;
	/** Opens search with this query already typed. */
	readonly searchQuery?: string;
	/** Expands the collapsed "Other Models" section. */
	readonly expandOther?: boolean;
	/** Curated models the account cannot select, which offer an unlock path instead. */
	readonly controlModels?: IStringDictionary<IModelControlEntry>;
	/** The plan the account is on, which decides whether locked models offer upgrade or admin. */
	readonly entitlement?: ChatEntitlement;
	/** Settings to apply per model identifier, so rows can show what they were tuned to. */
	readonly configured?: IStringDictionary<IStringDictionary<unknown>>;
	readonly comparison?: IModelPickerComparison;
	/** On-device models, listed in their own tab; installed families also get their direct-selection model. */
	readonly localModels?: ILocalModelStatusV1;
	/** How the direct model of each on-device family, by family id, controls thinking; none when omitted. */
	readonly onDeviceThinking?: IStringDictionary<OnDeviceThinking>;
	/** Operations whose stop was just sent, which show as in progress. */
	readonly pendingStops?: readonly string[];
	/** Opens the "On This Device" tab at this family's detail page, as the show-details command does. */
	readonly openLocalModelDetails?: string;
}

export async function renderPicker(context: ComponentFixtureContext, options: IPickerFixtureOptions = {}): Promise<void> {
	const { container, disposableStore } = context;
	setupContainer(container, 360);
	if (options.anchored) {
		container.style.position = 'relative';
		container.style.height = 'min(560px, calc(100vh - 32px))';
		container.style.width = 'calc(100vw - 32px)';
	} else if (options.selectedModelId !== AUTO_MODEL.identifier) {
		container.style.minHeight = '400px';
	}
	const layoutContainer = options.anchored || options.managedDefaultModel !== undefined ? container : container.ownerDocument.body;

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			if (options.managedDefaultModel !== undefined) {
				const configurationService = new class extends TestConfigurationService {
					override inspect<T>(key: string): IConfigurationValue<T> {
						const result = super.inspect<T>(key);
						return key === ChatConfiguration.DefaultModel ? { ...result, policyValue: result.value } : result;
					}
				}({ [ChatConfiguration.DefaultModel]: options.managedDefaultModel, 'workbench.hover.delay': 200 });
				disposableStore.add(configurationService.onDidChangeConfigurationEmitter);
				registration.defineInstance(IConfigurationService, configurationService);
				registration.define(IHoverService, HoverService);
				registration.define(IMarkdownRendererService, MarkdownRendererService);
			}
			const motionReduced = options.motionReduced;
			if (motionReduced !== undefined) {
				registration.defineInstance(IAccessibilityService, new class extends TestAccessibilityService {
					override isMotionReduced(): boolean { return motionReduced; }
				}());
			}
			registration.defineInstance(ILayoutService, upcastPartial<ILayoutService>({
				getContainer: () => layoutContainer,
				mainContainer: layoutContainer,
				activeContainer: layoutContainer,
				onDidChangeActiveContainer: Event.None,
				onDidAddContainer: Event.None,
				onDidLayoutMainContainer: Event.None,
				onDidLayoutActiveContainer: Event.None,
				onDidLayoutContainer: Event.None,
			}));
			if (options.anchored) {
				registration.define(IContextViewService, ContextViewService);
			} else {
				registration.defineInstance(IContextViewService, createInlineContextViewService(container, disposableStore));
			}
			registration.defineInstance(ILanguageModelsService, createLanguageModelsService());
			registration.defineInstance(IChatEntitlementService, upcastPartial<IChatEntitlementService>({
				entitlement: options.entitlement ?? ChatEntitlement.Free,
				onDidChangeEntitlement: Event.None,
			}));
			// The shared harness discards writes, so the picker cannot remember anything.
			registration.defineInstance(IStorageService, disposableStore.add(new InMemoryStorageService()));
		},
	});

	// The picker opens upward from its chip, so its height comes from the space above the
	// anchor. Stand the anchor where the chat input's chip sits, or the list measures flat.
	const anchor = document.createElement(options.anchored ? 'button' : 'div');
	anchor.className = 'model-picker-fixture-anchor';
	anchor.style.position = options.anchored ? 'absolute' : 'fixed';
	anchor.style.bottom = '8px';
	anchor.style.left = options.anchorRight ? 'calc(100% - 360px)' : '8px';
	anchor.style.width = '120px';
	anchor.style.height = '22px';
	if (options.anchored) {
		anchor.textContent = 'Model';
	}
	container.appendChild(anchor);

	const picker = disposableStore.add(instantiationService.createInstance(TabbedModelPicker));
	const configurationAccess = createConfigurationAccess();
	for (const [modelId, values] of Object.entries(options.configured ?? {})) {
		void configurationAccess.setModelConfiguration(modelId, values);
	}
	let pickerContext: ITabbedModelPickerContext = {
		comparison: options.comparison,
		models: [...options.models ?? ALL_MODELS, ...options.localModels?.families.map(family => createOnDeviceModel(family, options.onDeviceThinking?.[family.familyId])).filter(isDefined) ?? []],
		selectedModelId: options.selectedModelId ?? 'copilot/gpt-5-5',
		recentModelIds: ['copilot/gpt-5-3-codex', 'copilot/gemini-3-5-flash'],
		pinnedModelIds: options.pinnedModelIds ?? ['copilot/claude-sonnet-5'],
		controlModels: options.controlModels ?? CONTROL_MODELS,
		configurationAccess,
		isUBB: true,
		showManageModels: true,
		onSelect: model => { pickerContext = { ...pickerContext, selectedModelId: model.identifier }; },
		onTogglePin: (id, pinned) => {
			pickerContext = {
				...pickerContext,
				pinnedModelIds: pinned ? [...pickerContext.pinnedModelIds, id] : pickerContext.pinnedModelIds.filter(candidate => candidate !== id),
			};
		},
		onManageModels: () => { },
		onDidToggleOtherModels: () => { },
		onDidSearch: () => { },
		onConfigurationChanged: () => { },
		unavailableContext: {
			show: true,
			currentVSCodeVersion: '1.100.0',
			manageSettingsUrl: 'https://github.com/settings/copilot',
			updateStateType: StateType.Idle,
		},
		onUnavailableLinkClick: () => { },
		providerPlaceholders: options.providerPlaceholders ?? [],
		cacheBreakHint: options.cacheWarm ? { text: 'Switching models mid-session resets the prompt cache and may increase cost.', link: undefined, dismiss: () => { } } : undefined,
		configurationCacheBreakHint: options.cacheWarm ? { text: 'Changing these options mid-session resets the prompt cache and may increase cost.', link: undefined, dismiss: () => { } } : undefined,
		localModels: options.localModels && createLocalModelPickerPresentation(options.localModels, { run: () => { } }, new Set(options.pendingStops)),
	};
	if (options.anchored) {
		disposableStore.add(addDisposableListener(anchor, EventType.CLICK, event => {
			EventHelper.stop(event, true);
			if (picker.isVisible) {
				picker.hide();
			} else {
				picker.show(anchor, pickerContext, options.openSelectedDetails ? pickerContext.selectedModelId : undefined);
			}
		}));
	}
	picker.show(anchor, pickerContext, options.openSelectedDetails ? pickerContext.selectedModelId : undefined);

	if (options.expandOther) {
		[...container.querySelectorAll<HTMLElement>('.monaco-list-row.action')]
			.find(row => row.textContent?.includes('Other Models'))?.click();
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	if (options.search) {
		container.querySelector<HTMLElement>('.tabbed-action-list-tabbar-action[data-id="search"]')?.click();
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	if (options.searchQuery !== undefined) {
		picker.openWithFilter({ initialFilterValue: options.searchQuery });
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	if (options.initialTabLabel) {
		const tab = [...container.querySelectorAll<HTMLElement>('.chat-model-picker-tabbar .monaco-button')]
			.find(candidate => candidate.ariaLabel === options.initialTabLabel);
		tab?.click();
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	if (options.openLocalModelDetails) {
		picker.openWithFilter({ localModelFamilyId: options.openLocalModelDetails });
		if (!container.querySelector('.chat-local-model-card')) {
			throw new Error(`On-device model details not found: ${options.openLocalModelDetails}`);
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	const detailsFor = options.openDetailsFor ?? (options.pricingExpanded ? pickerContext.models.find(model => model.identifier === pickerContext.selectedModelId)?.metadata.name : undefined);
	if (detailsFor) {
		const row = [...container.querySelectorAll<HTMLElement>('.monaco-list-row.action')]
			.find(candidate => candidate.querySelector('.title')?.textContent === detailsFor);
		const details = row?.querySelector<HTMLElement>('.action-list-item-toolbar .action-label')
			?? [...container.querySelectorAll<HTMLElement>('.chat-model-picker-tabbed .action-label')].find(action => action.ariaLabel?.startsWith(`${detailsFor} Details`));
		if (!details) {
			throw new Error(`Model details action not found: ${detailsFor}`);
		}
		details.click();
		await new Promise(resolve => setTimeout(resolve, 50));
	}
	if (options.pricingExpanded) {
		const toggle = container.querySelector<HTMLElement>('.chat-model-card-pricing-toggle');
		if (!toggle) {
			throw new Error('Model pricing disclosure not found');
		}
		toggle.click();
	}
}

function renderCard(context: ComponentFixtureContext, model: ILanguageModelChatMetadataAndIdentifier, extendedContext: boolean, pricingExpanded = false): void {
	const { container, disposableStore } = context;
	setupContainer(container, 320);

	const configurationAccess = createConfigurationAccess();
	if (extendedContext) {
		void configurationAccess.setModelConfiguration(model.identifier, { contextSize: 1000000 });
	}

	const card = disposableStore.add(new ModelCard({
		model,
		configurationAccess,
		isUBB: true,
		openerService: NullOpenerService,
		pricingDisclosure: createPricingDisclosure(disposableStore, pricingExpanded),
	}));

	const wrapper = document.createElement('div');
	wrapper.classList.add('action-widget');
	wrapper.appendChild(card.element);
	container.appendChild(wrapper);
}

/** An on-device model selected in the chat input, and the status of its family. */
interface IInputPickerOnDevice {
	readonly model: ILanguageModelChatMetadataAndIdentifier;
	readonly status: ILocalModelStatusV1;
}

/** A context key service whose rules see its keys, with chat enabled. */
class ChatEnabledContextKeyService extends MockContextKeyService {
	constructor() {
		super();
		this.createKey(ChatContextKeys.enabled.key, true);
	}

	override contextMatchesRules(rules: ContextKeyExpression): boolean {
		return rules.evaluate({ getValue: <T>(key: string) => this.getContextKeyValue(key) as T | undefined });
	}
}

function renderInputPicker(context: ComponentFixtureContext, initialModel = COPILOT_MODELS[1], onDevice?: IInputPickerOnDevice, inlineFusion = false): void {
	const { container, disposableStore } = context;
	setupContainer(container, 720);
	container.style.position = 'relative';
	container.style.height = '560px';
	const configuration = createConfigurationAccess();
	const models = inlineFusion ? [FUSION_MODEL, HYDRA_FUSION_MODEL, HYDRA_FUSION_MAX_MODEL, ...COPILOT_MODELS] : onDevice ? [...COPILOT_ONLY_MODELS, onDevice.model] : COPILOT_ONLY_MODELS;
	const selected = observableValue('fixtureModel', onDevice?.model ?? initialModel);
	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.defineInstance(IConfigurationService, new TestConfigurationService({
				[LocalModelEnabledSettingId]: !!onDevice,
				[ChatConfiguration.FusionModelPickerInlineTiers]: inlineFusion,
			}));
			if (onDevice) {
				// The readout of an on-device model reads its family's status from the local agent host.
				registration.defineInstance(ILocalModelService, upcastPartial<ILocalModelService>({
					getStatus: () => constObservable(onDevice.status),
					getPendingStops: () => constObservable<ReadonlySet<string>>(new Set()),
				}));
				registration.defineInstance(IAgentHostService, upcastPartial<IAgentHostService>({}));
				registration.defineInstance(ITerminalService, upcastPartial<ITerminalService>({}));
				registration.defineInstance(IContextKeyService, new ChatEnabledContextKeyService());
			}
			registration.defineInstance(ILayoutService, upcastPartial<ILayoutService>({
				getContainer: () => container, mainContainer: container, activeContainer: container,
				onDidChangeActiveContainer: Event.None, onDidAddContainer: Event.None,
				onDidLayoutMainContainer: Event.None, onDidLayoutActiveContainer: Event.None, onDidLayoutContainer: Event.None,
			}));
			registration.define(IContextViewService, ContextViewService);
			registration.defineInstance(ILanguageModelsService, new class extends NullLanguageModelsService {
				override getLanguageModelIds() { return models.map(model => model.identifier); }
				override getVendors() { return createLanguageModelsService().getVendors(); }
			}());
			const entitlement = new class extends TestChatEntitlementService {
				override readonly quotas = { usageBasedBilling: true };
			}();
			entitlement.entitlement = ChatEntitlement.Pro;
			registration.defineInstance(IChatEntitlementService, entitlement);
			registration.defineInstance(IProductService, upcastPartial<IProductService>({ version: '1.140.0' }));
			registration.defineInstance(IUpdateService, upcastPartial<IUpdateService>({ state: { type: StateType.Uninitialized } }));
			registration.defineInstance(IUriIdentityService, upcastPartial<IUriIdentityService>({ extUri }));
			registration.defineInstance(IStorageService, disposableStore.add(new InMemoryStorageService()));
		},
	});
	const session = container.appendChild(document.createElement('div'));
	session.className = 'interactive-session';
	const toolbar = session.appendChild(document.createElement('div'));
	toolbar.className = 'chat-input-toolbar';
	toolbar.style.cssText = 'position: absolute; bottom: 8px; left: 8px;';
	const item = toolbar.appendChild(document.createElement('div'));
	const picker = disposableStore.add(instantiationService.createInstance(ModelPickerActionItem,
		toAction({ id: 'fixture.modelPicker', label: 'Models', run: () => { } }),
		{
			currentModel: selected,
			setModel: model => selected.set(model, undefined),
			setModelProgrammatically: model => selected.set(model, undefined),
			getModels: () => models,
			getPresentationOptions: () => ({
				showManageModelsAction: false, showUnavailableFeatured: false,
				showAutoModel: true, showModelIcon: false,
			}),
			modelConfiguration: configuration,
			...(onDevice ? { getSessionType: () => SessionType.AgentHostCopilot } : {}),
		},
		{ compact: constObservable(false) },
	));
	picker.render(item);
	if (inlineFusion) {
		picker.openModelPicker();
	}
}

export default defineThemedFixtureGroup({ path: 'chat/input/tabbedModelPicker' }, {
	FusionInlineTiers: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderInputPicker(context, HYDRA_FUSION_MODEL, undefined, true),
	}),
	InputPicker: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: renderInputPicker,
	}),
	InputPickerAuto: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderInputPicker(context, AUTO_MODEL),
	}),
	// An on-device model that loads: the readout shows only its state, keeping the toolbar narrow.
	InputPickerOnDeviceLoading: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderInputPicker(context, undefined, { model: ON_DEVICE_INPUT_MODEL, status: ON_DEVICE_INPUT_LOADING }),
	}),
	// Once it is ready, the readout shows its thinking level and context size.
	InputPickerOnDeviceReady: defineComponentFixture({
		render: context => renderInputPicker(context, undefined, { model: ON_DEVICE_INPUT_MODEL, status: ON_DEVICE_INPUT_READY }),
	}),
	// A new context size reloads the selected model: the readout says so.
	InputPickerOnDeviceReloading: defineComponentFixture({
		render: context => renderInputPicker(context, undefined, { model: ON_DEVICE_INPUT_MODEL, status: ON_DEVICE_INPUT_RELOADING }),
	}),
	PickerAnchored: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderPicker(context, { anchored: true }),
	}),
	PickerAnchoredRight: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderPicker(context, { anchored: true, anchorRight: true }),
	}),
	PickerAnchoredPricingExpanded: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { anchored: true, pricingExpanded: true }),
	}),
	PickerAnchoredRightPricingExpanded: defineComponentFixture({
		render: context => renderPicker(context, { anchored: true, anchorRight: true, pricingExpanded: true }),
	}),
	PickerAnchoredWithCollapsedModels: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderPicker(context, {
			anchored: true,
			anchorRight: true,
			models: [...COPILOT_ONLY_MODELS, MANY_EFFORT_MODEL, ...DEMOTED_MODELS],
			selectedModelId: MANY_EFFORT_MODEL.identifier,
			configured: { [MANY_EFFORT_MODEL.identifier]: { reasoningEffort: 'high' } },
			controlModels: {
				...CONTROL_MODELS,
				...Object.fromEntries(DEMOTED_MODELS.map(model => [model.metadata.id, { label: model.metadata.name, exists: true, demoted: true }])),
			},
		}),
	}),
	PickerAnchoredAutoSelected: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { anchored: true, selectedModelId: AUTO_MODEL.identifier }),
	}),
	PickerAutoDetails: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { selectedModelId: AUTO_MODEL.identifier, openDetailsFor: 'Auto' }),
	}),
	Picker: defineComponentFixture({ render: context => renderPicker(context, { models: COPILOT_ONLY_MODELS }) }),
	PickerWithAddedModels: defineComponentFixture({ render: context => renderPicker(context) }),
	...Object.fromEntries(Object.entries({
		PickerWithManagedDefault: { managedDefaultModel: 'gpt-5-5' },
		PickerWithManagedDefaultOverride: { managedDefaultModel: 'gpt-5-5', selectedModelId: 'copilot/claude-sonnet-5' },
		PickerWithManagedDefaultAndDiscount: {
			managedDefaultModel: 'gemini-3-1-pro',
			selectedModelId: 'copilot/gemini-3-1-pro',
			models: ALL_MODELS.map(model => model.metadata.id === 'gemini-3-1-pro' ? {
				...model,
				metadata: { ...model.metadata, promo: { id: 'promo', discountPercent: 25, message: 'Discounted for a limited time.' } },
			} : model),
		},
		PickerWithManagedDefaultAndRetirement: { models: [...COPILOT_NOTICE_MODELS, AUTO_MODEL], managedDefaultModel: 'gpt-4-turbo' },
		PickerWithManagedDefaultDetails: { managedDefaultModel: 'gpt-5-5', openSelectedDetails: true },
		PickerWithManagedAutoDefault: { managedDefaultModel: 'auto', selectedModelId: AUTO_MODEL.identifier },
		PickerWithManagedDefaultAndAutoSelected: { managedDefaultModel: 'gpt-5-5', selectedModelId: AUTO_MODEL.identifier },
	} satisfies Record<string, IPickerFixtureOptions>).map(([name, options]) => [name, defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, options),
	})])),
	PickerAddedModelsTab: defineComponentFixture({
		render: context => renderPicker(context, { initialTabLabel: 'Ollama' }),
	}),
	PickerAddedModelSelected: defineComponentFixture({
		render: context => renderPicker(context, {
			selectedModelId: 'ollama/mistral-large',
			pinnedModelIds: ['ollama/llama-3-70b'],
		}),
	}),
	PickerWithManyProviders: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, {
			models: [...ALL_MODELS, ...OPENAI_MODELS, ...ANTHROPIC_MODELS, ...GOOGLE_MODELS],
			initialTabLabel: 'Ollama',
		}),
	}),
	PickerAddedModelsPinned: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [...ALL_MODELS, ...OPENAI_MODELS],
			pinnedModelIds: ['ollama/llama-3-70b', 'openai/gpt-4o'],
			initialTabLabel: 'Ollama',
		}),
	}),
	PickerWithAutoSelected: defineComponentFixture({ render: context => renderPicker(context, { models: COPILOT_ONLY_MODELS, selectedModelId: 'copilot/auto' }) }),
	PickerAutoSelectedOtherProvider: defineComponentFixture({
		render: context => renderPicker(context, { selectedModelId: AUTO_MODEL.identifier, initialTabLabel: 'Ollama' }),
	}),
	PickerAutoSelectedWithManyProviders: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { models: [...ALL_MODELS, ...OPENAI_MODELS, ...ANTHROPIC_MODELS, ...GOOGLE_MODELS], selectedModelId: AUTO_MODEL.identifier }),
	}),
	PickerAutoOnlyPlan: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [AUTO_MODEL],
			selectedModelId: 'copilot/auto',
			controlModels: CONTROL_MODELS_WITH_LOCKED,
		}),
	}),
	PickerFreePlan: defineComponentFixture({
		render: context => renderPicker(context, { models: [AUTO_MODEL], selectedModelId: AUTO_MODEL.identifier, controlModels: FREE_PLAN_CONTROL_MODELS, entitlement: ChatEntitlement.Free }),
	}),
	PickerFreePlanWithAddedModels: defineComponentFixture({
		render: context => renderPicker(context, { models: [AUTO_MODEL, ...OLLAMA_MODELS, ...OPENAI_MODELS], selectedModelId: AUTO_MODEL.identifier, controlModels: FREE_PLAN_CONTROL_MODELS, entitlement: ChatEntitlement.Free }),
	}),
	/** Copilot relays nothing selectable here, but the plan's upgrades still have a tab. */
	PickerFreePlanWithoutCopilotModels: defineComponentFixture({
		render: context => renderPicker(context, { models: [...OLLAMA_MODELS, ...OPENAI_MODELS], selectedModelId: AUTO_MODEL.identifier, controlModels: FREE_PLAN_CONTROL_MODELS, entitlement: ChatEntitlement.Free }),
	}),
	/** A Student account in the Copilot harness: Auto, with HydraFusion offered only as an upgrade. */
	PickerEduPlanCopilotHarness: defineComponentFixture({
		render: context => renderPicker(context, { models: [RELAYED_MODELS[0], HYDRA_FUSION_MODEL], selectedModelId: RELAYED_MODELS[0].identifier, controlModels: FREE_PLAN_CONTROL_MODELS, entitlement: ChatEntitlement.EDU }),
	}),
	PickerRelayedByHost: defineComponentFixture({
		render: context => renderPicker(context, { models: RELAYED_MODELS, selectedModelId: 'agent-host-copilotcli/gpt-5-5' }),
	}),
	/** Opened on its own tab because an on-device model is selected: one row per family, in every state. */
	PickerOnDeviceTab: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { anchored: true, ...ON_DEVICE_PICKER, selectedModelId: ON_DEVICE_SELECTED_MODEL.identifier }),
	}),
	/** The selected on-device model's detail page, as its readout in the chat input opens it, with its thinking level and context size. */
	PickerOnDeviceDetails: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { anchored: true, ...ON_DEVICE_PICKER, selectedModelId: ON_DEVICE_SELECTED_MODEL.identifier, openSelectedDetails: true }),
	}),
	/** The Copilot tab is unchanged by on-device models, which only add a tab. */
	PickerOnDeviceCopilotTab: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { anchored: true, ...ON_DEVICE_PICKER, selectedModelId: 'agent-host-copilotcli/gpt-5-5' }),
	}),
	/** With Auto selected, the Copilot tab leads with its Auto row, and on-device models stay in their own tab. */
	PickerOnDeviceCopilotAutoSelected: defineComponentFixture({
		render: context => renderPicker(context, { anchored: true, ...ON_DEVICE_PICKER, selectedModelId: 'agent-host-copilotcli/auto' }),
	}),
	/** Search names each on-device model after its tab, beside a Copilot model of a similar name. */
	PickerOnDeviceSearch: defineComponentFixture({
		render: context => renderPicker(context, { ...ON_DEVICE_PICKER, searchQuery: 'Flash' }),
	}),
	PickerWithHydraFusion: defineComponentFixture({
		render: context => renderPicker(context, { models: [...RELAYED_MODELS, HYDRA_FUSION_MODEL], selectedModelId: 'agent-host-copilotcli/gpt-5-5', entitlement: ChatEntitlement.Pro }),
	}),
	/** HydraFusion's details, with Default and Max as its tiers, before either is chosen. */
	PickerHydraFusionDetails: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { models: [...RELAYED_MODELS, HYDRA_FUSION_MODEL, HYDRA_FUSION_MAX_MODEL], selectedModelId: 'agent-host-copilotcli/auto', entitlement: ChatEntitlement.Pro, openDetailsFor: 'HydraFusion' }),
	}),
	/** HydraFusion's row stands for its Max tier once chosen. */
	PickerHydraFusionMaxSelected: defineComponentFixture({
		render: context => renderPicker(context, { models: [...RELAYED_MODELS, HYDRA_FUSION_MODEL, HYDRA_FUSION_MAX_MODEL], selectedModelId: HYDRA_FUSION_MAX_MODEL.identifier, entitlement: ChatEntitlement.Pro }),
	}),
	PickerHydraFusionMaxSelectedDetails: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { models: [...RELAYED_MODELS, HYDRA_FUSION_MODEL, HYDRA_FUSION_MAX_MODEL], selectedModelId: HYDRA_FUSION_MAX_MODEL.identifier, entitlement: ChatEntitlement.Pro, openDetailsFor: 'HydraFusion' }),
	}),
	PickerHydraFusionNeedsUpdate: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [...RELAYED_MODELS, HYDRA_FUSION_MODEL],
			selectedModelId: 'agent-host-copilotcli/gpt-5-5',
			controlModels: { 'hydrafusion': { label: 'HydraFusion', featured: true, exists: true, minVSCodeVersion: '99.0.0' } },
			entitlement: ChatEntitlement.Pro,
		}),
	}),
	PickerLockedModels: defineComponentFixture({
		render: context => renderPicker(context, { models: COPILOT_ONLY_MODELS, controlModels: CONTROL_MODELS_WITH_LOCKED }),
	}),
	PickerLockedModelsBusiness: defineComponentFixture({
		render: context => renderPicker(context, { models: COPILOT_ONLY_MODELS, controlModels: CONTROL_MODELS_WITH_LOCKED, entitlement: ChatEntitlement.Business }),
	}),
	PickerBadges: defineComponentFixture({
		render: context => renderPicker(context, { models: [AUTO_MODEL, ...COPILOT_NOTICE_MODELS], expandOther: true }),
	}),
	PickerScrollableBadges: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, {
			models: [AUTO_MODEL, ...COPILOT_NOTICE_MODELS, ...DEMOTED_MODELS],
			pinnedModelIds: ['copilot/gpt-5-5', 'copilot/gpt-5-1', 'copilot/gpt-4-turbo'],
			configured: { 'copilot/gpt-5-5': { reasoningEffort: 'xhigh', contextSize: 1000000 } },
			controlModels: {
				...CONTROL_MODELS,
				...Object.fromEntries(DEMOTED_MODELS.map(model => [model.metadata.id, { label: model.metadata.name, exists: true, demoted: true }])),
			},
			expandOther: true,
		}),
	}),
	PickerConfiguredModels: defineComponentFixture({
		render: context => renderPicker(context, {
			models: COPILOT_ONLY_MODELS,
			configured: {
				'copilot/gpt-5-5': { reasoningEffort: 'xhigh', contextSize: 1000000 },
				'copilot/gemini-3-1-pro': { reasoningEffort: 'high' },
			},
		}),
	}),
	PickerSearch: defineComponentFixture({ render: context => renderPicker(context, { search: true }) }),
	PickerWithCard: defineComponentFixture({ render: context => renderPicker(context, { models: COPILOT_ONLY_MODELS, openDetailsFor: 'GPT-5.5' }) }),
	PickerInformationOnly: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, { models: COPILOT_ONLY_MODELS, openDetailsFor: 'Claude Sonnet 5' }),
	}),
	PickerDirectDetails: defineComponentFixture({
		render: context => renderPicker(context, { anchored: true, openSelectedDetails: true, cacheWarm: true }),
	}),
	PickerPinning: defineComponentFixture({
		render: context => renderPicker(context, { models: COPILOT_ONLY_MODELS, openDetailsFor: 'GPT-5.5', motionReduced: false }),
	}),
	PickerPinningReducedMotion: defineComponentFixture({
		render: context => {
			context.container.classList.add('monaco-reduce-motion');
			return renderPicker(context, { models: COPILOT_ONLY_MODELS, openDetailsFor: 'GPT-5.5', motionReduced: true });
		},
	}),
	PickerConfiguredModelCard: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderPicker(context, {
			models: COPILOT_ONLY_MODELS,
			pinnedModelIds: ['copilot/gpt-5-5'],
			configured: { 'copilot/gpt-5-5': { reasoningEffort: 'xhigh', contextSize: 1000000 } },
			openDetailsFor: 'GPT-5.5',
		}),
	}),
	PickerReducedMotion: defineComponentFixture({
		render: context => {
			context.container.classList.add('monaco-reduce-motion');
			return renderPicker(context, {
				models: COPILOT_ONLY_MODELS,
				configured: { 'copilot/gpt-5-5': { reasoningEffort: 'xhigh', contextSize: 1000000 } },
				openDetailsFor: 'GPT-5.5',
			});
		},
	}),
	PickerWelcome: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [],
			providerPlaceholders: [{ vendor: 'copilot', label: 'GitHub Copilot', message: 'Sign in to see available models.', action: { label: 'Sign in', run: () => { } } }],
		}),
	}),
	CardStandardContext: defineComponentFixture({ render: context => renderCard(context, COPILOT_MODELS[0], false) }),
	CardPricingExpanded: defineComponentFixture({
		additionalThemes: ['darkHighContrast'],
		render: context => renderCard(context, COPILOT_MODELS[0], false, true),
	}),
	PickerSpeedVariants: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [...COPILOT_ONLY_MODELS, ...SPEED_VARIANT_MODELS],
			expandOther: true,
			openDetailsFor: 'Example 2.5',
		}),
	}),
	/** The faster twin selected outright, as `chat.defaultModel` set to its id does. */
	PickerSpeedVariantsFastSelected: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [...COPILOT_ONLY_MODELS, ...SPEED_VARIANT_MODELS],
			selectedModelId: 'copilot/example-2.5-fast',
			openDetailsFor: 'Example 2.5 (fast mode)',
		}),
	}),
	CardExtendedContext: defineComponentFixture({ render: context => renderCard(context, COPILOT_MODELS[0], true) }),
	CardManyEffortValues: defineComponentFixture({
		additionalThemes: ['darkHighContrast', 'lightHighContrast'],
		render: context => renderCard(context, MANY_EFFORT_MODEL, false),
	}),
	CardWithoutConfiguration: defineComponentFixture({ render: context => renderCard(context, COPILOT_MODELS[2], false) }),
});
