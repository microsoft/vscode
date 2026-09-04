/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from '../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { localize } from '../../../../../nls.js';
import { autoModeTiers, defaultAutoModeTier, getAutoModeTierDescription, getAutoModeTierLabel } from '../../../../../platform/agentHost/common/autoModeTiers.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { IContextViewDelegate, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { NullOpenerService } from '../../../../../platform/opener/test/common/nullOpenerService.js';
import { StateType } from '../../../../../platform/update/common/update.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelProviderDescriptor, ILanguageModelsService, IModelControlEntry } from '../../../../contrib/chat/common/languageModels.js';
import { IModelConfigurationAccess } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ModelPickerAutoRow } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerAutoRow.js';
import { IPricingDisclosure, ModelCard } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerCard.js';
import { ITabbedModelPickerContext, TabbedModelPicker } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerTabbedWidget.js';
import { IModelPickerProviderPlaceholder } from '../../../../contrib/chat/browser/widget/input/modelPicker/modelPickerTabs.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../fixtureUtils.js';

import '../../../../contrib/chat/browser/widget/media/chat.css';
import '../../../../contrib/chat/browser/widget/input/modelPicker/media/modelPicker.css';

const EXTENSION = new ExtensionIdentifier('fixture.models');

interface IFixtureModelOptions {
	readonly vendor?: string;
	readonly category?: string;
	readonly priceCategory?: string;
	readonly detail?: string;
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
			category: options.category,
			priceCategory: options.priceCategory,
			isBYOK: options.isBYOK,
			byokModelIdentifier: options.byokModelIdentifier,
			modelGroup: options.modelGroupId ? { id: options.modelGroupId } : undefined,
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
	createModel('claude-sonnet-5', 'Claude Sonnet 5', { category: 'powerful', priceCategory: 'medium', costs: true }),
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
	createModel('auto', 'Auto', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'copilot', detail: '10% off', effortValues: [...autoModeTiers], effortLabels: autoModeTiers.map(getAutoModeTierLabel), effortDefault: defaultAutoModeTier }),
	createModel('gpt-5-5', 'GPT-5.5', { vendor: 'agent-host-copilotcli', isBYOK: true, byokModelIdentifier: 'copilot/gpt-5-5', modelGroupId: 'copilot', category: 'powerful', priceCategory: 'high' }),
	createModel('claude-sonnet-5', 'Claude Sonnet 5', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'copilot', category: 'powerful' }),
	createModel('llama-3-70b', 'Llama 3 70B', { vendor: 'agent-host-copilotcli', isBYOK: true, modelGroupId: 'ollama' }),
];
const ALL_MODELS = [...COPILOT_ONLY_MODELS, ...OLLAMA_MODELS];

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
	readonly selectedModelId?: string;
	readonly pinnedModelIds?: readonly string[];
	/** Opens the detail card for the model whose row label matches, as a chevron click would. */
	readonly openCardFor?: string;
	/** Providers with no models, which show a welcome body instead of a list. */
	readonly providerPlaceholders?: readonly IModelPickerProviderPlaceholder[];
	/** Starts on this destination, matched against the tab label. */
	readonly initialTabLabel?: string;
	/** Overrides the models offered, e.g. to show the picker without any added models. */
	readonly models?: readonly ILanguageModelChatMetadataAndIdentifier[];
	/** Opens search, which replaces the tab strip with the filter field. */
	readonly search?: boolean;
	/** Expands the collapsed "Other Models" section. */
	readonly expandOther?: boolean;
	/** Curated models the account cannot select, which offer an unlock path instead. */
	readonly controlModels?: IStringDictionary<IModelControlEntry>;
	/** The plan the account is on, which decides whether locked models offer upgrade or admin. */
	readonly entitlement?: ChatEntitlement;
	/** Settings to apply per model identifier, so rows can show what they were tuned to. */
	readonly configured?: IStringDictionary<IStringDictionary<unknown>>;
}

async function renderPicker(context: ComponentFixtureContext, options: IPickerFixtureOptions = {}): Promise<void> {
	const { container, disposableStore } = context;
	setupContainer(container, options.openCardFor ? 700 : 360);

	const instantiationService = createEditorServices(disposableStore, {
		colorTheme: context.theme,
		additionalServices: registration => {
			registerWorkbenchServices(registration);
			registration.defineInstance(ILayoutService, upcastPartial<ILayoutService>({
				getContainer: () => container.ownerDocument.body,
				mainContainer: container.ownerDocument.body,
				activeContainer: container.ownerDocument.body,
				onDidChangeActiveContainer: Event.None,
				onDidAddContainer: Event.None,
				onDidLayoutMainContainer: Event.None,
				onDidLayoutActiveContainer: Event.None,
				onDidLayoutContainer: Event.None,
			}));
			registration.defineInstance(IContextViewService, createInlineContextViewService(container, disposableStore));
			registration.defineInstance(ILanguageModelsService, createLanguageModelsService());
			registration.defineInstance(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ entitlement: options.entitlement ?? ChatEntitlement.Free }));
			// The shared harness discards writes, so the picker cannot remember anything.
			registration.defineInstance(IStorageService, disposableStore.add(new InMemoryStorageService()));
		},
	});

	// The picker opens upward from its chip, so its height comes from the space above the
	// anchor. Stand the anchor where the chat input's chip sits, or the list measures flat.
	const anchor = document.createElement('div');
	anchor.style.position = 'fixed';
	anchor.style.bottom = '8px';
	anchor.style.left = '8px';
	anchor.style.width = '120px';
	anchor.style.height = '22px';
	container.appendChild(anchor);

	const picker = disposableStore.add(instantiationService.createInstance(TabbedModelPicker));
	const configurationAccess = createConfigurationAccess();
	for (const [modelId, values] of Object.entries(options.configured ?? {})) {
		void configurationAccess.setModelConfiguration(modelId, values);
	}
	const pickerContext: ITabbedModelPickerContext = {
		models: options.models ?? ALL_MODELS,
		selectedModelId: options.selectedModelId ?? 'copilot/gpt-5-5',
		recentModelIds: ['copilot/gpt-5-3-codex', 'copilot/gemini-3-5-flash'],
		pinnedModelIds: options.pinnedModelIds ?? ['copilot/claude-sonnet-5'],
		controlModels: options.controlModels ?? CONTROL_MODELS,
		configurationAccess,
		isUBB: true,
		showManageModels: true,
		onSelect: () => { },
		onTogglePin: () => { },
		onManageModels: () => { },
		onConfigurationChanged: () => { },
		unavailableContext: {
			show: true,
			currentVSCodeVersion: '1.100.0',
			manageSettingsUrl: 'https://github.com/settings/copilot',
			updateStateType: StateType.Idle,
		},
		onUnavailableLinkClick: () => { },
		providerPlaceholders: options.providerPlaceholders ?? [],
		cacheBreakHint: undefined,
	};
	picker.show(anchor, pickerContext);

	if (options.expandOther) {
		[...container.querySelectorAll<HTMLElement>('.monaco-list-row.action')]
			.find(row => row.textContent?.includes('Other Models'))?.click();
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	if (options.search) {
		container.querySelector<HTMLElement>('.tabbed-action-list-tabbar-action[data-id="search"]')?.click();
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	if (options.initialTabLabel) {
		const tab = [...container.querySelectorAll<HTMLElement>('.chat-model-picker-tabbar .monaco-button')]
			.find(candidate => candidate.ariaLabel === options.initialTabLabel);
		tab?.click();
		await new Promise(resolve => setTimeout(resolve, 50));
	}

	if (options.openCardFor) {
		const row = [...container.querySelectorAll<HTMLElement>('.monaco-list-row.action')]
			.find(candidate => candidate.textContent?.includes(options.openCardFor!));
		row?.querySelector<HTMLElement>('.action-list-submenu-indicator.has-submenu')?.click();
		await new Promise(resolve => setTimeout(resolve, 50));
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

function renderAutoRow(context: ComponentFixtureContext, enabled: boolean): void {
	const { container, disposableStore } = context;
	setupContainer(container, 320);

	const row = disposableStore.add(new ModelPickerAutoRow({
		autoModel: AUTO_MODEL,
		configurationAccess: createConfigurationAccess(),
		isEnabled: () => enabled,
		onToggle: () => { },
	}));

	const wrapper = document.createElement('div');
	wrapper.classList.add('action-widget');
	wrapper.appendChild(row.element);
	container.appendChild(wrapper);
}

export default defineThemedFixtureGroup({ path: 'chat/input/tabbedModelPicker' }, {
	Picker: defineComponentFixture({ render: context => renderPicker(context, { models: COPILOT_ONLY_MODELS }) }),
	PickerWithAddedModels: defineComponentFixture({ render: context => renderPicker(context) }),
	PickerAddedModelsTab: defineComponentFixture({
		render: context => renderPicker(context, { initialTabLabel: 'Ollama' }),
	}),
	PickerWithManyProviders: defineComponentFixture({
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
	PickerAutoOnlyPlan: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [AUTO_MODEL],
			selectedModelId: 'copilot/auto',
			controlModels: CONTROL_MODELS_WITH_LOCKED,
		}),
	}),
	PickerRelayedByHost: defineComponentFixture({
		render: context => renderPicker(context, { models: RELAYED_MODELS, selectedModelId: 'agent-host-copilotcli/gpt-5-5' }),
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
	PickerWithCard: defineComponentFixture({ render: context => renderPicker(context, { models: COPILOT_ONLY_MODELS, openCardFor: 'GPT-5.5' }) }),
	PickerWelcome: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [],
			providerPlaceholders: [{ vendor: 'copilot', label: 'GitHub Copilot', message: 'Sign in to see available models.', action: { label: 'Sign in', run: () => { } } }],
		}),
	}),
	CardStandardContext: defineComponentFixture({ render: context => renderCard(context, COPILOT_MODELS[0], false) }),
	CardPricingExpanded: defineComponentFixture({ render: context => renderCard(context, COPILOT_MODELS[0], false, true) }),
	PickerSpeedVariants: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [...COPILOT_ONLY_MODELS, ...SPEED_VARIANT_MODELS],
			expandOther: true,
			openCardFor: 'Example 2.5',
		}),
	}),
	/** The faster twin selected outright, as `chat.defaultModel` set to its id does. */
	PickerSpeedVariantsFastSelected: defineComponentFixture({
		render: context => renderPicker(context, {
			models: [...COPILOT_ONLY_MODELS, ...SPEED_VARIANT_MODELS],
			selectedModelId: 'copilot/example-2.5-fast',
			openCardFor: 'Example 2.5 (fast mode)',
		}),
	}),
	CardExtendedContext: defineComponentFixture({ render: context => renderCard(context, COPILOT_MODELS[0], true) }),
	CardManyEffortValues: defineComponentFixture({ render: context => renderCard(context, MANY_EFFORT_MODEL, false) }),
	CardWithoutConfiguration: defineComponentFixture({ render: context => renderCard(context, COPILOT_MODELS[2], false) }),
	AutoRowOff: defineComponentFixture({ render: context => renderAutoRow(context, false) }),
	AutoRowOn: defineComponentFixture({ render: context => renderAutoRow(context, true) }),
});
