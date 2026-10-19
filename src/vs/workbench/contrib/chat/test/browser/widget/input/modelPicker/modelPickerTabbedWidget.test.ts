/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { ContextView, ContextViewDOMPosition } from '../../../../../../../../base/browser/ui/contextview/contextview.js';
import { DeferredPromise, timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../../../../base/common/keyCodes.js';
import { decodeKeybinding } from '../../../../../../../../base/common/keybindings.js';
import { OS } from '../../../../../../../../base/common/platform.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { AnchorPosition } from '../../../../../../../../base/common/layout.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../../../base/common/errors.js';
import { MutableDisposable, toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../../../../base/common/themables.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TabbedActionListWidget } from '../../../../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { IConfigurationChangeEvent, IConfigurationService, IConfigurationValue } from '../../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewDelegate, IContextViewService } from '../../../../../../../../platform/contextview/browser/contextView.js';
import { IContextKeyService } from '../../../../../../../../platform/contextkey/common/contextkey.js';
import { ContextKeyService } from '../../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IHoverService } from '../../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../../../../platform/layout/browser/layoutService.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../../platform/storage/common/storage.js';
import { StateType } from '../../../../../../../../platform/update/common/update.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { ITabbedModelPickerContext, TabbedModelPicker } from '../../../../../browser/widget/input/modelPicker/modelPickerTabbedWidget.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelProviderDescriptor, ILanguageModelsService, IModelConfigurationAccess, IModelControlEntry, IModelsControlManifest } from '../../../../../common/languageModels.js';
import type { IModelConfigPropertySchema } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ChatConfiguration } from '../../../../../common/constants.js';
import { IModelPickerComparison, IModelPickerComparisonState } from '../../../../../browser/widget/input/modelPicker/modelPickerComparison.js';
import { createLocalModelPickerPresentation, IModelPickerLocalModels } from '../../../../../browser/widget/input/modelPicker/modelPickerLocalModelItems.js';
import { SessionType } from '../../../../../common/chatSessionsService.js';
import { ILocalModelFamilyV1, ILocalModelStatusV1 } from '../../../../../../../../platform/agentHost/common/localModel.js';
import '../../../../../browser/widget/input/modelPicker/media/modelPicker.css';

function model(id: string, configurable = true): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `copilot/${id}`,
		metadata: upcastPartial<ILanguageModelChatMetadata>({
			id, name: id, family: id, vendor: 'copilot', version: '1',
			maxContextWindowTokens: 200000,
			tooltip: 'Model information.',
			configurationSchema: configurable ? {
				properties: {
					effort: { type: 'string', group: 'navigation', enum: ['low', 'high'], enumItemLabels: ['Low', 'High'], default: 'low' },
					context: { type: 'number', group: 'tokens', enum: [32000, 64000], default: 32000 },
				}
			} : undefined,
		}),
	};
}

function harnessModel(harness: 'claude' | 'codex', id: string): ILanguageModelChatMetadataAndIdentifier {
	const result = model(id);
	return {
		...result,
		identifier: `agent-host-${harness}/${id}`,
		metadata: {
			...result.metadata,
			vendor: `agent-host-${harness}`,
			modelGroup: { id: harness },
			targetChatSessionType: `agent-host-${harness}`,
		},
	};
}

function createAutoModel(): ILanguageModelChatMetadataAndIdentifier {
	const auto = model('auto');
	return {
		...auto,
		metadata: {
			...auto.metadata,
			name: 'Auto',
			detail: '10% discount',
			autoModelDiscountPercent: 10,
			tooltip: ILanguageModelChatMetadata.getAutoModelDescription(),
			configurationSchema: {
				properties: {
					tier: {
						type: 'string', group: 'navigation', title: 'Optimize for',
						enum: ['efficiency', 'balance', 'intelligence'],
						enumItemLabels: ['Efficiency', 'Balance', 'Intelligence'],
						enumDescriptions: ['Cheaper models', 'Balances capability and cost', 'Most capable models'],
						default: 'balance',
					},
				}
			},
		},
	};
}

function createHydraFusionModel(): ILanguageModelChatMetadataAndIdentifier {
	const hydra = model('hydrafusion', false);
	return { ...hydra, metadata: { ...hydra.metadata, name: 'HydraFusion', modelGroup: { id: 'copilotcli' }, detail: 'Research preview', tooltip: 'HydraFusion routes the first eligible turn and may use multiple models.' } };
}

function createFusionModel(balanceUsesHydraFusion = true): ILanguageModelChatMetadataAndIdentifier {
	const auto = createAutoModel();
	return {
		...auto,
		metadata: {
			...auto.metadata,
			name: 'Fusion',
			autoModelFusion: { balanceUsesHydraFusion },
			configurationSchema: {
				properties: {
					tier: {
						type: 'string', group: 'navigation', title: 'Effort Level',
						enum: ['balance', 'intelligence'],
						enumItemLabels: ['Standard', 'High'],
						default: 'balance',
					},
				}
			},
		},
	};
}

function createHydraFusionMaxModel(): ILanguageModelChatMetadataAndIdentifier {
	const max = model('hydrafusion-max', false);
	return { ...max, metadata: { ...max.metadata, name: 'HydraFusion Max', modelGroup: { id: 'copilotcli' }, detail: 'Research preview', tooltip: 'HydraFusion Max routes the first eligible turn and may use multiple models.' } };
}

suite('TabbedModelPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const models = [model('First'), model('Second'), model('Fixed', false)];

	function createPicker(options: {
		models?: ILanguageModelChatMetadataAndIdentifier[];
		access?: IModelConfigurationAccess;
		details?: string;
		cacheWarm?: boolean;
		contextViewLayer?: number;
		inDialog?: boolean;
		/** Vertical placement of the anchor, which otherwise sits at the bottom of the window like the chat input. */
		anchorTop?: string;
		realContextView?: boolean;
		policyDefault?: string;
		userDefault?: string;
		selectedModelId?: string;
		pinnedModelIds?: string[];
		controlModels?: IStringDictionary<IModelControlEntry>;
		controlManifest?: IModelsControlManifest;
		entitlement?: ChatEntitlement;
		showUnavailable?: boolean;
		showManageModels?: boolean;
		comparisonKeybinding?: number;
		providerPlaceholders?: ITabbedModelPickerContext['providerPlaceholders'];
		beforeSave?: (values: IStringDictionary<unknown>) => Promise<void>;
		comparison?: IModelPickerComparison;
		comparisonModels?: ILanguageModelChatMetadataAndIdentifier[];
		localModels?: IModelPickerLocalModels;
	} = {}) {
		const container = dom.append(document.body, dom.$('.monaco-workbench.monaco-reduce-motion'));
		container.style.cssText = '--vscode-spacing-size60: 6px; --vscode-spacing-size160: 16px; --vscode-spacing-size200: 20px; --vscode-spacing-size280: 28px;';
		disposables.add(toDisposable(() => container.remove()));
		const anchorContainer = options.inDialog ? dom.append(container, dom.$('.monaco-dialog-box')) : container;
		const anchor = dom.append(anchorContainer, dom.$('button'));
		anchor.style.cssText = `position: fixed; ${options.anchorTop !== undefined ? `top: ${options.anchorTop}` : 'bottom: 20px'}; left: 20px; width: 120px; height: 22px;`;
		let popup = dom.append(container, dom.$('div'));
		const render = disposables.add(new MutableDisposable());
		let activeDelegate: IContextViewDelegate | undefined;
		let contextView = upcastPartial<IContextViewService>({
			showContextView: delegate => {
				activeDelegate = delegate;
				render.value = delegate.render(popup) ?? undefined;
				return { close: () => contextView.hideContextView() };
			},
			hideContextView: () => {
				const delegate = activeDelegate;
				activeDelegate = undefined;
				delegate?.onHide?.();
				render.clear();
				dom.clearNode(popup);
			},
			getContextViewElement: () => popup,
			layout: () => { },
		});
		if (options.realContextView) {
			const view = disposables.add(new ContextView(container, ContextViewDOMPosition.ABSOLUTE));
			popup = view.getViewElement();
			contextView = upcastPartial<IContextViewService>({
				showContextView: delegate => {
					activeDelegate = delegate;
					view.show(delegate);
					return { close: () => view.hide() };
				},
				hideContextView: () => view.hide(),
				getContextViewElement: () => popup,
				layout: () => view.layout(),
			});
		}
		const instantiationService = disposables.add(new TestInstantiationService());
		const configurationService = new class extends TestConfigurationService {
			managed = options.policyDefault !== undefined;

			override inspect<T>(key: string): IConfigurationValue<T> {
				const result = super.inspect<T>(key);
				return this.managed && key === ChatConfiguration.DefaultModel ? { ...result, policyValue: result.value } : result;
			}
		}({ [ChatConfiguration.DefaultModel]: options.policyDefault ?? options.userDefault });
		disposables.add(configurationService.onDidChangeConfigurationEmitter);
		instantiationService.set(IConfigurationService, configurationService);
		instantiationService.set(IContextViewService, contextView);
		instantiationService.set(IHoverService, NullHoverService);
		instantiationService.set(IOpenerService, NullOpenerService);
		const keybindingService = new MockKeybindingService();
		if (options.comparisonKeybinding) {
			const binding = decodeKeybinding(options.comparisonKeybinding, OS)!;
			sinon.stub(keybindingService, 'lookupKeybinding').returns(keybindingService.resolveKeybinding(binding)[0]);
		}
		instantiationService.set(IKeybindingService, keybindingService);
		instantiationService.set(IContextKeyService, disposables.add(new ContextKeyService(new TestConfigurationService())));
		instantiationService.set(IAccessibilityService, new class extends TestAccessibilityService {
			override isMotionReduced(): boolean { return true; }
		}());
		instantiationService.set(ILayoutService, upcastPartial<ILayoutService>({
			getContainer: () => container, mainContainer: container, onDidChangeActiveContainer: Event.None,
		}));
		instantiationService.set(IStorageService, disposables.add(new InMemoryStorageService()));
		let entitlement = options.entitlement ?? ChatEntitlement.Pro;
		const entitlementChanged = disposables.add(new Emitter<void>());
		instantiationService.set(IChatEntitlementService, upcastPartial<IChatEntitlementService>({
			get entitlement() { return entitlement; },
			onDidChangeEntitlement: entitlementChanged.event,
		}));
		instantiationService.set(ILanguageModelsService, upcastPartial<ILanguageModelsService>({
			getVendors: () => [
				upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'copilot', displayName: 'Copilot', isDefault: true }),
				upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'claude', displayName: 'Claude' }),
				upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'codex', displayName: 'Codex' }),
				upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'ollama', displayName: 'Ollama' }),
			],
			getLanguageModelGroups: () => [],
			getModelsControlManifest: () => options.controlManifest ?? { free: {}, paid: {} },
		}));
		const changed = disposables.add(new Emitter<string>());
		const values = new Map<string, IStringDictionary<unknown>>();
		const access: IModelConfigurationAccess = options.access ?? {
			getModelConfiguration: id => values.get(id),
			getModelConfigurationActions: () => [],
			setModelConfiguration: async (id, next) => {
				if (options.beforeSave) {
					await options.beforeSave(next);
				}
				values.set(id, { ...values.get(id), ...next });
				changed.fire(id);
			},
			onDidChange: changed.event,
		};
		const selections: string[] = [];
		const pins: string[] = [];
		const configurationChanges: Parameters<ITabbedModelPickerContext['onConfigurationChanged']>[] = [];
		let hintDismissed = false;
		const availableModels = options.models ?? models;
		const context: ITabbedModelPickerContext = {
			comparison: options.comparison,
			localModels: options.localModels,
			models: availableModels, selectedModelId: options.selectedModelId ?? availableModels[0]?.identifier,
			comparisonModels: options.comparisonModels,
			recentModelIds: [], pinnedModelIds: options.pinnedModelIds ?? [],
			controlModels: options.controlModels ?? Object.fromEntries(availableModels.map(model => [model.metadata.id, { exists: true, featured: true, label: model.metadata.name }])),
			configurationAccess: access, isUBB: false, showManageModels: options.showManageModels ?? false, providerPlaceholders: options.providerPlaceholders ?? [],
			unavailableContext: { show: !!options.showUnavailable, currentVSCodeVersion: '1.140.0', manageSettingsUrl: undefined, updateStateType: StateType.Idle },
			onUnavailableLinkClick: () => { },
			onSelect: model => selections.push(model.identifier),
			onTogglePin: (id, pinned) => { if (pinned) { pins.push(id); } },
			onManageModels: () => { },
			onDidToggleOtherModels: () => { },
			onDidSearch: () => { },
			onConfigurationChanged: (...change) => configurationChanges.push(change),
			cacheBreakHint: undefined,
			configurationCacheBreakHint: options.cacheWarm ? { text: 'Changing options resets the prompt cache.', link: undefined, dismiss: () => { hintDismissed = true; } } : undefined,
		};
		const picker = disposables.add(instantiationService.createInstance(TabbedModelPicker));
		picker.show(anchor, context, options.details, false, options.contextViewLayer);
		return {
			picker, popup, anchor, context, selections, pins, values, changed, configurationService, configurationChanges,
			dismiss: () => contextView.hideContextView(),
			setEntitlement: (value: ChatEntitlement) => {
				entitlement = value;
				entitlementChanged.fire();
			},
			get hintDismissed() { return hintDismissed; },
			get contextViewLayer() { return activeDelegate?.layer; },
			get anchorPosition() { return activeDelegate?.anchorPosition; },
		};
	}

	function element(container: ParentNode, selector: string): HTMLElement {
		const element = container.querySelector<HTMLElement>(selector);
		assert.ok(element, selector);
		return element;
	}

	function openDetails(popup: HTMLElement, name: string): void {
		element(popup, `[role="button"][aria-label^="${name} Details"]`).click();
	}

	function goBack(popup: HTMLElement): void {
		element(popup, '[role="button"][aria-label^="Back to Models"]').click();
	}

	test('inline Fusion tiers are taller selectable rows and save the runtime tier before closing', async () => {
		for (const balanceUsesHydraFusion of [false, true]) {
			const fusion = createFusionModel(balanceUsesHydraFusion);
			const hydra = createHydraFusionModel();
			const max = createHydraFusionMaxModel();
			const result = createPicker({ models: [fusion, hydra, max, ...models] });
			const modelHeight = element(result.popup, '.chat-model-picker-model').getBoundingClientRect().height;
			await result.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
			result.picker.show(result.anchor, result.context);
			const rows = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-picker-fusion-tier'));
			assert.deepStrictEqual(rows.map(row => {
				const label = element(row, '.title');
				const range = document.createRange();
				range.selectNodeContents(label);
				const textBounds = range.getBoundingClientRect();
				const labelBounds = label.getBoundingClientRect();
				return {
					label: label.textContent,
					detail: row.querySelector('.detail')?.textContent,
					taller: row.getBoundingClientRect().height > modelHeight,
					role: row.getAttribute('role'),
					leadingCheck: element(row, '.codicon').getBoundingClientRect().right <= labelBounds.left,
					unclippedLabel: textBounds.top >= labelBounds.top && textBounds.bottom <= labelBounds.bottom,
				};
			}), [
				{ label: 'Standard', detail: 'Quick tasks, lighter compute', taller: true, role: 'menuitemradio', leadingCheck: true, unclippedLabel: true },
				{ label: 'High', detail: 'Everyday work, balanced compute', taller: true, role: 'menuitemradio', leadingCheck: true, unclippedLabel: true },
				{ label: 'Max', detail: 'Complex tasks, maximum compute', taller: true, role: 'menuitemradio', leadingCheck: true, unclippedLabel: true },
			]);
			rows[1].click();
			await timeout(0);
			assert.deepStrictEqual({
				selected: result.selections,
				saved: result.values.get(fusion.identifier),
				visible: result.picker.isVisible,
			}, {
				selected: [balanceUsesHydraFusion ? hydra.identifier : fusion.identifier],
				saved: balanceUsesHydraFusion ? undefined : { tier: 'intelligence' },
				visible: false,
			});
			result.picker.show(result.anchor, { ...result.context, selectedModelId: result.selections[0] });
			const maxRow = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-picker-fusion-tier')).find(row => row.querySelector('.title')?.textContent === 'Max')!;
			maxRow.click();
			await timeout(0);
			assert.strictEqual(result.selections.at(-1), max.identifier);
		}
	});

	function createProviderFusionModel(tier: { enum: string[]; enumItemLabels: string[]; enumDescriptions?: string[]; enumItemDisabled?: boolean[]; default?: string }, promotions?: ILanguageModelChatMetadata['autoModelTierPromotions']): ILanguageModelChatMetadataAndIdentifier {
		const fusion = createFusionModel();
		return {
			...fusion,
			metadata: {
				...fusion.metadata,
				autoModelProviderTiers: true,
				// While the service promotes Fusion's tiers, the provider publishes no discount of its own.
				autoModelDiscountPercent: promotions ? undefined : fusion.metadata.autoModelDiscountPercent,
				...(promotions && { autoModelTierPromotions: promotions }),
				configurationSchema: { properties: { tier: { type: 'string', group: 'navigation', title: 'Effort Level', ...tier } } },
			},
		};
	}

	/**
	 * The list is height-capped and virtualized, and it opens on the chat's model, so only rows near it are rendered.
	 * Tests open on Fusion to read the list from its top, and use search to reach any other tier.
	 */
	function renderedFusionRow(popup: HTMLElement, label: string): HTMLElement | undefined {
		return Array.from(popup.querySelectorAll<HTMLElement>('.chat-model-picker-fusion-tier')).find(row => row.querySelector('.title')?.textContent === label);
	}

	/** Searches the open picker, returning the Fusion tier rows found. */
	function searchFusionRows(popup: HTMLElement, query: string): HTMLElement[] {
		if (!popup.querySelector('input')) {
			element(popup, '[data-id="search"]').click();
		}
		const filterInput = popup.querySelector<HTMLInputElement>('input')!;
		filterInput.value = query;
		filterInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
		return Array.from(popup.querySelectorAll<HTMLElement>('.chat-model-picker-fusion-tier'));
	}

	test('inline Fusion with provider tiers lists each tier once with its description, reason, and promotion, and saves the tier on Fusion', async () => {
		const day = 24 * 60 * 60 * 1000;
		const fusion = createProviderFusionModel({
			enum: ['balance', 'hydrafusion', 'hydrafusion-max', 'frontier'],
			enumItemLabels: ['Standard', 'High', 'Max', 'Frontier'],
			enumDescriptions: ['', '', 'Requires Copilot Pro+.', 'Newest models first.'],
			enumItemDisabled: [false, false, true, false],
			default: 'balance',
		}, [{ id: 'launch', message: 'Get 30% off Fusion High.', discountPercent: 30, tierIds: ['hydrafusion'], startsAt: new Date(Date.now() - day).toISOString() }]);
		const result = createPicker({ models: [...models, fusion, createHydraFusionModel(), createHydraFusionMaxModel()], selectedModelId: fusion.identifier });
		await result.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
		result.picker.show(result.anchor, result.context);
		const describe = (row: HTMLElement | undefined) => row && ({
			label: row.querySelector('.title')?.textContent,
			detail: row.querySelector('.detail')?.textContent,
			badge: row.querySelector('.action-item-badge')?.textContent || undefined,
			disabled: row.classList.contains('option-disabled'),
			ariaLabel: row.getAttribute('aria-label'),
		});
		const list = describe(renderedFusionRow(result.popup, 'Standard'));
		const [high, max, frontier] = ['High', 'Max', 'Frontier'].map(query => searchFusionRows(result.popup, query).map(describe));
		searchFusionRows(result.popup, 'High')[0].click();
		await timeout(0);
		assert.deepStrictEqual({ list, high, max, frontier, selections: result.selections, tier: result.values.get(fusion.identifier)?.tier }, {
			list: { label: 'Standard', detail: 'Quick tasks, lighter compute', badge: undefined, disabled: false, ariaLabel: 'Standard, Quick tasks, lighter compute' },
			high: [{ label: 'Fusion High', detail: 'Everyday work, balanced compute', badge: '30% discount', disabled: false, ariaLabel: 'Fusion High, 30% discount, Everyday work, balanced compute, Get 30% off Fusion High.' }],
			max: [{ label: 'Fusion Max', detail: 'Requires Copilot Pro+.', badge: undefined, disabled: true, ariaLabel: 'Fusion Max, Requires Copilot Pro+.' }],
			frontier: [{ label: 'Fusion Frontier', detail: 'Newest models first.', badge: undefined, disabled: false, ariaLabel: 'Fusion Frontier, Newest models first.' }],
			selections: [fusion.identifier],
			tier: 'hydrafusion',
		});
	});

	test('inline Fusion with provider tiers shows a chat on a HydraFusion model on its tier without listing the model again', async () => {
		const snapshot = async (maxDisabled: boolean, selected: ILanguageModelChatMetadataAndIdentifier) => {
			const fusion = createProviderFusionModel({ enum: ['balance', 'hydrafusion', 'hydrafusion-max'], enumItemLabels: ['Standard', 'High', 'Max'], enumItemDisabled: [false, false, maxDisabled], default: 'balance' });
			const result = createPicker({ models: [...models, fusion, createHydraFusionModel(), createHydraFusionMaxModel()], selectedModelId: selected.identifier });
			await result.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
			result.picker.show(result.anchor, result.context);
			// The list reveals the chat's model.
			const checked = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-picker-fusion-tier')).find(row => row.getAttribute('aria-checked') === 'true');
			const state = {
				checked: checked?.querySelector('.title')?.textContent,
				checkedDisabled: checked?.classList.contains('option-disabled'),
				highRows: searchFusionRows(result.popup, 'High').length,
				maxRows: searchFusionRows(result.popup, 'Max').length,
			};
			searchFusionRows(result.popup, state.checked ?? '')[0]?.click();
			await timeout(0);
			return { ...state, selections: result.selections, tier: result.values.get(fusion.identifier)?.tier };
		};
		assert.deepStrictEqual({
			high: await snapshot(false, createHydraFusionModel()),
			unavailableMax: await snapshot(true, createHydraFusionMaxModel()),
		}, {
			high: { checked: 'High', checkedDisabled: false, highRows: 1, maxRows: 1, selections: ['copilot/auto'], tier: 'hydrafusion' },
			unavailableMax: { checked: 'Max', checkedDisabled: false, highRows: 1, maxRows: 1, selections: ['copilot/hydrafusion-max'], tier: undefined },
		});
	});

	test('inline Fusion with provider tiers does not bring back a tier the provider hides', async () => {
		const fusion = createProviderFusionModel({ enum: ['balance', 'hydrafusion'], enumItemLabels: ['Standard', 'High'], default: 'balance' });
		const result = createPicker({ models: [...models, fusion, createHydraFusionModel(), createHydraFusionMaxModel()], selectedModelId: models[0].identifier });
		await result.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
		result.picker.show(result.anchor, result.context);
		assert.deepStrictEqual({
			tiers: searchFusionRows(result.popup, 'Fusion').map(row => row.querySelector('.title')?.textContent),
			max: searchFusionRows(result.popup, 'Max').length,
		}, { tiers: ['Fusion Standard', 'Fusion High'], max: 0 });
	});

	test('inline Fusion announces each tier of a managed schema as managed by the agent host', async () => {
		const managed = createFusionModel();
		const tier = managed.metadata.configurationSchema!.properties!.tier!;
		const readOnly: ILanguageModelChatMetadataAndIdentifier = { ...managed, metadata: { ...managed.metadata, configurationSchema: { properties: { tier: { ...tier, readOnly: true } } } } };
		const result = createPicker({ models: [readOnly, ...models] });
		await result.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
		result.picker.show(result.anchor, result.context);
		assert.deepStrictEqual({
			list: renderedFusionRow(result.popup, 'Standard')?.getAttribute('aria-label'),
			high: searchFusionRows(result.popup, 'High').map(row => row.getAttribute('aria-label')),
		}, {
			list: 'Standard, 10% discount, Quick tasks, lighter compute, Managed by the agent host',
			high: ['Fusion High, 10% discount, Everyday work, balanced compute, Managed by the agent host'],
		});
	});

	test('inline Fusion with a managed tier can still be chosen from another model, without saving the tier', async () => {
		const managed = createFusionModel();
		const tier = managed.metadata.configurationSchema!.properties!.tier!;
		const readOnly: ILanguageModelChatMetadataAndIdentifier = { ...managed, metadata: { ...managed.metadata, configurationSchema: { properties: { tier: { ...tier, readOnly: true } } } } };
		const result = createPicker({ models: [readOnly, ...models], selectedModelId: models[0].identifier });
		await result.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
		result.picker.show(result.anchor, result.context);
		const rows = searchFusionRows(result.popup, 'Fusion');
		const disabled = rows.map(row => row.classList.contains('option-disabled'));
		rows[0].click();
		await timeout(0);
		assert.deepStrictEqual({ disabled, selections: result.selections, saved: result.values.get(readOnly.identifier) }, {
			disabled: [false, true],
			selections: [readOnly.identifier],
			saved: undefined,
		});
	});

	test('a pending inline Fusion tier save does not override a comparison started since', async () => {
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		const comparison: IModelPickerComparison = {
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: () => state.set({
				title: 'Attempts', description: 'Select models.', summary: '2 Attempts', selectedModelIds: [],
				multiple: true, maxSelections: 10, canGoBack: false, canGoNext: true, canFinish: false,
			}, undefined),
			cancel: () => state.set(undefined, undefined),
			reset: () => state.set(undefined, undefined),
			select: id => {
				const draft = state.get()!;
				state.set({ ...draft, selectedModelIds: [...draft.selectedModelIds, id] }, undefined);
			},
			setCount: () => { }, back: () => { }, next: () => { }, finish: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
		};
		const pending = new DeferredPromise<void>();
		const fusion = createFusionModel(false);
		const result = createPicker({ models: [fusion, ...models], comparison, beforeSave: () => pending.p });
		await result.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
		result.picker.show(result.anchor, result.context);
		searchFusionRows(result.popup, 'High')[0].click();
		element(result.popup, '[aria-label="Compare Models"]').click();
		searchFusionRows(result.popup, 'First');
		element(result.popup, '.chat-model-picker-model').click();
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ compared: state.get()?.selectedModelIds, selections: result.selections, visible: result.picker.isVisible, saved: result.values.get(fusion.identifier) }, {
			compared: ['copilot/First'],
			selections: [],
			visible: true,
			saved: { tier: 'intelligence' },
		});
	});

	test('inline Fusion marks its default tier as the organization default and keeps search results sorted', async () => {
		const fusion = createFusionModel(false);
		const hasDefaultBadge = (row: HTMLElement | undefined) => !!row?.querySelector('.chat-model-picker-org-default-badge');
		// With Fusion selected the list opens on its tiers; with another model selected, search reaches them.
		const onFusion = createPicker({ models: [fusion, ...models], policyDefault: 'auto', selectedModelId: fusion.identifier });
		await onFusion.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
		onFusion.picker.show(onFusion.anchor, onFusion.context);
		const list = { standard: hasDefaultBadge(renderedFusionRow(onFusion.popup, 'Standard')), high: hasDefaultBadge(renderedFusionRow(onFusion.popup, 'High')) };
		const onOther = createPicker({ models: [fusion, ...models], policyDefault: 'auto', selectedModelId: models[0].identifier, pinnedModelIds: ['copilot/Fixed'] });
		await onOther.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
		onOther.picker.show(onOther.anchor, onOther.context);
		const searchDefaults = searchFusionRows(onOther.popup, 'Fusion').filter(hasDefaultBadge).map(row => row.querySelector('.title')?.textContent);
		searchFusionRows(onOther.popup, 'F');
		const search = Array.from(onOther.popup.querySelectorAll<HTMLElement>('.monaco-list-row.action .title')).map(title => title.textContent);
		assert.deepStrictEqual({ list, searchDefaults, search }, {
			list: { standard: true, high: false },
			searchDefaults: ['Fusion Standard'],
			search: ['Fusion Standard', 'Fusion High', 'First', 'Fixed'],
		});
	});

	test('the inline presentation setting does not turn Auto into Fusion', async () => {
		const result = createPicker({ models: [createAutoModel(), ...models] });
		await result.configurationService.setUserConfiguration(ChatConfiguration.FusionModelPickerInlineTiers, true);
		result.picker.show(result.anchor, result.context);
		assert.strictEqual(result.popup.querySelectorAll('.chat-model-picker-fusion-tier').length, 0);
	});

	test('dialog-hosted details preserve the requested popup layer and below-anchor placement', () => {
		const result = createPicker({ inDialog: true, contextViewLayer: 1, details: models[0].identifier });
		const details = {
			layer: result.contextViewLayer,
			position: result.anchorPosition,
			model: result.popup.querySelector('.chat-model-card-name')?.textContent,
		};
		goBack(result.popup);
		assert.deepStrictEqual({
			details,
			list: { layer: result.contextViewLayer, position: result.anchorPosition },
			visible: result.picker.isVisible,
			selections: result.selections,
		}, {
			details: { layer: 1, position: AnchorPosition.BELOW, model: 'First' },
			list: { layer: 1, position: AnchorPosition.BELOW },
			visible: true,
			selections: [],
		});
	});

	for (const { placement, anchorTop, position } of [
		// Inline chat's input sits near the top of an editor, with little room above it.
		{ placement: 'near the top of the window', anchorTop: '40px', position: AnchorPosition.BELOW },
		{ placement: 'with too little room on either side', anchorTop: 'calc(50% - 11px)', position: AnchorPosition.ABOVE },
	]) {
		test(`the popup and its tabs fit beside an anchor ${placement} without covering it, on every tab`, () => {
			const local = model('Local');
			const result = createPicker({
				models: [...Array.from({ length: 40 }, (_, index) => model(`Model ${index}`)), {
					...local, identifier: 'ollama/local', metadata: { ...local.metadata, vendor: 'ollama' },
				}],
				anchorTop,
				cacheWarm: true,
			});
			const anchorBounds = result.anchor.getBoundingClientRect();
			const placed = () => {
				const space = result.anchorPosition === AnchorPosition.ABOVE ? anchorBounds.top : result.anchor.ownerDocument.defaultView!.innerHeight - anchorBounds.bottom;
				const height = element(result.popup, '.chat-model-picker-widget').getBoundingClientRect().height;
				return { position: result.anchorPosition, fits: height <= space, height };
			};
			const initial = placed();
			element(result.popup, '.chat-model-picker-tabbar [aria-label="Ollama"]').click();
			assert.deepStrictEqual({ initial, otherProvider: placed() }, {
				initial: { position, fits: true, height: initial.height },
				otherProvider: { position, fits: true, height: initial.height },
			});
		});
	}

	test('opens below at full height when only the tabs keep the popup from fitting above', () => {
		const natural = createPicker({ cacheWarm: true });
		const height = element(natural.popup, '.chat-model-picker-widget').getBoundingClientRect().height;
		const tabBarHeight = element(natural.popup, '.chat-model-picker-tabbar').getBoundingClientRect().height;
		natural.dismiss();
		// Above, there is room for the list and its banner but not for all of the tabs.
		const result = createPicker({ cacheWarm: true, anchorTop: `${height - tabBarHeight / 2}px` });
		assert.deepStrictEqual({
			position: result.anchorPosition,
			height: element(result.popup, '.chat-model-picker-widget').getBoundingClientRect().height,
		}, { position: AnchorPosition.BELOW, height });
	});

	function defaultBadgeModels(popup: HTMLElement): string[] {
		return Array.from(popup.querySelectorAll('.chat-model-picker-org-default-badge:not([hidden])'), badge => {
			const name = badge.closest('.monaco-list-row')?.querySelector('.title')?.textContent;
			assert.ok(name);
			return name;
		});
	}

	function selectedModels(popup: HTMLElement): string[] {
		return Array.from(popup.querySelectorAll('.chat-model-picker-model[aria-checked="true"] .title'), title => title.textContent!);
	}

	test('guided selection keeps the popup open, preserves configuration edits, excludes routing, and exposes accessible navigation', async () => {
		const attempts: IModelPickerComparisonState = {
			title: 'Attempts', description: 'Select models.', summary: '2 Attempts', selectedModelIds: [],
			multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false, hasNextStep: true,
		};
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		let finished = false;
		const comparison: IModelPickerComparison = {
			showPickerHint: constObservable(true),
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: () => state.set(attempts, undefined),
			cancel: () => state.set(undefined, undefined),
			reset: () => state.set(undefined, undefined),
			select: id => state.set({ ...state.get()!, selectedModelIds: [id], canGoNext: state.get()!.hasNextStep !== false, canFinish: true, status: { text: '1 selected' } }, undefined),
			setCount: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
			back: () => state.set(attempts, undefined),
			next: () => {
				const toSynthesizer = state.get()?.title === 'Judge';
				state.set({ ...attempts, title: toSynthesizer ? 'Synthesizer' : 'Judge', description: 'Optional review.', multiple: false, canGoBack: true, canFinish: true, hasNextStep: !toSynthesizer }, undefined);
			},
			finish: () => finished = true,
		};
		const promotional = { ...models[0], metadata: { ...models[0].metadata, promo: { id: 'offer', discountPercent: 25, message: 'Temporary offer.' } } };
		const { popup, picker, selections, values } = createPicker({ models: [createAutoModel(), createHydraFusionModel(), promotional, ...models.slice(1)], comparison });
		const hides: boolean[] = [];
		disposables.add(picker.onDidHide(event => hides.push(event.finishedComparison)));
		const searchAction = element(popup, '[data-id="search"]');
		assert.deepStrictEqual({
			actions: [...popup.querySelectorAll<HTMLElement>('.tabbed-action-list-tabbar > .tabbed-action-list-tabbar-action')].map(action => action.dataset.id),
			comparison: popup.querySelector('[data-id="comparison"]')?.getAttribute('aria-pressed'),
			footer: element(popup, '.tabbed-action-list-footer .monaco-button').getAttribute('aria-label'),
			search: {
				ariaLabel: searchAction.getAttribute('aria-label'),
				htmlTitle: searchAction.getAttribute('title'),
			},
		}, {
			actions: ['comparison', 'search'],
			comparison: 'false',
			footer: 'Send Query to Multiple Models',
			search: {
				ariaLabel: 'Search Models',
				htmlTitle: 'Search Models',
			},
		});
		element(popup, '.tabbed-action-list-footer .monaco-button').click();
		const footerButtons = () => [...popup.querySelectorAll<HTMLElement>('.model-picker-comparison-actions .monaco-button')].filter(button => button.style.display !== 'none');
		/** Each footer button's label, with `(disabled)` when it is shown but cannot be used. */
		const buttons = () => footerButtons().map(button => `${button.getAttribute('aria-label') ?? button.textContent?.trim()}${button.classList.contains('disabled') ? ' (disabled)' : ''}`);
		const button = (label: string) => {
			const match = footerButtons().find(candidate => (candidate.getAttribute('aria-label') ?? candidate.textContent?.trim()) === label);
			assert.ok(match, label);
			return match;
		};
		const footerStatus = () => popup.querySelector('.model-picker-comparison-status')?.textContent;
		// Counted from the set size, since a short popup may scroll some choices out of view.
		const offered = (role: string) => Number(popup.querySelector(`[role="${role}"]`)?.getAttribute('aria-setsize') ?? 0);
		const firstRow = element(popup, '.chat-model-picker-model');
		assert.deepStrictEqual({
			heading: popup.querySelector('.action-list-header-text')?.textContent,
			comparisonScope: element(popup, '.action-widget').classList.contains('model-picker-comparison'),
			routing: listRows(popup).some(label => label === 'Auto' || label === 'HydraFusion'),
			checks: offered('menuitemcheckbox'),
			checkboxes: popup.querySelectorAll('.chat-model-picker-comparison-checkbox').length,
			buttons: buttons(),
			status: footerStatus(),
			badge: firstRow.querySelector('.action-item-badge')?.textContent,
			configuration: firstRow.querySelector('.action-list-item-toolbar .action-label')?.textContent,
			details: firstRow.querySelector('.action-list-item-toolbar .action-label')?.getAttribute('aria-label'),
			accessible: firstRow.getAttribute('aria-label'),
			hover: firstRow.getAttribute('title'),
		}, {
			heading: 'Select models.', comparisonScope: true, routing: false, checks: 3, checkboxes: 3, buttons: ['Done (disabled)', 'Next (disabled)'], status: '',
			badge: '25% off', configuration: 'Low · 32K', details: 'First Details, Low · 32K',
			accessible: 'First, 25% off, Effort Level: Low, Context: 32K',
			hover: 'First · Low · 32K',
		});
		button('Done').click();
		assert.deepStrictEqual({ finished, visible: picker.isVisible }, { finished: false, visible: true }, 'disabled Done does nothing');
		openDetails(popup, 'First');
		element(popup, '.chat-model-card [aria-label="Effort Level"] [role="radio"]:last-child').click();
		await timeout(0);
		assert.deepStrictEqual({
			step: state.get()?.title,
			comparisonModels: state.get()?.selectedModelIds,
			configuration: values.get(promotional.identifier),
			selections,
			visible: picker.isVisible,
		}, {
			step: 'Attempts', comparisonModels: [], configuration: { effort: 'high' }, selections: [], visible: true,
		});
		goBack(popup);
		const list = element(popup, '.monaco-list');
		list.focus();
		list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		assert.deepStrictEqual({
			visible: picker.isVisible, selected: selectedModels(popup).length, selections,
			checked: popup.querySelectorAll('.chat-model-picker-comparison-checked .chat-model-picker-comparison-checkbox.checked').length,
			count: popup.querySelector('select'),
			buttons: buttons(),
			status: footerStatus(),
		}, { visible: true, selected: 1, selections: [], checked: 1, count: null, buttons: ['Done', 'Next'], status: '1 selected' });
		button('Next').click();
		assert.deepStrictEqual({
			heading: popup.querySelector('.action-list-header-text')?.textContent,
			buttons: buttons(),
			radios: offered('menuitemradio'),
			checkboxes: popup.querySelectorAll('[role="menuitemcheckbox"], .chat-model-picker-comparison-checkbox').length,
		}, { heading: 'Optional review.', buttons: ['Back', 'Done', 'Next (disabled)'], radios: 3, checkboxes: 0 });
		element(popup, '.chat-model-picker-model').click();
		const judgeWithChoice = buttons();
		button('Next').click();
		assert.deepStrictEqual({
			judgeWithChoice,
			heading: popup.querySelector('.action-list-header-text')?.textContent,
			radios: offered('menuitemradio'),
			buttons: buttons(),
		}, { judgeWithChoice: ['Back', 'Done', 'Next'], heading: 'Optional review.', radios: 3, buttons: ['Back', 'Done'] });
		button('Back').click();
		assert.strictEqual(popup.querySelector('.action-list-header-text')?.textContent, 'Select models.');
		element(popup, '.chat-model-picker-model').click();
		button('Next').click();
		button('Done').click();
		assert.deepStrictEqual({ finished, visible: picker.isVisible, selections, hides }, { finished: true, visible: false, selections: [], hides: [true] });
	});

	test('model management retains its Add Models label and plus icon', () => {
		const { popup } = createPicker({ showManageModels: true });
		const action = element(popup, '[data-id="addProvider"]');
		assert.deepStrictEqual({
			label: action.getAttribute('aria-label'),
			addIcon: !!action.querySelector('.codicon-add'),
			comparisonFooter: !!popup.querySelector('.tabbed-action-list-footer'),
		}, { label: 'Add Models...', addIcon: true, comparisonFooter: false });
	});

	test('comparison footer shows the configured shortcut and the shortcut opens Attempts without selecting a model', () => {
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		const comparison: IModelPickerComparison = {
			showPickerHint: constObservable(true),
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models', startCommandId: 'test.compareModels',
			start: () => state.set({
				title: 'Attempts', description: 'Select models.', summary: '', selectedModelIds: [],
				multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false,
			}, undefined),
			cancel: () => state.set(undefined, undefined),
			reset: () => state.set(undefined, undefined),
			select: () => { }, back: () => { }, next: () => { }, finish: () => { }, setCount: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
		};
		const shortcut = KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM;
		const { picker, popup, selections } = createPicker({ comparison, comparisonKeybinding: shortcut });
		const label = element(popup, '.tabbed-action-list-footer .monaco-button').textContent;
		picker.openWithFilter({ startComparison: true });
		assert.deepStrictEqual({
			label,
			step: state.get()?.title,
			selections,
			visible: picker.isVisible,
			footer: popup.querySelector('.model-picker-comparison-actions') !== null,
			toggle: popup.querySelector('[aria-label="Compare Models"][aria-pressed="true"]') !== null,
		}, {
			label: `Send Query to Multiple Models (${new MockKeybindingService().resolveKeybinding(decodeKeybinding(shortcut, OS)!)[0].getLabel()})`,
			step: 'Attempts', selections: [], visible: true, footer: true, toggle: true,
		});
	});

	for (const showHint of [undefined, false, true]) {
		test(`comparison discovery footer is opt-in (${showHint}) and preserves the comparison toggle`, () => {
			const comparison: IModelPickerComparison = {
				available: constObservable(true), summary: constObservable(undefined), state: constObservable(undefined), label: 'Compare Models',
				showPickerHint: showHint === undefined ? undefined : constObservable(showHint),
				start: () => { }, cancel: () => { }, reset: () => { }, select: () => { },
				setCount: () => { }, back: () => { }, next: () => { }, finish: () => { },
				getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
			};
			const { popup } = createPicker({ comparison });
			assert.deepStrictEqual({
				hint: !!popup.querySelector('.tabbed-action-list-footer'),
				toggle: !!popup.querySelector('[aria-label="Compare Models"] .codicon-layers'),
			}, { hint: showHint === true, toggle: true });
		});
	}

	for (const anchorTop of ['50.5px', '400.5px', undefined]) {
		test(`comparison preserves the normal list viewport and stays anchored after reopening (${anchorTop ?? 'bottom'})`, () => {
			const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
			const summary = observableValue<string | undefined>('summary', undefined);
			const comparison: IModelPickerComparison = {
				available: constObservable(true), summary, state, label: 'Compare Models',
				start: () => state.set({
					title: 'Attempts', description: 'Select two or more models to run one prompt in parallel and compare their responses side by side.',
					summary: '', selectedModelIds: [], multiple: true, maxSelections: 10,
					canGoBack: false, canGoNext: false, canFinish: true,
				}, undefined),
				cancel: () => state.set(undefined, undefined), reset: () => state.set(undefined, undefined),
				select: () => { }, setCount: () => { }, back: () => { }, next: () => { },
				finish: () => summary.set('2 Attempts', undefined),
				getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
			};
			const { picker, popup, anchor, context } = createPicker({
				comparison, realContextView: true, anchorTop,
				models: [...models, ...Array.from({ length: 25 }, (_, index) => model(`Other-${index}`))],
				comparisonModels: anchorTop === '400.5px'
					? [...models, ...Array.from({ length: 50 }, (_, index) => model(`Other-${index}`))]
					: undefined,
				controlModels: { First: { label: 'First', exists: true, featured: true }, Second: { label: 'Second', exists: true, featured: true } },
			});
			const listHeight = () => element(popup, '.monaco-list').offsetHeight;
			const initialRows = listHeight();
			const initialModels = listRows(popup);
			element(popup, '[aria-label="Compare Models"]').click();
			const bounds = () => element(popup, '.chat-model-picker-widget').getBoundingClientRect();
			const first = bounds();
			const firstRows = listHeight();
			if (!context.comparisonModels) {
				assert.deepStrictEqual(listRows(popup), initialModels);
			}
			element(popup, '[aria-label="Compare Models"]').click();
			assert.deepStrictEqual({ rows: listRows(popup), height: listHeight() }, { rows: initialModels, height: initialRows });
			element(popup, '[aria-label="Compare Models"]').click();
			element(popup, '.model-picker-comparison-done').click();
			anchor.style.width = '38px';
			picker.show(anchor, context);
			const reopened = bounds();
			assert.deepStrictEqual({
				sameListViewport: firstRows === initialRows,
				withinViewportCap: firstRows <= Math.floor(dom.getWindow(popup).innerHeight * 0.6),
				stableHeight: reopened.height === first.height,
				stableRows: listHeight() === firstRows,
				aligned: reopened.left === anchor.getBoundingClientRect().left,
				besideAnchor: reopened.bottom <= anchor.getBoundingClientRect().top || reopened.top >= anchor.getBoundingClientRect().bottom,
				fitsWindow: reopened.top >= 0 && reopened.bottom <= dom.getWindow(popup).innerHeight,
			}, { sameListViewport: true, withinViewportCap: true, stableHeight: true, stableRows: true, aligned: true, besideAnchor: true, fitsWindow: true });
		});
	}

	test('comparison shows every harness tab and selects attempts, judge, and synthesizer across them', () => {
		const copilot = models[0];
		const claude = harnessModel('claude', 'Claude Choice');
		const codex = harnessModel('codex', 'Codex Choice');
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		type ComparisonStepTitle = 'Attempts' | 'Judge' | 'Synthesizer';
		let step: ComparisonStepTitle = 'Attempts';
		const selections: Partial<Record<ComparisonStepTitle, string[]>> = {};
		const update = () => state.set({
			title: step,
			description: `Select ${step.toLowerCase()}.`,
			summary: 'Comparison',
			selectedModelIds: selections[step] ?? [],
			multiple: step === 'Attempts',
			maxSelections: step === 'Attempts' ? 10 : 1,
			canGoBack: step !== 'Attempts',
			canGoNext: step !== 'Synthesizer' && (selections[step]?.length ?? 0) > 0,
			canFinish: true,
			hasNextStep: step !== 'Synthesizer',
		}, undefined);
		const comparison: IModelPickerComparison = {
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: update,
			cancel: () => state.set(undefined, undefined),
			reset: () => state.set(undefined, undefined),
			select: id => {
				const current = selections[step] ?? [];
				selections[step] = step === 'Attempts'
					? current.includes(id) ? current.filter(candidate => candidate !== id) : [...current, id]
					: current[0] === id ? [] : [id];
				update();
			},
			setCount: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
			back: () => {
				step = step === 'Synthesizer' ? 'Judge' : 'Attempts';
				update();
			},
			next: () => {
				step = step === 'Attempts' ? 'Judge' : 'Synthesizer';
				update();
			},
			finish: () => { },
		};
		const { popup } = createPicker({
			models,
			comparisonModels: [...models, claude, codex],
			comparison,
		});
		const tabs = () => Array.from(popup.querySelectorAll('.chat-model-picker-tabbar [role="radio"]'), tab => tab.getAttribute('aria-label'));
		const select = (tab: string, modelLabel: string) => {
			const tabElement = element(popup, `.chat-model-picker-tabbar [aria-label="${tab}"]`);
			if (tabElement.getAttribute('aria-checked') !== 'true') {
				tabElement.click();
			}
			const row = Array.from(popup.querySelectorAll<HTMLElement>('.chat-model-picker-model')).find(candidate => candidate.querySelector('.title')?.textContent === modelLabel);
			assert.ok(row, modelLabel);
			row.click();
		};
		const before = tabs();
		element(popup, '[aria-label="Compare Models"]').click();
		const comparing = tabs();
		select('Claude', 'Claude Choice');
		select('Copilot', 'First');
		element(popup, '.model-picker-comparison-next').click();
		select('Codex', 'Codex Choice');
		element(popup, '.model-picker-comparison-next').click();
		select('Claude', 'Claude Choice');
		assert.deepStrictEqual({ before, comparing, selections }, {
			before: ['Copilot'],
			comparing: ['Copilot', 'Claude', 'Codex'],
			selections: {
				Attempts: [claude.identifier, copilot.identifier],
				Judge: [codex.identifier],
				Synthesizer: [claude.identifier],
			},
		});
	});

	test('checking a compare-mode model updates the rows in place instead of showing the list again', async () => {
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		const comparison: IModelPickerComparison = {
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: () => state.set({
				title: 'Attempts', description: 'Select models.', summary: '', selectedModelIds: [],
				multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false, hasNextStep: true,
			}, undefined),
			cancel: () => state.set(undefined, undefined),
			reset: () => state.set(undefined, undefined),
			select: id => {
				const current = state.get()!;
				const ids = current.selectedModelIds.includes(id) ? current.selectedModelIds.filter(existing => existing !== id) : [...current.selectedModelIds, id];
				state.set({ ...current, selectedModelIds: ids, status: { text: `${ids.length} selected` } }, undefined);
			},
			setCount: () => { }, back: () => { }, next: () => { }, finish: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
		};
		const { popup } = createPicker({ comparison });
		element(popup, '[aria-label="Compare Models"]').click();
		// Showing the picker again would replace the list, revealing the checked row at the top.
		const list = element(popup, '.monaco-list');
		element(popup, '.chat-model-picker-model').click();
		await timeout(0);
		assert.deepStrictEqual({
			sameList: popup.querySelector('.monaco-list') === list,
			checked: [...popup.querySelectorAll('.chat-model-picker-comparison-checked .title')].map(title => title.textContent),
			focused: popup.querySelector('.monaco-list-row.focused .title')?.textContent,
			status: popup.querySelector('.model-picker-comparison-status')?.textContent,
		}, { sameList: true, checked: ['First'], focused: 'First', status: '1 selected' });
	});

	test('a compare-mode row reuses the model Details flyout for reasoning effort without disturbing checkbox selection or the single-model path', async () => {
		const attempts: IModelPickerComparisonState = {
			title: 'Attempts', description: 'Select models.', summary: '', selectedModelIds: [],
			multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false, hasNextStep: true,
		};
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		const selectedIds: string[] = [];
		const comparison: IModelPickerComparison = {
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: () => state.set(attempts, undefined),
			cancel: () => state.set(undefined, undefined),
			reset: () => state.set(undefined, undefined),
			select: id => {
				selectedIds.push(id);
				const current = state.get()!;
				const ids = current.selectedModelIds.includes(id) ? current.selectedModelIds.filter(existing => existing !== id) : [...current.selectedModelIds, id];
				state.set({ ...current, selectedModelIds: ids, canFinish: ids.length >= 2 }, undefined);
			},
			setCount: () => { }, back: () => { }, next: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
			finish: () => { },
		};
		const result = createPicker({ models: [createAutoModel(), createHydraFusionModel(), ...models], comparison });
		element(result.popup, '[aria-label="Compare Models"]').click();
		// Check the first row ("First").
		element(result.popup, '.chat-model-picker-model').click();
		assert.deepStrictEqual(selectedModels(result.popup), ['First']);
		// Open Details for a different, unchecked row and change its reasoning effort.
		openDetails(result.popup, 'Second');
		element(result.popup, '.chat-model-card [role="radiogroup"] [role="radio"]:last-child').click();
		await timeout(0);
		assert.deepStrictEqual({
			savedEffort: result.values.get(models[1].identifier),
			// The single-model select path must never fire while a comparison is active.
			singleModelSelections: result.selections,
		}, {
			savedEffort: { effort: 'high' },
			singleModelSelections: [],
		});
		goBack(result.popup);
		assert.deepStrictEqual({
			// "First" is still the only checked row; visiting "Second"'s Details did not check it.
			checked: selectedModels(result.popup),
			// comparison.select was called only for the checkbox click, not for the Details save.
			comparisonSelections: selectedIds,
		}, {
			checked: ['First'],
			comparisonSelections: ['copilot/First'],
		});
	});

	test('compare-mode Details use the destination model schema instead of an unsupported active-harness tier', () => {
		const codexModel = harnessModel('codex', 'GPT-6.1 Sol');
		const destinationModel: ILanguageModelChatMetadataAndIdentifier = {
			...codexModel,
			metadata: {
				...codexModel.metadata,
				configurationSchema: {
					properties: {
						thinkingLevel: {
							type: 'string', group: 'navigation', title: 'Effort Level',
							enum: ['medium', 'high'], enumItemLabels: ['Medium', 'High'], default: 'medium',
						},
						contextSize: { type: 'number', group: 'tokens', enum: [272000, 922000], default: 272000 },
					},
				},
			},
		};
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		const comparison: IModelPickerComparison = {
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: () => state.set({
				title: 'Attempts', description: 'Select models.', summary: '', selectedModelIds: [],
				multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false, hasNextStep: true,
			}, undefined),
			cancel: () => state.set(undefined, undefined), reset: () => state.set(undefined, undefined),
			select: () => { }, setCount: () => { }, back: () => { }, next: () => { }, finish: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
		};
		const access: IModelConfigurationAccess = {
			getModelConfiguration: () => ({ tier: 'priority', thinkingLevel: 'medium', contextSize: 272000 }),
			getModelConfigurationSchema: () => ({
				properties: {
					tier: {
						type: 'string', group: 'navigation', title: 'Service Tier',
						enum: ['standard', 'priority'], enumItemLabels: ['Standard', 'Priority'], default: 'standard',
					},
					thinkingLevel: {
						type: 'string', group: 'navigation', title: 'Effort Level',
						enum: ['medium', 'high'], enumItemLabels: ['Medium', 'High'], default: 'medium',
					},
					contextSize: { type: 'number', group: 'tokens', enum: [272000, 922000], default: 272000 },
				},
			}),
			getModelConfigurationActions: () => [],
			setModelConfiguration: async () => { },
		};
		const { popup } = createPicker({ models: [destinationModel], comparison, access });

		element(popup, '[aria-label="Compare Models"]').click();
		openDetails(popup, 'GPT-6.1 Sol');
		const controls = Array.from(popup.querySelectorAll('.chat-model-card [role="radio"]'), control => ({
			label: control.textContent?.trim(),
			checked: control.getAttribute('aria-checked'),
		}));

		assert.deepStrictEqual(controls, [
			{ label: 'Medium', checked: 'true' },
			{ label: 'High', checked: 'false' },
			{ label: '272K', checked: 'true' },
			{ label: '1M', checked: 'false' },
		]);
	});

	test('Details still select their model while comparing is available but not started', async () => {
		const comparison: IModelPickerComparison = {
			available: constObservable(true), summary: constObservable(undefined), label: 'Compare Models',
			state: observableValue<IModelPickerComparisonState | undefined>('comparison', undefined),
			start: () => { }, cancel: () => { }, reset: () => { }, select: () => { },
			setCount: () => { }, back: () => { }, next: () => { }, finish: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
			reconcileVariants: () => assert.fail('Ordinary Details must not reconcile an inactive comparison draft'),
		};
		const result = createPicker({ comparison });
		openDetails(result.popup, 'Second');
		element(result.popup, '.chat-model-card [role="radiogroup"] [role="radio"]:last-child').click();
		await timeout(0);
		assert.deepStrictEqual({ selections: result.selections, values: result.values.get(models[1].identifier) }, {
			selections: [models[1].identifier], values: { effort: 'high' },
		});
	});

	test('changing a compared model\'s effort refreshes its row without measuring the popup again', async () => {
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		const comparison: IModelPickerComparison = {
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: () => state.set({
				title: 'Attempts', description: 'Select models.', summary: '', selectedModelIds: [],
				multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false, hasNextStep: true,
			}, undefined),
			cancel: () => state.set(undefined, undefined), reset: () => state.set(undefined, undefined),
			select: id => state.set({ ...state.get()!, selectedModelIds: [id], status: { text: '1 selected' } }, undefined),
			setCount: () => { }, back: () => { }, next: () => { }, finish: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
		};
		const { popup, picker } = createPicker({ comparison });
		element(popup, '[aria-label="Compare Models"]').click();
		element(popup, '.chat-model-picker-model').click();
		await timeout(0);
		openDetails(popup, 'First');
		// Measuring the list again once Details closes resizes the popup, which can push it beside its anchor.
		const refreshes = sinon.spy(TabbedActionListWidget.prototype, 'refreshActiveList');
		try {
			element(popup, '.chat-model-card [role="radiogroup"] [role="radio"]:last-child').click();
			await timeout(0);
			// Saving a model's configuration can also update the model list.
			picker.refresh(models);
		} finally {
			refreshes.restore();
		}
		goBack(popup);
		assert.deepStrictEqual({
			refreshed: refreshes.called,
			measuredAgain: refreshes.args.some(([options]) => !options?.preserveSize),
			summary: popup.querySelector('.chat-model-picker-comparison-checked .action-list-item-toolbar .action-label')?.textContent,
		}, { refreshed: true, measuredAgain: false, summary: 'High · 32K' });
	});

	test('a checked compare-mode row reconciles effort variants and renders a keyboard-native remove control', async () => {
		const attempts: IModelPickerComparisonState = {
			title: 'Attempts', description: 'Select models.', summary: '', selectedModelIds: [],
			multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false, hasNextStep: true,
		};
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		const variantsByModel = new Map<string, { configuration: Record<string, string | number | boolean | null>; label: string }[]>();
		const baseConfigurations = new Map<string, Readonly<Record<string, string | number | boolean | null>>>();
		const configurationsEqual = (
			left: Readonly<Record<string, string | number | boolean | null>>,
			right: Readonly<Record<string, string | number | boolean | null>>,
		) => Object.keys(left).length === Object.keys(right).length && Object.keys(left).every(key => left[key] === right[key]);
		const comparison: IModelPickerComparison = {
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: () => state.set(attempts, undefined),
			cancel: () => state.set(undefined, undefined),
			reset: () => state.set(undefined, undefined),
			select: id => {
				const current = state.get()!;
				const ids = current.selectedModelIds.includes(id) ? current.selectedModelIds.filter(existing => existing !== id) : [...current.selectedModelIds, id];
				state.set({ ...current, selectedModelIds: ids, canFinish: ids.length >= 2, status: { text: `${ids.length} selected` } }, undefined);
			},
			setCount: () => { }, back: () => { }, next: () => { },
			finish: () => { },
			getVariants: modelId => variantsByModel.get(modelId) ?? [],
			addVariant: (modelId, configuration, label, baseConfiguration) => {
				if (baseConfiguration) {
					baseConfigurations.set(modelId, baseConfiguration);
				}
				const existing = variantsByModel.get(modelId) ?? [];
				if (!existing.some(variant => configurationsEqual(variant.configuration, configuration)) && (!baseConfiguration || !configurationsEqual(baseConfiguration, configuration))) {
					variantsByModel.set(modelId, [...existing, { configuration, label }]);
				}
			},
			removeVariant: (modelId, index) => {
				variantsByModel.set(modelId, (variantsByModel.get(modelId) ?? []).filter((_, candidate) => candidate !== index));
			},
			reconcileVariants: (modelId, baseConfiguration) => {
				baseConfigurations.set(modelId, baseConfiguration);
				variantsByModel.set(modelId, (variantsByModel.get(modelId) ?? []).filter(variant => !configurationsEqual(variant.configuration, baseConfiguration)));
			},
		};
		const result = createPicker({ comparison });
		const addableLabels = () => Array.from(result.popup.querySelectorAll('.chat-model-card-comparison-variant-chip.addable'), chip => chip.textContent?.trim());
		const addedLabels = () => Array.from(result.popup.querySelectorAll('.chat-model-card-comparison-variant-chip.added'), chip => chip.textContent?.trim());
		const rowBadge = () => element(result.popup, '.chat-model-picker-model').querySelector('.action-label')?.textContent;

		element(result.popup, '[aria-label="Compare Models"]').click();
		// Check "First" (default effort is Low, from its schema default).
		element(result.popup, '.chat-model-picker-model').click();
		openDetails(result.popup, 'First');
		const beforeAdd = { addable: addableLabels(), added: addedLabels() };

		element(result.popup, '.chat-model-card-comparison-variant-chip.addable').click();
		const afterAdd = { addable: addableLabels(), added: addedLabels(), stored: comparison.getVariants('copilot/First') };
		const firstRemove = element(result.popup, '.chat-model-card-comparison-variant-remove') as HTMLButtonElement;
		const removeControl = { tagName: firstRemove.tagName, type: firstRemove.type };
		goBack(result.popup);
		const badgeAfterAdd = rowBadge();

		openDetails(result.popup, 'First');
		element(result.popup, '.chat-model-card [role="radiogroup"] [role="radio"]:last-child').click();
		await timeout(0);
		const afterBaseChange = { addable: addableLabels(), added: addedLabels(), stored: comparison.getVariants('copilot/First') };
		element(result.popup, '.chat-model-card-comparison-variant-chip.addable').click();
		(element(result.popup, '.chat-model-card-comparison-variant-remove') as HTMLButtonElement).click();
		const afterRemove = { addable: addableLabels(), added: addedLabels(), stored: comparison.getVariants('copilot/First') };
		goBack(result.popup);

		assert.deepStrictEqual({ beforeAdd, afterAdd, removeControl, badgeAfterAdd, afterBaseChange, afterRemove, badgeAfterRemove: rowBadge() }, {
			beforeAdd: { addable: ['High'], added: [] },
			afterAdd: { addable: [], added: ['High'], stored: [{ configuration: { effort: 'high' }, label: 'High' }] },
			removeControl: { tagName: 'BUTTON', type: 'button' },
			badgeAfterAdd: 'Low · 32K +1',
			afterBaseChange: { addable: ['Low'], added: [], stored: [] },
			afterRemove: { addable: ['Low'], added: [], stored: [] },
			badgeAfterRemove: 'High · 32K',
		});
	});
	for (const committed of [false, true]) {
		for (const dismissal of ['Escape', 'click-away'] as const) {
			test(`${dismissal} cancels working selections without changing ${committed ? 'committed comparison' : 'single-model'} state`, () => {
				const state = observableValue<IModelPickerComparisonState | undefined>('draft', undefined);
				const summary = constObservable(committed ? '2 Attempts' : undefined);
				let cancelled = 0;
				const comparison: IModelPickerComparison = {
					available: constObservable(true), summary, state, label: 'Compare Models',
					start: () => state.set({
						title: 'Attempts', description: 'Select models.', summary: '2 Attempts', selectedModelIds: committed ? [models[0].identifier] : [],
						multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false,
					}, undefined),
					cancel: () => { cancelled++; state.set(undefined, undefined); },
					reset: () => assert.fail('Dismissal must not reset committed state'),
					select: id => state.set({ ...state.get()!, selectedModelIds: [id] }, undefined),
					back: () => { }, next: () => { }, setCount: () => { },
					getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
					finish: () => assert.fail('Dismissal must not commit'),
				};
				const { picker, popup, anchor, context, dismiss, selections } = createPicker({ comparison });
				if (!committed) {
					element(popup, '[aria-label="Compare Models"]').click();
				}
				element(popup, '.chat-model-picker-model').click();
				if (dismissal === 'Escape') {
					element(popup, '.monaco-list').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
				} else {
					dismiss();
				}
				const closed = { visible: picker.isVisible, state: state.get(), cancelled, selections, summary: comparison.summary.get() };
				picker.show(anchor, context);
				assert.deepStrictEqual({
					closed, reopened: state.get()?.selectedModelIds,
				}, {
					closed: { visible: false, state: undefined, cancelled: 1, selections: [], summary: committed ? '2 Attempts' : undefined },
					reopened: committed ? [models[0].identifier] : undefined,
				});
			});
		}
	}

	/** The active list's rows, with separators prefixed by `--` and followed by their heading. */
	function listRows(popup: HTMLElement): string[] {
		return Array.from(popup.querySelectorAll('.chat-model-picker-tabbed .monaco-list-row'), row => row.classList.contains('separator')
			? `--${row.textContent ?? ''}`
			: row.querySelector('.title')?.textContent ?? '');
	}

	for (const clickSelection of [false, true]) {
		test(`comparison selections preserve typed search text and focused model with ${clickSelection ? 'mouse' : 'keyboard'} selection`, () => {
			const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
			const comparison: IModelPickerComparison = {
				available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
				start: () => state.set({
					title: 'Attempts', description: 'Select models.', summary: '2 Attempts', selectedModelIds: [],
					multiple: true, maxSelections: 10, canGoBack: false, canGoNext: true, canFinish: false,
				}, undefined),
				cancel: () => state.set(undefined, undefined),
				reset: () => state.set(undefined, undefined),
				select: id => {
					const draft = state.get()!;
					state.set({ ...draft, selectedModelIds: draft.selectedModelIds.includes(id) ? draft.selectedModelIds.filter(selected => selected !== id) : [...draft.selectedModelIds, id] }, undefined);
				},
				setCount: () => { }, back: () => { }, next: () => { }, finish: () => { },
				getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
			};
			const result = createPicker({ comparison });
			const { picker, popup } = result;
			element(popup, '[aria-label="Compare Models"]').click();
			element(popup, '[data-id="search"]').click();
			const filterInput = popup.querySelector<HTMLInputElement>('input')!;
			filterInput.value = 'Fi';
			filterInput.dispatchEvent(new InputEvent('input', { bubbles: true }));
			const snapshots = [undefined, 'ArrowDown', 'ArrowUp'].map(key => {
				const input = popup.querySelector<HTMLInputElement>('input')!;
				if (key) {
					input.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode: key === 'ArrowDown' ? 40 : 38, bubbles: true }));
				}
				if (clickSelection && !key) {
					element(popup, '.monaco-list-row.focused').click();
				} else {
					input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
				}
				return {
					filter: popup.querySelector<HTMLInputElement>('input')?.value,
					focused: popup.querySelector('.monaco-list-row.focused .title')?.textContent,
					selected: state.get()?.selectedModelIds,
				};
			});
			assert.deepStrictEqual(snapshots, [
				{ filter: 'Fi', focused: 'First', selected: [models[0].identifier] },
				{ filter: 'Fi', focused: 'Fixed', selected: [models[0].identifier, models[2].identifier] },
				{ filter: 'Fi', focused: 'First', selected: [models[2].identifier] },
			]);
			picker.hide();
			reopen(result);
			element(popup, '[aria-label="Compare Models"]').click();
			element(popup, '[data-id="search"]').click();
			assert.strictEqual(popup.querySelector<HTMLInputElement>('input')?.value, '');
		});
	}

	test('idempotent filtered opening focuses the exact row without selecting it', () => {
		const a = model('same');
		const b = { ...model('same'), identifier: 'codex/target', metadata: { ...a.metadata, vendor: 'codex', modelPickerGroup: { id: 'copilot', label: 'GitHub Copilot' } } };
		const { picker, popup, selections } = createPicker({ models: [a, b] });
		picker.openWithFilter({ initialFilterValue: 'same', initialFocusItemId: b.identifier });
		picker.openWithFilter({ initialFilterValue: 'same', initialFocusItemId: b.identifier });
		const input = popup.querySelector<HTMLInputElement>('input');
		assert.deepStrictEqual({ visible: picker.isVisible, query: input?.value, selections }, { visible: true, query: 'same', selections: [] });
		assert.ok(popup.querySelector('.monaco-list-row.focused'));
	});

	for (const initiallyAuto of [false, true]) {
		test(`provider changes retain the popup size when opened with ${initiallyAuto ? 'Auto' : 'a manual model'} selected`, () => {
			const older = model('example-5.5');
			const auto = createAutoModel();
			const local = model('Local');
			const { popup } = createPicker({
				models: [older, model('example-5.6'), auto, createHydraFusionModel(), {
					...local, identifier: 'ollama/local', metadata: { ...local.metadata, vendor: 'ollama' },
				}],
				selectedModelId: initiallyAuto ? auto.identifier : older.identifier,
			});
			const bounds = () => {
				const { width, height, x, y } = element(popup, '.chat-model-picker-widget').getBoundingClientRect();
				return { width, height, x, y };
			};
			const initial = bounds();
			const firstRow = listRows(popup)[0];
			element(popup, '.chat-model-picker-tabbar [aria-label="Ollama"]').click();
			const otherProvider = bounds();
			element(popup, '.chat-model-picker-tabbar [aria-label="Copilot"]').click();
			assert.deepStrictEqual({ measurable: initial.height > 0, firstRow, otherProvider, restored: bounds() }, {
				measurable: true, firstRow: 'Auto', otherProvider: initial, restored: initial,
			});
		});
	}

	test('remembers whether Other Models was expanded when the picker reopens', async () => {
		const older = model('example-5.5');
		const newer = model('example-5.6');
		const result = createPicker({ models: [older, newer], selectedModelId: newer.identifier });
		const toggleOtherModels = async () => {
			element(result.popup, '.chat-model-picker-section-toggle').click();
			await timeout(0);
		};
		const initial = listRows(result.popup);
		await toggleOtherModels();
		result.picker.hide();
		reopen(result);
		const reopenedExpanded = listRows(result.popup);
		await toggleOtherModels();
		result.picker.hide();
		reopen(result);
		assert.deepStrictEqual({ initial, reopenedExpanded, reopenedCollapsed: listRows(result.popup), selections: result.selections }, {
			initial: ['example-5.6', 'Other Models'],
			reopenedExpanded: ['example-5.6', 'Other Models', 'example-5.5'],
			reopenedCollapsed: ['example-5.6', 'Other Models'],
			selections: [],
		});
	});

	for (const target of ['list', 'search', 'details', 'detailsControl', 'back'] as const) {
		test(`Escape from ${target} closes the picker in one step`, () => {
			const { picker, popup, selections } = createPicker({ models: [...models, createAutoModel()] });
			let hidden = 0;
			disposables.add(picker.onDidHide(() => hidden++));
			if (target === 'search') {
				element(popup, '[data-id="search"]').click();
			} else if (target === 'details' || target === 'detailsControl' || target === 'back') {
				openDetails(popup, 'First');
			}
			const selectors = {
				list: '.monaco-list',
				search: 'input',
				details: '.tabbed-action-list-details',
				detailsControl: '.tabbed-action-list-details [role="radio"]',
				back: '[aria-label^="Back to Models"]',
			};
			const control = element(popup, selectors[target]);
			control.focus();
			control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			assert.deepStrictEqual({ visible: picker.isVisible, remainingContent: popup.childElementCount, hidden, selections }, {
				visible: false, remainingContent: 0, hidden: 1, selections: [],
			});
		});
	}

	for (const scenario of [
		{ name: 'no configured default', expected: [] },
		{ name: 'a personal default', userDefault: 'First', expected: [] },
		{ name: 'a blank policy', policyDefault: '  ', expected: [] },
		{ name: 'the selected managed default', policyDefault: '  First  ', expected: ['First'] },
		{ name: 'a per-chat override', policyDefault: 'Second', expected: ['Second'] },
		{ name: 'an unavailable managed default', policyDefault: 'Unavailable', expected: [] },
		{ name: 'Auto as the managed default', models: [createAutoModel(), ...models], policyDefault: 'auto', expected: ['Auto'], selected: ['Auto'] },
		{ name: 'Auto overriding the managed default', models: [createAutoModel(), ...models], policyDefault: 'First', expected: ['First'], selected: ['Auto'] },
		...[
			{ name: 'a host-only managed default', policyDefault: undefined, managedModel: true, expected: ['Second'] },
			{ name: 'a host default overriding local policy', policyDefault: 'First', managedModel: true, expected: ['Second'] },
			{ name: 'local policy when only host configuration is managed', policyDefault: 'First', managedModel: false, expected: ['First'] },
		].map(scenario => ({
			...scenario,
			selected: ['First'],
			models: models.map(candidate => candidate.metadata.name === 'Second'
				? { ...candidate, metadata: { ...candidate.metadata, managedModelDefaults: { model: scenario.managedModel, keys: ['reasoningEffort'] } } }
				: candidate),
		})),
		...[false, true].map(pinned => ({
			name: `an older managed default ${pinned ? 'pinned' : 'in the shortlist'}`,
			models: [model('example-5.5'), model('example-5.6')],
			policyDefault: 'example-5.5', selectedModelId: 'copilot/example-5.6',
			pinnedModelIds: pinned ? ['copilot/example-5.5'] : [],
			expected: ['example-5.5'], selected: ['example-5.6'],
		})),
	]) {
		test(`badges ${scenario.name} without changing the selection`, () => {
			const { popup, selections } = createPicker(scenario);
			assert.deepStrictEqual({
				defaults: defaultBadgeModels(popup),
				selected: selectedModels(popup),
				selections,
			}, { defaults: scenario.expected, selected: scenario.selected ?? ['First'], selections: [] });
		});
	}

	test('keeps the pill on the default when selection changes and refreshes open Details when policy changes', async () => {
		const { picker, popup, configurationService, selections } = createPicker({ policyDefault: 'First' });
		picker.setSelectedModel('copilot/Second');
		const overridden = defaultBadgeModels(popup);
		await configurationService.setUserConfiguration(ChatConfiguration.DefaultModel, 'Second');
		const change = upcastPartial<IConfigurationChangeEvent>({ affectsConfiguration: section => section === ChatConfiguration.DefaultModel });
		configurationService.onDidChangeConfigurationEmitter.fire(change);
		const changedPolicy = defaultBadgeModels(popup);
		openDetails(popup, 'Second');
		const explanation = popup.querySelector('.chat-model-card-org-default')?.textContent;
		configurationService.managed = false;
		configurationService.onDidChangeConfigurationEmitter.fire(change);
		const unmanagedDetails = popup.querySelector('.chat-model-card-org-default');
		const focusedControl = document.activeElement?.closest('[role="radiogroup"]')?.getAttribute('aria-label');
		goBack(popup);
		assert.deepStrictEqual({ overridden, changedPolicy, explanation, unmanagedDetails, focusedControl, unmanaged: defaultBadgeModels(popup), selections }, {
			overridden: ['First'], changedPolicy: ['Second'],
			explanation: 'Your organization sets Second as the default for new chats. You can choose another model for this chat.',
			unmanagedDetails: null, focusedControl: 'Effort Level', unmanaged: [], selections: [],
		});
	});

	test('refreshes the policy badge and the Auto row when models arrive or leave', () => {
		const { picker, popup, selections } = createPicker({ policyDefault: 'Late' });
		const state = () => ({ defaults: defaultBadgeModels(popup), auto: listRows(popup).includes('Auto') });
		const initial = state();
		picker.refresh([...models, model('Late'), createAutoModel()]);
		const added = state();
		picker.refresh(models);
		assert.deepStrictEqual({ initial, added, removed: state(), selections }, {
			initial: { defaults: [], auto: false },
			added: { defaults: ['Late'], auto: true },
			removed: { defaults: [], auto: false }, selections: [],
		});
	});

	for (const badge of ['25% off', 'Retiring', 'Copilot']) {
		test(`keeps ${badge} beside the organization-default pill`, () => {
			const first = model('First');
			const { popup } = createPicker({
				policyDefault: 'First',
				models: [{
					...first,
					metadata: {
						...first.metadata,
						promo: badge !== 'Copilot' ? { id: 'promo', discountPercent: 25, message: 'Discounted for a limited time.' } : undefined,
						warningText: badge === 'Retiring' ? { model_pending_deprecation: 'This model is retiring soon.' } : undefined,
					},
				}],
			});
			if (badge === 'Copilot') {
				element(popup, '[data-id="search"]').click();
			}
			const row = element(popup, '.chat-model-picker-org-default-badge').closest('.monaco-list-row')!;
			assert.deepStrictEqual({
				badges: Array.from(row.querySelectorAll('.action-item-badge'), badge => badge.textContent),
				configurationReadout: row.querySelector('.action-list-item-toolbar .action-label')?.textContent,
				accessible: row.getAttribute('aria-label')?.includes(`${badge}, Org default`),
				hover: row.getAttribute('title')?.includes('Your organization sets First as the default for new chats.'),
				configurationHover: row.getAttribute('title')?.includes('Low'),
			}, {
				badges: [badge, 'Org default'],
				configurationReadout: 'Low · 32K',
				accessible: true,
				hover: true,
				configurationHover: true,
			});
		});
	}

	test('badges a collapsed speed pair and names the actual organization-default variant in Details', () => {
		const { picker, popup, selections } = createPicker({
			policyDefault: 'example-2.5-fast',
			models: [models[0], model('example-2.5'), model('example-2.5-fast')],
		});
		const standard = defaultBadgeModels(popup);
		openDetails(popup, 'example-2.5');
		const explanation = popup.querySelector('.chat-model-card-org-default')?.textContent;
		goBack(popup);
		picker.setSelectedModel('copilot/example-2.5-fast');
		assert.deepStrictEqual({ standard, explanation, fast: defaultBadgeModels(popup), selections }, {
			standard: ['example-2.5'],
			explanation: 'Your organization sets example-2.5-fast as the default for new chats. You can choose another model for this chat.',
			fast: ['example-2.5-fast'],
			selections: [],
		});
	});

	/** The labels of the options in the open details' tier control: Auto's "Optimize for", or Fusion's "Effort Level". */
	function autoTiers(popup: HTMLElement): string[] {
		return Array.from(popup.querySelectorAll('.tabbed-action-list-details :is([role="radiogroup"][aria-label="Optimize for"], [role="radiogroup"][aria-label="Effort Level"]) [role="radio"]'), option => option.textContent ?? '');
	}

	function chooseOption(popup: HTMLElement, label: string): void {
		const option = Array.from(popup.querySelectorAll<HTMLElement>('.tabbed-action-list-details [role="radio"]')).find(option => option.textContent === label);
		assert.ok(option, label);
		option.click();
	}

	function selectRow(popup: HTMLElement, label: string): void {
		const row = Array.from(popup.querySelectorAll<HTMLElement>('.chat-model-picker-model')).find(row => row.querySelector('.title')?.textContent === label);
		assert.ok(row, label);
		row.click();
	}

	test('HydraFusion without an Auto to join is a plain entry of its own, without a description or flyout', () => {
		const auto = model('auto', false);
		const hydra = createHydraFusionModel();
		const result = createPicker({ models: [auto, hydra, ...models], selectedModelId: auto.identifier });
		const row = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-picker-model'))
			.find(row => row.querySelector('.title')?.textContent === 'HydraFusion');
		assert.ok(row);
		const snapshot = {
			leading: listRows(result.popup).slice(0, 2),
			detail: row.querySelector('.detail')?.textContent ?? '',
			ariaLabel: row.getAttribute('aria-label'),
			chevron: !!row.querySelector('.action-list-submenu-indicator.has-submenu'),
		};
		row.click();
		assert.deepStrictEqual({ ...snapshot, selections: result.selections }, {
			leading: ['auto', 'HydraFusion'],
			detail: '',
			ariaLabel: 'HydraFusion, Research preview',
			chevron: false,
			selections: [hydra.identifier],
		});
	});

	test('outside Fusion, HydraFusion is a model of its own beside Auto, with Default and Max as its tiers', async () => {
		const auto = createAutoModel();
		const hydra = createHydraFusionModel();
		const max = createHydraFusionMaxModel();
		const result = createPicker({ models: [...models, auto, hydra, max], selectedModelId: models[0].identifier });
		const hydraFusionRow = () => {
			const row = Array.from(result.popup.querySelectorAll('.chat-model-picker-model')).find(row => row.querySelector('.title')?.textContent === 'HydraFusion')!;
			return { checked: row.getAttribute('aria-checked'), readout: row.querySelector('.action-label')?.textContent };
		};
		const card = () => ({
			dialog: result.popup.querySelector('.tabbed-action-list-details')?.getAttribute('aria-label'),
			name: result.popup.querySelector('.tabbed-action-list-details .chat-model-card-name')?.textContent,
			description: result.popup.querySelector('.tabbed-action-list-details .chat-model-card > .chat-model-card-description')?.textContent,
			headings: Array.from(result.popup.querySelectorAll('.tabbed-action-list-details .chat-model-card-section-title'), heading => heading.textContent),
			options: Array.from(result.popup.querySelectorAll('.tabbed-action-list-details [role="radiogroup"][aria-label="HydraFusion tier"] [role="radio"]'), option => option.textContent),
			active: result.popup.querySelector('.tabbed-action-list-details [role="radio"][aria-checked="true"]')?.textContent,
		});
		const list = { rows: listRows(result.popup), hydraFusion: hydraFusionRow() };
		openDetails(result.popup, 'Auto');
		const autoOptions = autoTiers(result.popup);
		goBack(result.popup);
		openDetails(result.popup, 'HydraFusion');
		const opened = card();
		chooseOption(result.popup, 'Max');
		await timeout(0);
		const chosen = card();
		goBack(result.popup);
		const listWithMax = hydraFusionRow();
		// HydraFusion's row keeps standing for Max while another model is in use.
		selectRow(result.popup, 'First');
		reopen(result);
		const remembered = hydraFusionRow();
		assert.deepStrictEqual({ list, autoOptions, opened, chosen, listWithMax, remembered, selections: result.selections }, {
			list: { rows: ['Auto', 'HydraFusion', '--', 'First', 'Fixed', 'Second'], hydraFusion: { checked: 'false', readout: 'Default' } },
			autoOptions: ['Efficiency', 'Balance', 'Intelligence'],
			opened: { dialog: 'HydraFusion Details', name: 'HydraFusion', description: 'HydraFusion routes the first eligible turn and may use multiple models. Learn more', headings: [], options: ['Default', 'Max'], active: 'Default' },
			chosen: { dialog: 'HydraFusion Details', name: 'HydraFusion', description: 'HydraFusion routes the first eligible turn and may use multiple models. Learn more', headings: [], options: ['Default', 'Max'], active: 'Max' },
			listWithMax: { checked: 'true', readout: 'Max' },
			remembered: { checked: 'false', readout: 'Max' },
			selections: [max.identifier, models[0].identifier],
		});
	});

	test('HydraFusion\'s row keeps standing for a tier the chat started on after another model is chosen', () => {
		const max = createHydraFusionMaxModel();
		const result = createPicker({ models: [...models, createAutoModel(), createHydraFusionModel(), max], selectedModelId: max.identifier });
		const readout = () => Array.from(result.popup.querySelectorAll('.chat-model-picker-model')).find(row => row.querySelector('.title')?.textContent === 'HydraFusion')?.querySelector('.action-label')?.textContent;
		const initial = readout();
		selectRow(result.popup, 'First');
		reopen(result);
		assert.deepStrictEqual({ initial, afterSwitching: readout(), selections: result.selections }, {
			initial: 'Max',
			afterSwitching: 'Max',
			selections: [models[0].identifier],
		});
	});

	test('HydraFusion\'s row carries an organization default of either tier, standing for it until another tier is chosen', () => {
		const result = createPicker({ policyDefault: 'hydrafusion-max', models: [...models, createAutoModel(), createHydraFusionModel(), createHydraFusionMaxModel()], selectedModelId: models[0].identifier });
		const readout = Array.from(result.popup.querySelectorAll('.chat-model-picker-model')).find(row => row.querySelector('.title')?.textContent === 'HydraFusion')?.querySelector('.action-label')?.textContent;
		const defaults = defaultBadgeModels(result.popup);
		openDetails(result.popup, 'HydraFusion');
		const details = result.popup.querySelector('.tabbed-action-list-details .chat-model-card-org-default')?.textContent;
		assert.deepStrictEqual({ readout, defaults, details }, {
			readout: 'Max',
			defaults: ['HydraFusion'],
			details: 'Your organization sets HydraFusion Max as the default for new chats. You can choose another model for this chat.',
		});
	});

	/** Reopens the picker on the latest selection, as the chat input does. */
	function reopen(result: ReturnType<typeof createPicker>): void {
		result.picker.show(result.anchor, { ...result.context, selectedModelId: result.selections.at(-1) ?? result.context.selectedModelId });
	}

	test('HydraFusion has no tiers of its own without HydraFusion Max from Copilot, and is never one of Auto\'s', () => {
		const otherBase = createHydraFusionMaxModel();
		const other = { ...otherBase, identifier: 'claude/hydrafusion-max', metadata: { ...otherBase.metadata, name: 'Other Max', modelGroup: { id: 'claude' } } };
		const result = createPicker({ models: [...models, createAutoModel(), createHydraFusionModel(), other], selectedModelId: models[0].identifier });
		const hydraFusionDetails = !!result.popup.querySelector('[role="button"][aria-label^="HydraFusion Details"]');
		openDetails(result.popup, 'Auto');
		assert.deepStrictEqual({ hydraFusionDetails, autoOptions: autoTiers(result.popup) }, { hydraFusionDetails: false, autoOptions: ['Efficiency', 'Balance', 'Intelligence'] });
	});

	test('Fusion offers Standard, High, and Max, with High using HydraFusion only when routed there and available', async () => {
		const max = createHydraFusionMaxModel();
		const choose = async (option: string, balanceUsesHydraFusion: boolean, withHydraFusion = true) => {
			const fusion = createFusionModel(balanceUsesHydraFusion);
			const result = createPicker({ models: [...models, fusion, ...(withHydraFusion ? [createHydraFusionModel()] : []), max], selectedModelId: models[0].identifier });
			const readout = () => Array.from(result.popup.querySelectorAll('.chat-model-picker-model'))
				.find(row => row.querySelector('.title')?.textContent === 'Fusion')?.querySelector('.action-label')?.textContent;
			const rows = listRows(result.popup);
			openDetails(result.popup, 'Fusion');
			const tiers = autoTiers(result.popup);
			chooseOption(result.popup, option);
			await timeout(0);
			const discount = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-card-discount-description')).find(element => !element.hidden)?.textContent;
			const description = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-card-alternative-description')).find(element => !element.hidden)?.textContent;
			const ariaLabel = result.popup.querySelector('.tabbed-action-list-details [role="radio"][aria-checked="true"]')?.getAttribute('aria-label');
			goBack(result.popup);
			return { rows, tiers, discount, description, ariaLabel, readout: readout(), selections: result.selections, tier: result.values.get(fusion.identifier)?.tier };
		};
		const fusionHigh = {
			rows: ['Fusion', '--', 'First', 'Fixed', 'Second'], tiers: ['Standard', 'High', 'Max'], discount: 'Models routed via Fusion High receive a 10% discount.',
			description: undefined, ariaLabel: 'High', readout: 'High', selections: ['copilot/auto'], tier: 'intelligence',
		};
		assert.deepStrictEqual({
			high: await choose('High', true),
			max: await choose('Max', true),
			highNotRouted: await choose('High', false),
			highWithoutHydraFusion: await choose('High', true, false),
		}, {
			high: {
				rows: ['Fusion', '--', 'First', 'Fixed', 'Second'], tiers: ['Standard', 'High', 'Max'], discount: undefined,
				description: 'High picks a workflow per task, using one or more models. Learn more',
				ariaLabel: 'High, High picks a workflow per task, using one or more models.',
				readout: 'High', selections: ['copilot/hydrafusion'], tier: undefined,
			},
			max: {
				rows: ['Fusion', '--', 'First', 'Fixed', 'Second'], tiers: ['Standard', 'High', 'Max'], discount: undefined,
				description: 'Max uses multiple models on every task for the most thorough results. Learn more',
				ariaLabel: 'Max, Max uses multiple models on every task for the most thorough results.',
				readout: 'Max', selections: ['copilot/hydrafusion-max'], tier: undefined,
			},
			highNotRouted: fusionHigh,
			highWithoutHydraFusion: fusionHigh,
		});
	});

	test('Fusion with the provider\'s tiers offers Standard, High, and Max once, routing all three through Fusion with its promotion', async () => {
		const fusion = createFusionModel();
		const day = 24 * 60 * 60 * 1000;
		const providerFusion: ILanguageModelChatMetadataAndIdentifier = {
			...fusion,
			metadata: {
				...fusion.metadata,
				autoModelProviderTiers: true,
				autoModelTierPromotions: [{ id: 'launch', message: 'Get 30% off Fusion usage.', discountPercent: 30, tierIds: ['balance', 'hydrafusion', 'hydrafusion-max'], startsAt: new Date(Date.now() - day).toISOString() }],
				configurationSchema: {
					properties: {
						tier: { type: 'string', group: 'navigation', title: 'Effort Level', enum: ['balance', 'hydrafusion', 'hydrafusion-max'], enumItemLabels: ['Standard', 'High', 'Max'], default: 'balance' },
					},
				},
			},
		};
		const result = createPicker({ models: [...models, providerFusion, createHydraFusionModel(), createHydraFusionMaxModel()], selectedModelId: models[0].identifier });
		openDetails(result.popup, 'Fusion');
		const tiers = autoTiers(result.popup);
		chooseOption(result.popup, 'Max');
		await timeout(0);
		const discount = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-card-discount-description')).find(element => !element.hidden)?.textContent;
		const promotion = result.popup.querySelector('.chat-model-card-tier-promotion')?.textContent;
		goBack(result.popup);
		assert.deepStrictEqual({ tiers, discount, promotion, selections: result.selections, tier: result.values.get(providerFusion.identifier)?.tier }, {
			tiers: ['Standard', 'High', 'Max'],
			discount: 'Models routed via Fusion Max receive a 30% discount.',
			promotion: 'Get 30% off Fusion usage.',
			selections: ['copilot/auto'],
			tier: 'hydrafusion-max',
		});
	});

	test('Fusion does not offer HydraFusion Max beside provider tiers that hide it', () => {
		const fusion = createFusionModel();
		const providerFusion: ILanguageModelChatMetadataAndIdentifier = {
			...fusion,
			metadata: {
				...fusion.metadata,
				autoModelProviderTiers: true,
				configurationSchema: {
					properties: {
						tier: { type: 'string', group: 'navigation', title: 'Effort Level', enum: ['balance', 'hydrafusion'], enumItemLabels: ['Standard', 'High'], default: 'balance' },
					},
				},
			},
		};
		const result = createPicker({ models: [...models, providerFusion, createHydraFusionModel(), createHydraFusionMaxModel()], selectedModelId: models[0].identifier });
		openDetails(result.popup, 'Fusion');
		assert.deepStrictEqual(autoTiers(result.popup), ['Standard', 'High']);
	});

	test('rapid tier edits save in order and report the actual previous values', async () => {
		const auto = createAutoModel();
		const pending = new DeferredPromise<void>();
		const writes: IStringDictionary<unknown>[] = [];
		const result = createPicker({
			models: [auto, ...models],
			beforeSave: async next => { writes.push(next); await pending.p; },
		});
		openDetails(result.popup, 'Auto');
		chooseOption(result.popup, 'Intelligence');
		chooseOption(result.popup, 'Efficiency');
		await timeout(0);
		const before = [...writes];
		await pending.complete();
		await timeout(0);
		const open = !!result.popup.querySelector('.tabbed-action-list-details');
		goBack(result.popup);
		const changes = result.configurationChanges.map(([, , , from, to]) => ({ from, to }));
		const readout = result.popup.querySelector('.chat-model-picker-model[aria-checked="true"] .action-label')?.textContent;
		assert.deepStrictEqual({ open, before, writes, changes, selected: selectedModels(result.popup), readout, selections: result.selections }, {
			open: true,
			before: [{ tier: 'intelligence' }],
			writes: [{ tier: 'intelligence' }, { tier: 'efficiency' }],
			changes: [{ from: 'balance', to: 'intelligence' }, { from: 'intelligence', to: 'efficiency' }],
			selected: ['Auto'], readout: 'Efficiency', selections: [],
		});
	});

	for (const start of ['Auto', 'another provider\'s model'] as const) {
		test(`failed tier saves from ${start} are reported without changing the selected model or preference`, async () => {
			const failure = new Error('Cannot save the routing preference.');
			const auto = createAutoModel();
			const local = model('Local');
			const ollama = { ...local, identifier: 'ollama/local', metadata: { ...local.metadata, vendor: 'ollama' } };
			const result = createPicker({ models: [auto, ...models, ollama], beforeSave: async () => { throw failure; } });
			if (start !== 'Auto') {
				result.picker.show(result.anchor, { ...result.context, selectedModelId: ollama.identifier });
				element(result.popup, '.chat-model-picker-tabbar [aria-label="Copilot"]').click();
			}
			const reported: Error[] = [];
			const previousHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(error => reported.push(error));
			try {
				openDetails(result.popup, 'Auto');
				chooseOption(result.popup, 'Intelligence');
				await timeout(0);
			} finally {
				setUnexpectedErrorHandler(previousHandler);
			}
			result.picker.hide();
			result.picker.show(result.anchor, { ...result.context, selectedModelId: start === 'Auto' ? auto.identifier : ollama.identifier });
			element(result.popup, '.chat-model-picker-tabbar [aria-label="Copilot"]').click();
			assert.deepStrictEqual({
				reported,
				changes: result.configurationChanges,
				selected: selectedModels(result.popup),
				readout: element(result.popup, '[aria-label^="Auto Details"]').textContent,
				selections: result.selections,
			}, { reported: [failure], changes: [], selected: start === 'Auto' ? ['Auto'] : [], readout: 'Balance', selections: [] });
		});
	}

	for (const newScope of [false, true]) {
		test(`pending Auto tier saves cannot override ${newScope ? 'a reopened picker with a new scope' : 'a model chosen since'}`, async () => {
			const auto = createAutoModel();
			const pending = new DeferredPromise<void>();
			const result = createPicker({ models: [auto, ...models], selectedModelId: models[0].identifier, beforeSave: () => pending.p });
			openDetails(result.popup, 'Auto');
			chooseOption(result.popup, 'Intelligence');
			goBack(result.popup);
			if (newScope) {
				result.picker.hide();
				result.picker.show(result.anchor, {
					...result.context, selectedModelId: models[0].identifier,
					configurationAccess: {
						getModelConfiguration: () => undefined,
						getModelConfigurationActions: () => [],
						setModelConfiguration: async () => assert.fail('The new scope must not receive the old write'),
					},
				});
			} else {
				selectRow(result.popup, 'Second');
				reopen(result);
			}
			await pending.complete();
			await timeout(0);
			assert.deepStrictEqual({
				values: result.values.get(auto.identifier),
				selected: selectedModels(result.popup),
				selections: result.selections,
			}, { values: { tier: 'intelligence' }, selected: [newScope ? 'First' : 'Second'], selections: newScope ? [] : [models[1].identifier] });
		});
	}

	test('Auto and HydraFusion lead only the Copilot tab, and search finds HydraFusion', () => {
		const auto = createAutoModel();
		const hydra = createHydraFusionModel();
		const local = model('Local');
		const result = createPicker({
			policyDefault: 'auto', models: [...models, auto, hydra, {
				...local, identifier: 'ollama/local', metadata: { ...local.metadata, vendor: 'ollama' },
			}]
		});
		const initial = { rows: listRows(result.popup), selected: selectedModels(result.popup), defaults: defaultBadgeModels(result.popup) };
		const autoRow = element(result.popup, '[aria-label^="Auto Details"]').closest('.monaco-list-row')!;
		const autoRowA11y = { hasPopup: autoRow.getAttribute('aria-haspopup'), badge: autoRow.querySelector('.action-item-badge')?.textContent };
		selectRow(result.popup, 'Auto');
		const closed = !result.picker.isVisible;
		reopen(result);
		const reopened = selectedModels(result.popup);
		element(result.popup, '.chat-model-picker-tabbar [aria-label="Ollama"]').click();
		const otherProvider = listRows(result.popup);
		element(result.popup, '[data-id="search"]').click();
		const input = result.popup.querySelector<HTMLInputElement>('input')!;
		input.value = 'HydraFusion';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		const searchResults = Array.from(result.popup.querySelectorAll('.chat-model-picker-model .title'), title => title.textContent);
		selectRow(result.popup, 'HydraFusion');
		assert.deepStrictEqual({ initial, autoRowA11y, closed, reopened, otherProvider, searchResults, selections: result.selections }, {
			initial: { rows: ['Auto', 'HydraFusion', '--', 'First', 'Fixed', 'Second'], selected: ['First'], defaults: ['Auto'] },
			autoRowA11y: { hasPopup: 'dialog', badge: '10% discount' },
			closed: true,
			reopened: ['Auto'],
			otherProvider: ['Local'],
			searchResults: ['HydraFusion'],
			selections: [auto.identifier, hydra.identifier],
		});
	});

	test('HydraFusion that needs a newer VS Code is offered as an update rather than a tier', () => {
		const auto = createAutoModel();
		const local = model('Local');
		const gated = model('Gated');
		const result = createPicker({
			models: [auto, createHydraFusionModel(), { ...local, identifier: 'ollama/local', metadata: { ...local.metadata, vendor: 'ollama' } }, gated, models[1]],
			showUnavailable: true,
			controlModels: {
				Gated: { label: 'Gated', exists: true, featured: true, minVSCodeVersion: '99.0.0' },
				hydrafusion: { label: 'HydraFusion', exists: true, featured: true, minVSCodeVersion: '99.0.0' },
			},
		});
		const unavailable = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-picker-unavailable'));
		unavailable.forEach(row => row.click());
		openDetails(result.popup, 'Auto');
		assert.deepStrictEqual({
			unavailable: unavailable.map(row => row.querySelector('.title')?.textContent),
			tiers: autoTiers(result.popup),
			selections: result.selections,
		}, {
			unavailable: ['Gated', 'HydraFusion'],
			tiers: ['Efficiency', 'Balance', 'Intelligence'],
			selections: [],
		});
	});

	for (const entitlement of [ChatEntitlement.Free, ChatEntitlement.EDU]) {
		test(`${ChatEntitlement[entitlement]} plans show HydraFusion as an unavailable upgrade instead of a tier`, () => {
			const auto = createAutoModel();
			const hydra = createHydraFusionModel();
			// Listed first, so the upsell must not take its name.
			const max = createHydraFusionMaxModel();
			const result = createPicker({
				models: [auto, max, hydra, ...models],
				selectedModelId: auto.identifier,
				entitlement,
				showUnavailable: false,
				controlModels: {},
			});
			result.picker.refresh([auto, max, hydra, ...models]);
			const unavailableHydra = element(result.popup, '.chat-model-picker-unavailable');
			unavailableHydra.click();
			const state = {
				label: unavailableHydra.querySelector('.title')?.textContent,
				upgrade: unavailableHydra.textContent?.includes('Upgrade'),
				selected: selectedModels(result.popup),
			};
			openDetails(result.popup, 'Auto');
			assert.deepStrictEqual({ ...state, tiers: autoTiers(result.popup), selections: result.selections }, {
				label: 'HydraFusion',
				upgrade: true,
				selected: ['Auto'],
				tiers: ['Efficiency', 'Balance', 'Intelligence'],
				selections: [],
			});
		});
	}

	test('Free plans do not upsell HydraFusion while Fusion presents it', () => {
		const fusion = createFusionModel();
		const hydra = createHydraFusionModel();
		const result = createPicker({
			models: [fusion, hydra, ...models],
			selectedModelId: fusion.identifier,
			entitlement: ChatEntitlement.Free,
			showUnavailable: false,
			controlModels: {
				hydrafusion: { label: 'HydraFusion', exists: true, featured: true },
			},
		});
		assert.strictEqual(result.popup.querySelector('.chat-model-picker-unavailable'), null);
	});

	test('Free plans remove the synthesized HydraFusion upgrade when the live model is removed', () => {
		const auto = createAutoModel();
		const hydra = createHydraFusionModel();
		const result = createPicker({
			models: [auto, hydra, ...models],
			selectedModelId: auto.identifier,
			entitlement: ChatEntitlement.Free,
			showUnavailable: false,
			controlModels: {},
		});
		assert.ok(result.popup.querySelector('.chat-model-picker-unavailable'));
		result.picker.refresh([auto, ...models]);
		assert.strictEqual(result.popup.querySelector('.chat-model-picker-unavailable'), null);
	});

	test('resolving an open picker to Free replaces HydraFusion with an unavailable upgrade', () => {
		const auto = createAutoModel();
		const hydra = createHydraFusionModel();
		const result = createPicker({
			models: [auto, hydra, ...models],
			selectedModelId: auto.identifier,
			entitlement: ChatEntitlement.Unknown,
			showUnavailable: true,
			controlModels: {
				hydrafusion: { label: 'HydraFusion', exists: true, featured: true },
			},
			controlManifest: {
				free: { hydrafusion: { label: 'HydraFusion', exists: true, featured: true } },
				paid: { hydrafusion: { label: 'HydraFusion', exists: true, featured: true } },
			},
		});
		const before = listRows(result.popup);
		result.setEntitlement(ChatEntitlement.Free);
		const unavailableHydra = element(result.popup, '.chat-model-picker-unavailable');
		assert.deepStrictEqual({
			before,
			label: unavailableHydra.querySelector('.title')?.textContent,
			upgrade: unavailableHydra.textContent?.includes('Upgrade'),
			selected: selectedModels(result.popup),
			selections: result.selections,
		}, {
			before: ['Auto', 'HydraFusion', '--', 'First', 'Fixed', 'Second'],
			label: 'HydraFusion',
			upgrade: true,
			selected: ['Auto'],
			selections: [],
		});
	});

	test('resolving an open picker to Free replaces a selected HydraFusion with Auto', () => {
		const auto = createAutoModel();
		const hydra = createHydraFusionModel();
		const result = createPicker({
			models: [auto, hydra, ...models],
			selectedModelId: hydra.identifier,
			entitlement: ChatEntitlement.Unknown,
			showUnavailable: true,
			controlModels: {
				hydrafusion: { label: 'HydraFusion', exists: true, featured: true },
			},
			controlManifest: {
				free: { hydrafusion: { label: 'HydraFusion', exists: true, featured: true } },
				paid: { hydrafusion: { label: 'HydraFusion', exists: true, featured: true } },
			},
		});
		const before = selectedModels(result.popup);
		result.setEntitlement(ChatEntitlement.Free);
		assert.deepStrictEqual({
			before,
			upgrade: element(result.popup, '.chat-model-picker-unavailable').textContent?.includes('Upgrade'),
			selected: selectedModels(result.popup),
			after: element(result.popup, '[aria-label^="Auto Details"]').textContent,
			selections: result.selections,
		}, {
			before: ['HydraFusion'],
			upgrade: true,
			selected: ['Auto'],
			after: 'Balance',
			selections: [auto.identifier],
		});
	});

	test('without models the Copilot tab explains why, with the placeholder\'s own icon and action and nothing to search', () => {
		let trustRequests = 0;
		const result = createPicker({
			models: [],
			providerPlaceholders: [{
				vendor: 'copilot',
				label: 'Restricted Mode',
				icon: Codicon.workspaceUntrusted,
				message: 'Trust this workspace to enable models.',
				action: { label: 'Trust Workspace', run: () => trustRequests++ },
			}],
		});
		const welcome = element(result.popup, '.chat-model-picker-welcome');
		element(welcome, '.monaco-button').click();
		assert.deepStrictEqual({
			tabs: Array.from(result.popup.querySelectorAll('.chat-model-picker-tabbar [role="radio"]'), tab => tab.getAttribute('aria-label')),
			icon: !!welcome.querySelector(`.chat-model-picker-welcome-icon${ThemeIcon.asCSSSelector(Codicon.workspaceUntrusted)}`),
			text: Array.from(welcome.querySelectorAll('.chat-model-picker-welcome-title, .chat-model-picker-welcome-message, .monaco-button'), part => part.textContent),
			tabBarActions: Array.from(result.popup.querySelectorAll<HTMLElement>('.tabbed-action-list-tabbar-action'), action => action.dataset.id),
			trustRequests,
		}, {
			tabs: ['Copilot'],
			icon: true,
			text: ['Restricted Mode', 'Trust this workspace to enable models.', 'Trust Workspace'],
			tabBarActions: [],
			trustRequests: 1,
		});
	});

	test('Auto-only plans list Auto beside unavailable models and retain provider navigation', () => {
		const result = createPicker({
			models: [createAutoModel()],
			showUnavailable: true,
			controlModels: { locked: { label: 'Locked Model', exists: false, featured: true } },
			providerPlaceholders: [{ vendor: 'ollama', label: 'Ollama', message: 'Add a model.' }],
		});
		const initial = {
			tabs: Array.from(result.popup.querySelectorAll('.chat-model-picker-tabbar [role="radio"]'), tab => tab.getAttribute('aria-label')),
			selected: selectedModels(result.popup),
			unavailable: result.popup.textContent?.includes('Locked Model'),
		};
		element(result.popup, '.chat-model-picker-tabbar [aria-label="Ollama"]').click();
		assert.deepStrictEqual({ initial, emptyProvider: !!result.popup.querySelector('.tabbed-action-list-empty'), selections: result.selections }, {
			initial: { tabs: ['Copilot', 'Ollama'], selected: ['Auto'], unavailable: true },
			emptyProvider: true,
			selections: [],
		});
	});

	test('Free and Student plans head the models that Auto-only access lacks as upgrades, below Auto', () => {
		const rows = [ChatEntitlement.Free, ChatEntitlement.EDU].map(entitlement => listRows(createPicker({
			models: [createAutoModel()],
			entitlement,
			showUnavailable: true,
			controlModels: { locked: { label: 'Locked Model', exists: false, featured: true } },
		}).popup));
		assert.deepStrictEqual(rows, Array(2).fill(['Auto', '--Upgrade for More Models', 'Locked Model']));
	});

	test('Free and Student plans keep the Copilot tab for upgrades when Copilot relays no selectable model', () => {
		const local = model('Local');
		const result = Object.fromEntries([ChatEntitlement.Free, ChatEntitlement.EDU, ChatEntitlement.Pro].map(entitlement => {
			const { popup, selections } = createPicker({
				models: [{ ...local, identifier: 'ollama/local', metadata: { ...local.metadata, vendor: 'ollama' } }],
				selectedModelId: createAutoModel().identifier,
				entitlement,
				showUnavailable: true,
				controlModels: { locked: { label: 'Locked Model', exists: false, featured: true } },
			});
			const tabs = Array.from(popup.querySelectorAll('.chat-model-picker-tabbar [role="radio"]'), tab => tab.getAttribute('aria-label'));
			const initialRows = listRows(popup);
			element(popup, '.chat-model-picker-tabbar [aria-label="Ollama"]').click();
			return [ChatEntitlement[entitlement], { tabs, initialRows, providerRows: listRows(popup), selections }];
		}));
		assert.deepStrictEqual(result, {
			Free: { tabs: ['Copilot', 'Ollama'], initialRows: ['--Upgrade for More Models', 'Locked Model'], providerRows: ['Local'], selections: [] },
			EDU: { tabs: ['Copilot', 'Ollama'], initialRows: ['--Upgrade for More Models', 'Locked Model'], providerRows: ['Local'], selections: [] },
			Pro: { tabs: ['Ollama'], initialRows: ['Local'], providerRows: ['Local'], selections: [] },
		});
	});

	test('HydraFusion alone keeps its own row in the Copilot tab, without Details', () => {
		const hydra = createHydraFusionModel();
		const { popup, selections } = createPicker({ models: [hydra], selectedModelId: hydra.identifier });
		assert.deepStrictEqual({
			tabs: Array.from(popup.querySelectorAll('.chat-model-picker-tabbar [role="radio"]'), tab => tab.getAttribute('aria-label')),
			rows: listRows(popup),
			selected: selectedModels(popup),
			actions: popup.querySelectorAll('.chat-model-picker-model .action-label').length,
			selections,
		}, {
			tabs: ['Copilot'],
			rows: ['HydraFusion'],
			selected: ['HydraFusion'],
			actions: 0,
			selections: [],
		});
	});

	/** The direct-selection model the Copilot agent host publishes for an installed on-device model, with its thinking level when it has one. */
	function onDeviceModel(alias: string, name: string, thinkingLevel?: IModelConfigPropertySchema): ILanguageModelChatMetadataAndIdentifier {
		return {
			identifier: `${SessionType.AgentHostCopilot}:vscode-on-device/${alias}`,
			metadata: upcastPartial<ILanguageModelChatMetadata>({
				id: `vscode-on-device/${alias}`, name, family: alias, vendor: SessionType.AgentHostCopilot, version: '1',
				targetChatSessionType: SessionType.AgentHostCopilot, modelGroup: { id: 'vscode-on-device' },
				configurationSchema: thinkingLevel && { properties: { thinkingLevel } },
			}),
		};
	}

	function onDeviceFamily(familyId: string, displayName: string, overrides: Partial<ILocalModelFamilyV1>): ILocalModelFamilyV1 {
		return { familyId, capiId: familyId, autoCapable: true, displayName, usage: { runningStreams: 0, boundDirectChats: 0, liveAutoRoutes: 0 }, consentGiven: true, ...overrides };
	}

	function onDeviceInstall(model: ILanguageModelChatMetadataAndIdentifier): ILocalModelFamilyV1['install'] {
		return { contentId: model.metadata.id, adopted: false, owned: true, modelId: model.metadata.id };
	}

	const exampleFlash = onDeviceModel('Example-Flash', 'Example Flash 1.0', { type: 'string', group: 'navigation', enum: ['low', 'medium', 'high'], enumItemLabels: ['Low', 'Medium', 'High'], default: 'medium' });
	const qwen = onDeviceModel('Qwen-Coder', 'Qwen Coder');
	const onDeviceOffer = { fit: 'full', requiredGpuBytes: 60e9, downloadBytes: 56.7e9, peakDiskBytes: 60e9 } as const;
	/** Example Flash is loaded and ready with its context sizes and a thinking level, Qwen is installed but not loaded, one model downloads and one is offered. */
	function onDeviceStatus(overrides: Partial<ILocalModelStatusV1> = {}): ILocalModelStatusV1 {
		return {
			schemaVersion: 1,
			device: { confidence: 'measured' },
			runtime: { version: 'b11459' },
			catalog: { state: 'ready', registries: { azureml: 'ready' } },
			families: [
				onDeviceFamily('example-flash', exampleFlash.metadata.name, { install: onDeviceInstall(exampleFlash), context: { tokens: 131072, options: [{ tokens: 65536, gpuBytes: 56e9 }, { tokens: 131072, gpuBytes: 58e9 }] } }),
				onDeviceFamily('qwen', qwen.metadata.name, { install: onDeviceInstall(qwen) }),
				onDeviceFamily('vision', 'Example Vision 7B', { offer: onDeviceOffer, operation: { id: 'op1', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes: 42, totalBytes: 100 } }),
				onDeviceFamily('mini', 'Example Mini 3B', { offer: onDeviceOffer }),
			],
			active: { familyId: 'example-flash', contentId: exampleFlash.metadata.id, servingGeneration: 1, server: 'ready', autoEligible: true },
			useInAuto: true,
			...overrides,
		};
	}

	function onDevicePresentation(status = onDeviceStatus()): IModelPickerLocalModels {
		const presentation = createLocalModelPickerPresentation(status, { run: () => { } });
		assert.ok(presentation);
		return presentation;
	}

	const ollamaModel: ILanguageModelChatMetadataAndIdentifier = { ...model('Local'), identifier: 'ollama/local', metadata: { ...model('Local').metadata, vendor: 'ollama' } };
	/** Copilot's Auto and models, which size the popup tall enough to show every on-device row. */
	const copilotModels = [createAutoModel(), ...models];
	const copilotRows = ['Auto', '--', 'First', 'Fixed', 'Second'];

	function tabState(popup: HTMLElement) {
		return {
			tabs: Array.from(popup.querySelectorAll('.chat-model-picker-tabbar [role="radio"]'), tab => tab.getAttribute('aria-label')),
			active: popup.querySelector('.chat-model-picker-tabbar [role="radio"][aria-checked="true"]')?.getAttribute('aria-label'),
			// A focused row with a hover shows its panel, whose menu is a list of its own.
			rows: listRows(popup).filter((_, index) => !popup.querySelectorAll('.chat-model-picker-tabbed .monaco-list-row')[index].closest('.action-list-submenu-panel')),
		};
	}

	test('on-device models get a tab of their own after Copilot, which lists none of them, and only once a user has opted in; until then they stay out of the cloud tabs', () => {
		const [auto, copilot] = copilotModels;
		const shown = (selectedModelId: string, localModels: IModelPickerLocalModels | undefined) => {
			const { popup, dismiss } = createPicker({ models: [...copilotModels, ollamaModel, exampleFlash, qwen], selectedModelId, localModels });
			const result = tabState(popup);
			dismiss();
			return result;
		};
		const tabs = ['Copilot', 'On This Device', 'Ollama'];
		assert.deepStrictEqual({
			auto: shown(auto.identifier, onDevicePresentation()),
			manual: shown(copilot.identifier, onDevicePresentation()),
			onDevice: shown(qwen.identifier, onDevicePresentation()),
			notOptedIn: shown(copilot.identifier, undefined),
		}, {
			auto: { tabs, active: 'Copilot', rows: copilotRows },
			manual: { tabs, active: 'Copilot', rows: copilotRows },
			onDevice: { tabs, active: 'On This Device', rows: ['Example Flash 1.0', 'Qwen Coder', 'Example Vision 7B', 'Example Mini 3B'] },
			notOptedIn: { tabs: ['Copilot', 'Ollama'], active: 'Copilot', rows: copilotRows },
		});
	});

	test('the On This Device tab lists each family once on a single line, and an installed one selects its model', () => {
		const { popup, selections, picker } = createPicker({ models: [...copilotModels, exampleFlash, qwen], selectedModelId: exampleFlash.identifier, localModels: onDevicePresentation() });
		const rows = () => Array.from(popup.querySelectorAll<HTMLElement>('.chat-model-picker-tabbed .monaco-list-row.action'));
		const snapshot = rows().map(row => ({
			title: row.querySelector('.title')?.textContent,
			badge: row.querySelector('.action-item-badge')?.textContent,
			// The state is only read out: the row shows no text beside the name.
			label: row.getAttribute('aria-label'),
			text: [row.querySelector('.description')?.textContent, row.querySelector('.detail')?.textContent].join(''),
			check: !!row.querySelector('.codicon-check'),
			checked: row.getAttribute('aria-checked'),
			popup: row.getAttribute('aria-haspopup'),
			actions: Array.from(row.querySelectorAll('.action-list-item-toolbar .action-label'), action => action.getAttribute('aria-label')),
			toggle: row.querySelector('.action-list-item-inline-toggle-label')?.textContent,
		}));
		rows().find(row => row.querySelector('.title')?.textContent === 'Qwen Coder')?.click();
		assert.deepStrictEqual({ rows: snapshot, selections, visible: picker.isVisible }, {
			rows: [
				{ title: 'Example Flash 1.0', badge: 'Active', label: 'Example Flash 1.0, Active, Effort Level: Medium, Context: 128K, No usage limit', text: '', check: true, checked: 'true', popup: 'dialog', actions: ['Example Flash 1.0 Details, Medium \u00b7 128K'], toggle: undefined },
				{ title: 'Qwen Coder', badge: '', label: 'Qwen Coder, Not loaded', text: '', check: false, checked: 'false', popup: 'dialog', actions: ['Qwen Coder Details'], toggle: undefined },
				{ title: 'Example Vision 7B', badge: '', label: 'Example Vision 7B, Not downloaded, Downloading 42%', text: '', check: false, checked: 'false', popup: 'dialog', actions: ['Example Vision 7B Details, Downloading 42%'], toggle: undefined },
				{ title: 'Example Mini 3B', badge: '', label: 'Example Mini 3B, Not downloaded, 52.8 GB download', text: '', check: false, checked: 'false', popup: 'dialog', actions: ['Download Example Mini 3B'], toggle: undefined },
			],
			selections: [qwen.identifier],
			visible: false,
		});
	});

	test('Right Arrow on an on-device row opens its detail page, and Back returns to the row', async () => {
		const { popup } = createPicker({ models: [...copilotModels, exampleFlash, qwen], selectedModelId: exampleFlash.identifier, localModels: onDevicePresentation() });
		const list = element(popup, '.chat-model-picker-tabbed .monaco-list');
		const detailsButton = element(popup, `[role="button"][aria-label^="${exampleFlash.metadata.name} Details"]`);
		const right = new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true });
		list.dispatchEvent(right);
		const opened = { prevented: right.defaultPrevented, page: localModelPage(popup)?.name };
		goBack(popup);
		await timeout(0);
		assert.deepStrictEqual({
			buttonPopup: detailsButton.getAttribute('aria-haspopup'),
			opened,
			listFocused: document.activeElement === list,
			focusedRow: popup.querySelector('.monaco-list-row.focused .title')?.textContent,
		}, {
			buttonPopup: 'dialog',
			opened: { prevented: true, page: exampleFlash.metadata.name },
			listFocused: true,
			focusedRow: exampleFlash.metadata.name,
		});
	});

	test('search finds on-device models under the name of their tab', () => {
		const { popup } = createPicker({ models: [...copilotModels, ollamaModel, exampleFlash, qwen], localModels: onDevicePresentation() });
		element(popup, '[data-id="search"]').click();
		// Each query narrows the results to rows that fit beside one another in the popup.
		const search = (query: string) => {
			const input = popup.querySelector<HTMLInputElement>('input')!;
			input.value = query;
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			return Array.from(popup.querySelectorAll('.chat-model-picker-tabbed .monaco-list-row.action'), row => ({
				title: row.querySelector('.title')?.textContent,
				badge: row.querySelector('.action-item-badge')?.textContent,
				details: !!row.querySelector('.action-list-item-toolbar .action-label'),
			}));
		};
		assert.deepStrictEqual(['Auto', 'Example Flash', 'Qwen', 'Local'].map(search), [
			[{ title: 'Auto', badge: 'Copilot', details: true }],
			[{ title: 'Example Flash 1.0', badge: 'On This Device', details: true }],
			[{ title: 'Qwen Coder', badge: 'On This Device', details: true }],
			[{ title: 'Local', badge: 'Ollama', details: true }],
		]);
	});

	test('a comparison leaves out the On This Device tab', () => {
		const state = observableValue<IModelPickerComparisonState | undefined>('comparison', undefined);
		const comparison: IModelPickerComparison = {
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: () => state.set({ title: 'Attempts', description: 'Select models.', summary: '2 Attempts', selectedModelIds: [], multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false }, undefined),
			cancel: () => state.set(undefined, undefined),
			reset: () => state.set(undefined, undefined),
			select: () => { }, setCount: () => { }, back: () => { }, next: () => { }, finish: () => { },
			getVariants: () => [], addVariant: () => { }, removeVariant: () => { },
		};
		const { popup } = createPicker({ models: [...copilotModels, ollamaModel, exampleFlash, qwen], selectedModelId: exampleFlash.identifier, localModels: onDevicePresentation(), comparison });
		const before = tabState(popup);
		element(popup, '[aria-label="Compare Models"]').click();
		const { tabs, active } = tabState(popup);
		// Counted from the set size, since the comparison footer may scroll some choices out of view.
		const offered = Number(popup.querySelector('[role="menuitemcheckbox"]')?.getAttribute('aria-setsize') ?? 0);
		assert.deepStrictEqual({ before, comparing: { tabs, active, offered } }, {
			before: { tabs: ['Copilot', 'On This Device', 'Ollama'], active: 'On This Device', rows: ['Example Flash 1.0', 'Qwen Coder', 'Example Vision 7B', 'Example Mini 3B'] },
			comparing: { tabs: ['Copilot', 'Ollama'], active: 'Copilot', offered: 3 },
		});
	});

	test('status updates refresh the On This Device tab in place, and the picker returns to Copilot when the tab goes away', () => {
		const { popup, picker } = createPicker({ models: [...copilotModels, exampleFlash, qwen], selectedModelId: exampleFlash.identifier, localModels: onDevicePresentation() });
		const list = element(popup, '.chat-model-picker-tabbed .monaco-list');
		list.focus();
		list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
		const focusedRow = () => popup.querySelector('.chat-model-picker-tabbed .monaco-list-row.focused')?.querySelector('.title')?.textContent;
		// On-device rows have no hover or menu beside the list.
		const panels = () => Array.from(popup.querySelectorAll('.action-list-submenu-panel'), panel => panel.textContent).join('');
		const before = { ...tabState(popup), focused: focusedRow(), panels: panels() };
		// Qwen is being swapped in, and the download moved on.
		const swapping = onDeviceStatus();
		picker.setLocalModels(onDevicePresentation({
			...swapping,
			active: { ...swapping.active!, swapTo: 'qwen' },
			families: swapping.families.map(family => family.operation ? { ...family, operation: { ...family.operation, completedBytes: 80 } } : family),
		}));
		const updated = { ...tabState(popup), focused: focusedRow(), panels: panels(), states: Array.from(popup.querySelectorAll('.chat-model-picker-tabbed .monaco-list-row.action'), row => row.getAttribute('aria-label')) };
		picker.setLocalModels(undefined);
		const gone = tabState(popup);
		assert.deepStrictEqual({ before, updated, gone: { tabs: gone.tabs.includes('On This Device'), active: gone.active } }, {
			before: { tabs: ['Copilot', 'On This Device'], active: 'On This Device', rows: ['Example Flash 1.0', 'Qwen Coder', 'Example Vision 7B', 'Example Mini 3B'], focused: 'Qwen Coder', panels: '' },
			updated: {
				tabs: ['Copilot', 'On This Device'], active: 'On This Device', rows: ['Example Flash 1.0', 'Qwen Coder', 'Example Vision 7B', 'Example Mini 3B'], focused: 'Qwen Coder', panels: '',
				states: ['Example Flash 1.0, Active, Effort Level: Medium, Context: 128K, No usage limit', 'Qwen Coder, Loading model…', 'Example Vision 7B, Not downloaded, Downloading 80%', 'Example Mini 3B, Not downloaded, 52.8 GB download'],
			},
			gone: { tabs: false, active: 'Copilot' },
		});
	});

	/** The detail page shown over the list: its heading, the state it gives screen readers, header icons and buttons. */
	function localModelPage(popup: HTMLElement) {
		const page = popup.querySelector<HTMLElement>('.tabbed-action-list-details');
		return page ? {
			label: page.getAttribute('aria-label'),
			name: page.querySelector('.chat-model-card-name')?.textContent,
			state: page.querySelector('.chat-model-card-name')?.getAttribute('aria-description'),
			choices: Array.from(page.querySelectorAll('.chat-local-model-card [role="radiogroup"]'), group => group.getAttribute('aria-label')),
			icons: Array.from(page.querySelectorAll('.chat-model-card-actions .action-label'), action => action.getAttribute('aria-label')),
			buttons: Array.from(page.querySelectorAll('.chat-local-model-card .monaco-button:not([role="radio"])'), button => button.textContent),
			focused: document.activeElement === page,
		} : undefined;
	}

	test('the readout of a selected on-device model opens its family\'s detail page, and Back returns to its row', () => {
		const { popup } = createPicker({ models: [createAutoModel(), model('First'), exampleFlash, qwen], selectedModelId: exampleFlash.identifier, localModels: onDevicePresentation(), details: exampleFlash.identifier });
		const page = localModelPage(popup);
		goBack(popup);
		assert.deepStrictEqual({ page, tab: tabState(popup).active, focused: document.activeElement?.getAttribute('aria-label') }, {
			page: { label: 'Example Flash 1.0 Details', name: 'Example Flash 1.0', state: 'Ready', choices: ['Effort Level', 'Context'], icons: ['Stop Example Flash 1.0', 'Remove Example Flash 1.0...'], buttons: [], focused: true },
			tab: 'On This Device',
			focused: 'Example Flash 1.0 Details, Medium \u00b7 128K',
		});
	});

	test('the detail page sets an on-device model\'s thinking level for the chat, reports it, and its row shows it', async () => {
		const { popup, values, configurationChanges } = createPicker({ models: [createAutoModel(), model('First'), exampleFlash, qwen], selectedModelId: exampleFlash.identifier, localModels: onDevicePresentation(), details: exampleFlash.identifier });
		Array.from(popup.querySelectorAll<HTMLElement>('[aria-label="Effort Level"] [role="radio"]')).find(option => option.textContent === 'High')!.click();
		await timeout(0);
		goBack(popup);
		await timeout(0);
		const row = Array.from(popup.querySelectorAll<HTMLElement>('.chat-model-picker-tabbed .monaco-list-row.action')).find(candidate => candidate.querySelector('.title')?.textContent === exampleFlash.metadata.name);
		assert.deepStrictEqual({
			saved: values.get(exampleFlash.identifier),
			changes: configurationChanges.map(([changed, group, key, from, to]) => [changed.identifier, group, key, from, to]),
			summary: row?.querySelector('.action-list-item-toolbar .action-label')?.textContent,
		}, {
			saved: { thinkingLevel: 'high' },
			changes: [[exampleFlash.identifier, 'navigation', 'thinkingLevel', 'medium', 'high']],
			summary: 'High \u00b7 128K',
		});
	});

	test('a family that needs setup opens its detail page from its row, its Download button or by id, and the picker stays open', () => {
		const { popup, picker, selections } = createPicker({ models: [createAutoModel(), model('First'), exampleFlash, qwen], selectedModelId: model('First').identifier, localModels: onDevicePresentation() });
		picker.openWithFilter({ localModelFamilyId: 'mini' });
		const byId = { tab: tabState(popup).active, page: localModelPage(popup) };
		goBack(popup);
		const row = () => Array.from(popup.querySelectorAll<HTMLElement>('.chat-model-picker-tabbed .monaco-list-row.action')).find(candidate => candidate.querySelector('.title')?.textContent === 'Example Mini 3B')!;
		row().click();
		const byRow = localModelPage(popup)?.name;
		goBack(popup);
		element(row(), '[role="button"][aria-label="Download Example Mini 3B"]').click();
		const byDetails = localModelPage(popup)?.name;
		assert.deepStrictEqual({ byId, byRow, byDetails, visible: picker.isVisible, selections }, {
			byId: { tab: 'On This Device', page: { label: 'Example Mini 3B Details', name: 'Example Mini 3B', state: 'Not set up', choices: [], icons: [], buttons: ['Download'], focused: true } },
			byRow: 'Example Mini 3B',
			byDetails: 'Example Mini 3B',
			visible: true,
			selections: [],
		});
	});

	test('a shown detail page follows its family\'s status and returns to the list when the family is gone', () => {
		const { popup, picker } = createPicker({ models: [...copilotModels, exampleFlash, qwen], selectedModelId: exampleFlash.identifier, localModels: onDevicePresentation() });
		// A model that isn't downloaded: its Download button opens the page.
		element(popup, '[role="button"][aria-label="Download Example Mini 3B"]').click();
		const status = onDeviceStatus();
		const downloading = { ...status, families: status.families.map(family => family.familyId === 'mini' ? { ...family, operation: { id: 'op3', kind: 'setup', state: 'running', resumeOnStartup: true, phase: 'downloading', completedBytes: 10, totalBytes: 100 } as const } : family) };
		picker.setLocalModels(onDevicePresentation(downloading));
		const updated = localModelPage(popup);
		picker.setLocalModels(onDevicePresentation({ ...status, families: status.families.filter(family => family.familyId !== 'mini') }));
		assert.deepStrictEqual({ updated: { state: updated?.state, icons: updated?.icons, buttons: updated?.buttons }, gone: localModelPage(popup), rows: tabState(popup).rows }, {
			updated: { state: 'Downloading 10%', icons: ['Downloading Example Mini 3B 10%, Pause'], buttons: [] },
			gone: undefined,
			rows: ['Example Flash 1.0', 'Qwen Coder', 'Example Vision 7B'],
		});
	});

	for (const { name, routing, requested, expected } of [
		{ name: 'Auto with tiers', routing: [createAutoModel()], requested: 'auto', expected: { model: 'Auto', groups: ['Optimize for'] } },
		{ name: 'Auto without a schema', routing: [model('auto', false)], requested: 'auto', expected: { model: 'auto', groups: [] } },
		{ name: 'HydraFusion as Fusion\'s tier', routing: [createFusionModel(), createHydraFusionModel()], requested: 'hydrafusion', expected: { model: 'Fusion', groups: ['Effort Level'] } },
		{ name: 'HydraFusion with Default and Max', routing: [createAutoModel(), createHydraFusionModel(), createHydraFusionMaxModel()], requested: 'hydrafusion-max', expected: { model: 'HydraFusion', groups: ['HydraFusion tier'] } },
		{ name: 'HydraFusion without HydraFusion Max', routing: [createAutoModel(), createHydraFusionModel()], requested: 'hydrafusion', expected: undefined },
		{ name: 'HydraFusion without an Auto to join', routing: [createHydraFusionModel()], requested: 'hydrafusion', expected: undefined },
	]) {
		test(`${name} ${expected ? `opens ${expected.model}'s Details` : 'has no Details'} from the chat input, the list, and search`, () => {
			const { picker, popup, anchor, context, selections } = createPicker({ models: [...routing, ...models], details: `copilot/${requested}` });
			const details = () => {
				const page = popup.querySelector('.tabbed-action-list-details');
				return page ? {
					dialog: page.getAttribute('aria-label'),
					model: page.querySelector('.chat-model-card-name')?.textContent,
					groups: Array.from(page.querySelectorAll('[role="radiogroup"]'), group => group.getAttribute('aria-label')),
				} : undefined;
			};
			const direct = details();
			if (direct) {
				goBack(popup);
			}
			const label = expected?.model ?? 'HydraFusion';
			const listAction = !!popup.querySelector(`[aria-label^="${label} Details"]`);
			element(popup, '[data-id="search"]').click();
			const input = popup.querySelector<HTMLInputElement>('input')!;
			input.value = label;
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			const searchAction = !!popup.querySelector(`[aria-label^="${label} Details"]`);
			picker.hide();
			picker.show(anchor, context, `copilot/${requested}`, true);
			const expectedDetails = expected && { dialog: `${expected.model} Details`, ...expected };
			assert.deepStrictEqual({ direct, listAction, searchAction, reopened: details(), selections }, {
				direct: expectedDetails, listAction: !!expected, searchAction: !!expected, reopened: expectedDetails, selections: [],
			});
		});
	}

	test('a Fusion tier controlled by a read-only schema cannot be changed, but Max can still be chosen', async () => {
		const fusion = createFusionModel();
		const max = createHydraFusionMaxModel();
		const result = createPicker({
			models: [{ ...fusion, metadata: { ...fusion.metadata, configurationSchema: { properties: { tier: { ...fusion.metadata.configurationSchema!.properties!.tier, readOnly: true } } } } }, createHydraFusionModel(), max, ...models],
		});
		openDetails(result.popup, 'Fusion');
		const disabled = Array.from(result.popup.querySelectorAll('.tabbed-action-list-details [role="radio"]'), option => option.getAttribute('aria-disabled') === 'true');
		chooseOption(result.popup, 'Standard');
		await timeout(0);
		const saved = result.values.get(fusion.identifier);
		chooseOption(result.popup, 'Max');
		await timeout(0);
		assert.deepStrictEqual({ disabled, saved, selections: result.selections }, {
			disabled: [true, true, false], saved: undefined, selections: [max.identifier],
		});
	});

	test('configuration readouts are visible for the current model and keyboard focus, not pointer-only focus', () => {
		const { popup } = createPicker({ models: models.slice(0, 2) });
		const widget = element(popup, '.chat-model-picker-widget');
		const current = element(popup, '[aria-label^="First Details"]');
		const other = element(popup, '[aria-label^="Second Details"]');
		const visibility = (button: HTMLElement) => dom.getWindow(button).getComputedStyle(button).visibility;
		const initial = { current: visibility(current), other: visibility(other) };
		other.closest('.monaco-list-row')!.classList.add('focused');
		const pointerFocus = visibility(other);
		widget.classList.add('keyboard-navigation');
		const keyboardFocus = visibility(other);
		widget.classList.remove('keyboard-navigation');
		assert.deepStrictEqual({ initial, pointerFocus, keyboardFocus, afterKeyboard: visibility(other) }, {
			initial: { current: 'visible', other: 'hidden' },
			pointerFocus: 'hidden',
			keyboardFocus: 'visible',
			afterKeyboard: 'hidden',
		});
	});

	test('all rows offer effective values as a configuration button without selecting the model', () => {
		const unknown = model('Unknown', false);
		const result = createPicker({
			models: [...models, {
				...unknown, metadata: { ...unknown.metadata, maxContextWindowTokens: undefined, maxInputTokens: 0, maxOutputTokens: 0 },
			}]
		});
		const rows = Array.from(result.popup.querySelectorAll('.chat-model-picker-model'), row => ({
			name: row.querySelector('.title')?.textContent,
			summary: row.querySelector('.action-label')?.textContent,
			details: row.querySelector('.action-label')?.getAttribute('aria-label'),
			infoIcon: !!row.querySelector('.action-list-item-toolbar .codicon-info'),
		}));
		openDetails(result.popup, 'Unknown');
		assert.deepStrictEqual({
			rows,
			selections: result.selections,
			information: result.popup.querySelector('.chat-model-card-description')?.textContent?.trim(),
			settings: result.popup.querySelectorAll('.tabbed-action-list-details [role="radiogroup"]').length,
			hoverPanels: result.popup.querySelectorAll('.chat-model-card-panel').length,
		}, {
			rows: [
				{ name: 'First', summary: 'Low · 32K', details: 'First Details, Low · 32K', infoIcon: false },
				{ name: 'Fixed', summary: '200K', details: 'Fixed Details, 200K', infoIcon: false },
				{ name: 'Second', summary: 'Low · 32K', details: 'Second Details, Low · 32K', infoIcon: false },
				{ name: 'Unknown', summary: 'Details', details: 'Unknown Details', infoIcon: false },
			],
			selections: [], information: 'Model information.', settings: 0, hoverPanels: 0,
		});
	});

	for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
		test(`the configuration readout opens with ${key === ' ' ? 'Space' : key} and restores focus on Back`, async () => {
			const { popup, selections } = createPicker();
			const button = element(popup, '[role="button"][aria-label^="First Details"]');
			button.focus();
			button.dispatchEvent(new KeyboardEvent('keyup', { key: 'Tab', keyCode: 9, bubbles: true }));
			button.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
			button.dispatchEvent(new KeyboardEvent('keyup', { key, keyCode, bubbles: true }));
			await timeout(0);
			const focusedControl = document.activeElement?.closest('[role="radiogroup"]')?.getAttribute('aria-label');
			goBack(popup);
			assert.deepStrictEqual({
				focusedControl,
				restoredFocus: document.activeElement?.getAttribute('aria-label'),
				selections,
			}, { focusedControl: 'Effort Level', restoredFocus: 'First Details, Low · 32K', selections: [] });
		});
	}

	test('direct details retain the configuration warning and a working Back action', () => {
		const result = createPicker({ details: models[0].identifier, cacheWarm: true });
		const warning = result.popup.querySelector('.chat-model-picker-configuration-hint')?.textContent;
		element(result.popup, '[aria-label="Dismiss Hint"]').click();
		goBack(result.popup);
		assert.deepStrictEqual({
			warning, dismissed: result.hintDismissed, visible: result.picker.isVisible,
			details: !!result.popup.querySelector('.tabbed-action-list-details'), selections: result.selections,
		}, { warning: 'Changing options resets the prompt cache.', dismissed: true, visible: true, details: false, selections: [] });
	});

	for (const focusReadout of [false, true]) {
		test(`Back stays open when an unselected model's readout is hidden${focusReadout ? ' after keyboard entry' : ''}`, async () => {
			const { picker, popup, selections } = createPicker();
			const list = element(popup, '.monaco-list');
			if (focusReadout) {
				for (let i = 0; i < 2; i++) {
					list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
				}
				element(popup, '[aria-label^="Second Details"]').focus();
			}
			openDetails(popup, 'Second');
			element(popup, '[aria-label^="Second Details"]').style.visibility = 'hidden';
			const back = element(popup, '[role="button"][aria-label^="Back to Models"]');
			back.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
			back.click();
			await timeout(0);
			assert.deepStrictEqual({ visible: picker.isVisible, listFocused: document.activeElement === list, selections }, {
				visible: true, listFocused: true, selections: [],
			});
		});
	}

	test('the fixed details header combines icon-only Back, model name, and model actions', () => {
		const result = createPicker({ details: models[0].identifier });
		const header = element(result.popup, '.tabbed-action-list-details-header');
		const viewport = element(result.popup, '.tabbed-action-list-details-viewport');
		const back = element(header, '[role="button"][aria-label^="Back to Models"]');
		assert.deepStrictEqual({
			backText: back.textContent,
			backIcon: back.classList.contains('codicon-arrow-left'),
			iconAction: !!back.closest('.monaco-action-bar'),
			model: header.querySelector('.chat-model-card-name')?.textContent,
			pin: !!header.querySelector('[aria-label="Pin Model"]'),
			headerInViewport: viewport.contains(header),
			bodyHeadings: viewport.querySelectorAll('.chat-model-card-header').length,
		}, { backText: '', backIcon: true, iconAction: true, model: 'First', pin: true, headerInViewport: false, bodyHeadings: 0 });
	});

	for (const model of [models[0], models[1]]) {
		test(`${model.metadata.name} details omit redundant selection copy without selecting the model`, () => {
			const result = createPicker({ details: model.identifier });
			const card = element(result.popup, '.chat-model-card');
			assert.deepStrictEqual({
				currentModelCopy: card.textContent?.includes('Current model'),
				selectionHint: card.textContent?.includes('Changing options selects this model.'),
				groups: Array.from(card.querySelectorAll('[role="radiogroup"]'), group => group.getAttribute('aria-label')),
				selections: result.selections,
			}, { currentModelCopy: false, selectionHint: false, groups: ['Effort Level', 'Context'], selections: [] });
		});
	}

	test('Right Arrow opens a model\'s details on its configuration and Back returns to its row', async () => {
		const { picker, popup, selections } = createPicker();
		const list = element(popup, '.monaco-list');
		const detailsButton = element(popup, '[role="button"][aria-label^="First Details"]');
		const rowPopup = detailsButton.closest('.monaco-list-row')?.getAttribute('aria-haspopup');
		const right = new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true, cancelable: true });
		list.dispatchEvent(right);
		const opened = {
			prevented: right.defaultPrevented,
			model: popup.querySelector('.tabbed-action-list-details .chat-model-card-name')?.textContent,
			focusedControl: document.activeElement?.closest('[role="radiogroup"]')?.getAttribute('aria-label'),
		};
		goBack(popup);
		await timeout(0);
		assert.deepStrictEqual({
			hasPopup: { row: rowPopup, button: detailsButton.getAttribute('aria-haspopup') },
			opened,
			listFocused: document.activeElement === element(popup, '.monaco-list'),
			focusedRow: popup.querySelector('.monaco-list-row.focused .title')?.textContent,
			visible: picker.isVisible,
			selections,
		}, {
			hasPopup: { row: 'dialog', button: 'dialog' },
			opened: { prevented: true, model: 'First', focusedControl: 'Effort Level' },
			listFocused: true,
			focusedRow: 'First',
			visible: true,
			selections: [],
		});
	});

	for (const direct of [false, true]) {
		test(`hovering Back preserves focus after ${direct ? 'direct' : 'configuration readout'} details entry`, () => {
			const result = createPicker({ details: direct ? models[0].identifier : undefined });
			if (!direct) {
				openDetails(result.popup, 'First');
			}
			const page = element(result.popup, '.tabbed-action-list-details');
			const back = element(page, '[role="button"][aria-label^="Back to Models"]');
			back.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
			back.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementX: 1 }));
			assert.deepStrictEqual({
				pageFocused: document.activeElement === page,
				focusedControl: document.activeElement?.closest('[role="radiogroup"]')?.getAttribute('aria-label'),
				selections: result.selections,
			}, { pageFocused: direct, focusedControl: direct ? undefined : 'Effort Level', selections: [] });
		});
	}

	test('configuration stays visible beside a promotion without repeating the discount', () => {
		const base = model('Promo');
		const promotional = { ...base, metadata: { ...base.metadata, promo: { id: 'offer', discountPercent: 25, message: 'Temporary offer.' } } };
		const result = createPicker({ models: [promotional] });
		assert.deepStrictEqual({
			badge: result.popup.querySelector('.chat-model-picker-model .action-item-badge')?.textContent,
			summary: result.popup.querySelector('.chat-model-picker-model .action-label')?.textContent,
		}, { badge: '25% off', summary: 'Low · 32K' });
	});

	test('pinning and configuration refresh the page without moving focus into the hidden list', async () => {
		const result = createPicker();
		openDetails(result.popup, 'Second');
		const high = element(result.popup, '.chat-model-card [role="radiogroup"] [role="radio"]:last-child');
		high.focus();
		high.click();
		await timeout(0);
		const settingFocused = document.activeElement?.getAttribute('role') === 'radio';
		const pin = element(result.popup, '.chat-model-card-header [aria-label="Pin Model"]');
		pin.focus();
		pin.click();
		await timeout(0);
		const pinFocused = document.activeElement?.getAttribute('aria-label');
		goBack(result.popup);
		await timeout(0);
		assert.deepStrictEqual({
			selections: result.selections, values: result.values.get(models[1].identifier), pins: result.pins,
			settingFocused, pinFocused, restoredFocus: document.activeElement?.getAttribute('aria-label'),
		}, {
			selections: [models[1].identifier], values: { effort: 'high' }, pins: [models[1].identifier],
			settingFocused: true, pinFocused: 'Unpin Model', restoredFocus: 'Second Details, High · 32K',
		});
	});

	test('leaving details prevents a late save from changing the selected model', async () => {
		const pending = new DeferredPromise<void>();
		const writes: string[] = [];
		const result = createPicker({
			access: {
				getModelConfiguration: () => ({}),
				getModelConfigurationActions: () => [],
				setModelConfiguration: async id => { writes.push(id); await pending.p; },
			}
		});
		openDetails(result.popup, 'Second');
		element(result.popup, '.chat-model-card [role="radiogroup"] [role="radio"]:last-child').click();
		await timeout(0);
		goBack(result.popup);
		result.picker.setSelectedModel(models[2].identifier);
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ writes, selections: result.selections, details: !!result.popup.querySelector('.tabbed-action-list-details') }, {
			writes: [models[1].identifier], selections: [], details: false,
		});
	});

	test('saves stay serialized across close and reopen', async () => {
		const pending = new DeferredPromise<void>();
		const writes: string[] = [];
		const result = createPicker({
			access: {
				getModelConfiguration: () => ({}),
				getModelConfigurationActions: () => [],
				setModelConfiguration: async (_id, values) => {
					writes.push(String(values.effort));
					if (writes.length === 1) {
						await pending.p;
					}
				},
			}
		});
		openDetails(result.popup, 'Second');
		element(result.popup, '.chat-model-card [role="radiogroup"] [role="radio"]:last-child').click();
		await timeout(0);
		result.picker.hide();
		result.picker.show(result.anchor, result.context, models[1].identifier);
		element(result.popup, '.chat-model-card [role="radiogroup"] [role="radio"]:last-child').click();
		await timeout(0);
		const before = [...writes];
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ before, writes, selections: result.selections }, {
			before: ['high'], writes: ['high', 'high'], selections: [models[1].identifier],
		});
	});

	test('live scoped values refresh Auto\'s Details and its readout', () => {
		const auto = model('auto');
		const result = createPicker({ models: [auto, ...models], details: auto.identifier });
		result.values.set(auto.identifier, { effort: 'high' });
		result.changed.fire(auto.identifier);
		const tier = result.popup.querySelector('.tabbed-action-list-details [role="radio"][aria-checked="true"]')?.textContent;
		goBack(result.popup);
		assert.deepStrictEqual({
			tier,
			readout: element(result.popup, '[aria-label^="auto Details"]').textContent,
			visible: result.picker.isVisible, selections: result.selections,
		}, { tier: 'High', readout: 'High · 32K', visible: true, selections: [] });
	});

	test('cached details reread configuration and reset state after returning to the list', () => {
		const currentModel = models[0];
		const result = createPicker({ details: currentModel.identifier });
		const card = element(result.popup, '.chat-model-card');
		goBack(result.popup);

		const reopen = (configuration: IStringDictionary<unknown>) => {
			result.values.set(currentModel.identifier, configuration);
			result.changed.fire(currentModel.identifier);
			const row = Array.from(result.popup.querySelectorAll('.chat-model-picker-model')).find(row => row.querySelector('.title')?.textContent === currentModel.metadata.name)!;
			const summary = row.querySelector('.action-label')?.textContent;
			openDetails(result.popup, currentModel.metadata.name);
			const state = {
				sameCard: element(result.popup, '.chat-model-card') === card,
				summary,
				selected: Array.from(card.querySelectorAll('[role="radio"][aria-checked="true"]'), option => option.textContent),
				reset: !!result.popup.querySelector('[aria-label="Reset to Default"]'),
			};
			goBack(result.popup);
			return state;
		};

		assert.deepStrictEqual({
			configured: reopen({ effort: 'high', context: 64000 }),
			defaults: reopen({}),
			selections: result.selections,
		}, {
			configured: { sameCard: true, summary: 'High · 64K', selected: ['High', '64K'], reset: true },
			defaults: { sameCard: true, summary: 'Low · 32K', selected: ['Low', '32K'], reset: false },
			selections: [],
		});
	});

	test('cached details reread scoped schema defaults before reopening', () => {
		const currentModel = models[0];
		const providerSchema = currentModel.metadata.configurationSchema!;
		let schema = providerSchema;
		const changed = disposables.add(new Emitter<string>());
		const result = createPicker({
			details: currentModel.identifier,
			access: {
				getModelConfiguration: () => undefined,
				getModelConfigurationSchema: () => schema,
				getModelConfigurationActions: () => [],
				setModelConfiguration: async () => { },
				onDidChange: changed.event,
			},
		});
		goBack(result.popup);
		schema = {
			properties: {
				effort: { ...providerSchema.properties!.effort, default: 'high' },
				context: { ...providerSchema.properties!.context, default: 64000 },
			},
		};
		changed.fire(currentModel.identifier);
		openDetails(result.popup, currentModel.metadata.name);
		assert.deepStrictEqual({
			selected: Array.from(result.popup.querySelectorAll('.chat-model-card [role="radio"][aria-checked="true"]'), option => option.textContent),
			reset: !!result.popup.querySelector('[aria-label="Reset to Default"]'),
			providerDefaults: [providerSchema.properties!.effort.default, providerSchema.properties!.context.default],
			selections: result.selections,
		}, { selected: ['High', '64K'], reset: false, providerDefaults: ['low', 32000], selections: [] });
	});

	test('removing the inspected model returns to the remaining list', () => {
		const result = createPicker({ details: models[1].identifier });
		result.picker.refresh([models[0]]);
		assert.deepStrictEqual({
			visible: result.picker.isVisible, details: !!result.popup.querySelector('.tabbed-action-list-details'), selections: result.selections,
		}, { visible: true, details: false, selections: [] });
	});

	test('removing a speed variant updates the mounted page instead of retaining an unavailable choice', () => {
		const standard = model('test-model');
		const fast = model('test-model-fast');
		const result = createPicker({ models: [standard, fast], details: fast.identifier });
		const card = element(result.popup, '.chat-model-card');
		const before = card.querySelectorAll('[aria-label="Speed"]').length;
		result.picker.refresh([fast]);
		assert.deepStrictEqual({
			before,
			sameCard: result.popup.querySelector('.chat-model-card') === card,
			speed: card.querySelectorAll('[aria-label="Speed"]').length,
			name: result.popup.querySelector('.chat-model-card-name')?.textContent,
		}, { before: 1, sameCard: true, speed: 0, name: fast.metadata.name });
	});

	test('pending writes retain their originating scope when the picker is reopened for another scope', async () => {
		const pending = new DeferredPromise<void>();
		const firstValues: IStringDictionary<unknown> = {};
		const secondValues: IStringDictionary<unknown> = {};
		const result = createPicker({
			access: {
				getModelConfiguration: () => firstValues,
				getModelConfigurationActions: () => [],
				setModelConfiguration: async (_id, values) => {
					await pending.p;
					Object.assign(firstValues, values);
				},
			}
		});
		openDetails(result.popup, 'Second');
		element(result.popup, '.chat-model-card [role="radiogroup"] [role="radio"]:last-child').click();
		await timeout(0);
		result.picker.hide();
		result.picker.show(result.anchor, {
			...result.context,
			configurationAccess: {
				getModelConfiguration: () => secondValues,
				getModelConfigurationActions: () => [],
				setModelConfiguration: async (_id, values) => { Object.assign(secondValues, values); },
			},
		}, models[1].identifier);
		element(result.popup, '.chat-model-card [aria-label="Context"] [role="radio"]:last-child').click();
		await timeout(0);
		const before = { first: { ...firstValues }, second: { ...secondValues } };
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({ before, firstValues, secondValues, selections: result.selections }, {
			before: { first: {}, second: { context: 64000 } },
			firstValues: { effort: 'high' }, secondValues: { context: 64000 }, selections: [models[1].identifier],
		});
	});
});
