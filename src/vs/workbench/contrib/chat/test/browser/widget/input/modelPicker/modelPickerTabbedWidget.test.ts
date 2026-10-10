/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { Codicon } from '../../../../../../../../base/common/codicons.js';
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
import { IConfigurationChangeEvent, IConfigurationService, IConfigurationValue } from '../../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IContextViewDelegate, IContextViewService } from '../../../../../../../../platform/contextview/browser/contextView.js';
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
import { ChatConfiguration } from '../../../../../common/constants.js';
import { IModelPickerWorkflow, IModelPickerWorkflowState } from '../../../../../browser/widget/input/modelPicker/modelPickerWorkflow.js';
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
	return { ...hydra, metadata: { ...hydra.metadata, name: 'HydraFusion', detail: 'Research preview', tooltip: 'HydraFusion routes the first eligible turn and may use multiple models. Premium usage varies with the selected route.' } };
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
		policyDefault?: string;
		userDefault?: string;
		selectedModelId?: string;
		pinnedModelIds?: string[];
		controlModels?: IStringDictionary<IModelControlEntry>;
		controlManifest?: IModelsControlManifest;
		entitlement?: ChatEntitlement;
		showUnavailable?: boolean;
		providerPlaceholders?: ITabbedModelPickerContext['providerPlaceholders'];
		beforeSave?: (values: IStringDictionary<unknown>) => Promise<void>;
		workflow?: IModelPickerWorkflow;
	} = {}) {
		const container = dom.append(document.body, dom.$('.monaco-workbench.monaco-reduce-motion'));
		container.style.cssText = '--vscode-spacing-size60: 6px; --vscode-spacing-size280: 28px;';
		disposables.add(toDisposable(() => container.remove()));
		const anchorContainer = options.inDialog ? dom.append(container, dom.$('.monaco-dialog-box')) : container;
		const anchor = dom.append(anchorContainer, dom.$('button'));
		anchor.style.cssText = `position: fixed; ${options.anchorTop !== undefined ? `top: ${options.anchorTop}` : 'bottom: 20px'}; left: 20px; width: 120px; height: 22px;`;
		const popup = dom.append(container, dom.$('div'));
		const render = disposables.add(new MutableDisposable());
		let activeDelegate: IContextViewDelegate | undefined;
		const contextView = upcastPartial<IContextViewService>({
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
		instantiationService.set(IKeybindingService, new MockKeybindingService());
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
			workflow: options.workflow,
			models: availableModels, selectedModelId: options.selectedModelId ?? availableModels[0]?.identifier,
			recentModelIds: [], pinnedModelIds: options.pinnedModelIds ?? [],
			controlModels: options.controlModels ?? Object.fromEntries(availableModels.map(model => [model.metadata.id, { exists: true, featured: true, label: model.metadata.name }])),
			configurationAccess: access, isUBB: false, showManageModels: false, providerPlaceholders: options.providerPlaceholders ?? [],
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

	test('guided selection keeps the popup open, excludes routing, and exposes accessible navigation', () => {
		const attempts: IModelPickerWorkflowState = {
			title: 'Attempts', description: 'Select models.', summary: '2 Attempts', selectedModelIds: [],
			multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false,
		};
		const state = observableValue<IModelPickerWorkflowState | undefined>('workflow', undefined);
		let finished = false;
		const workflow: IModelPickerWorkflow = {
			available: constObservable(true), summary: constObservable(undefined), state, label: 'Compare Models',
			start: () => state.set(attempts, undefined),
			cancel: () => state.set(undefined, undefined),
			reset: () => state.set(undefined, undefined),
			select: id => state.set({ ...state.get()!, selectedModelIds: [id], canGoNext: true, canFinish: false, count: state.get()?.multiple ? { label: 'Number of Runs', value: 2, min: 2, max: 10 } : undefined }, undefined),
			setCount: () => { },
			back: () => state.set(attempts, undefined),
			next: () => state.set({ ...attempts, title: state.get()?.title === 'Judge' ? 'Synthesizer' : 'Judge', description: 'Optional review.', multiple: false, canGoBack: true, canFinish: true }, undefined),
			finish: () => finished = true,
		};
		const { popup, picker, selections } = createPicker({ models: [createAutoModel(), createHydraFusionModel(), ...models], workflow });
		element(popup, '[aria-label="Compare Models"]').click();
		// Counted from the set size, since a short popup may scroll some choices out of view.
		const offered = (role: string) => Number(popup.querySelector(`[role="${role}"]`)?.getAttribute('aria-setsize') ?? 0);
		assert.deepStrictEqual({
			heading: popup.querySelector('.action-list-header-text')?.textContent,
			routing: listRows(popup).some(label => label === 'Auto' || label === 'HydraFusion'),
			checks: offered('menuitemcheckbox'),
		}, { heading: 'Attempts\nSelect models.', routing: false, checks: 3 });
		const list = element(popup, '.monaco-list');
		list.focus();
		list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
		const buttons = () => [...popup.querySelectorAll<HTMLElement>('.model-picker-workflow-actions .monaco-button')];
		assert.deepStrictEqual({
			visible: picker.isVisible, selected: selectedModels(popup).length, selections,
			count: popup.querySelector('select')?.getAttribute('aria-label'),
			buttons: buttons().map(button => button.textContent?.trim()),
		}, { visible: true, selected: 1, selections: [], count: 'Number of Runs', buttons: ['Cancel', 'Next'] });
		buttons()[1].click();
		assert.deepStrictEqual({
			heading: popup.querySelector('.action-list-header-text')?.textContent,
			buttons: buttons().map(button => button.textContent?.trim()),
			radios: offered('menuitemradio'),
			checkboxes: popup.querySelectorAll('[role="menuitemcheckbox"]').length,
		}, { heading: 'Judge\nOptional review.', buttons: ['Cancel', 'Back', 'Done'], radios: 3, checkboxes: 0 });
		element(popup, '.chat-model-picker-model').click();
		buttons()[2].click();
		assert.deepStrictEqual({
			heading: popup.querySelector('.action-list-header-text')?.textContent,
			radios: offered('menuitemradio'),
			cancel: buttons()[0].textContent?.trim(),
		}, { heading: 'Synthesizer\nOptional review.', radios: 3, cancel: 'Cancel' });
		buttons()[1].click();
		assert.ok(popup.querySelector('.action-list-header-text')?.textContent?.startsWith('Attempts'));
		element(popup, '.chat-model-picker-model').click();
		buttons()[1].click();
		buttons()[2].click();
		assert.deepStrictEqual({ finished, visible: picker.isVisible, selections }, { finished: true, visible: false, selections: [] });
	});

	for (const committed of [false, true]) {
		for (const dismissal of ['Escape', 'click-away', 'Cancel'] as const) {
			test(`${dismissal} cancels working selections without changing ${committed ? 'committed comparison' : 'single-model'} state`, () => {
				const state = observableValue<IModelPickerWorkflowState | undefined>('draft', undefined);
				const summary = constObservable(committed ? '2 Attempts' : undefined);
				let cancelled = 0;
				const workflow: IModelPickerWorkflow = {
					available: constObservable(true), summary, state, label: 'Compare Models',
					start: () => state.set({
						title: 'Attempts', description: 'Select models.', summary: '2 Attempts', selectedModelIds: committed ? [models[0].identifier] : [],
						multiple: true, maxSelections: 10, canGoBack: false, canGoNext: false, canFinish: false,
					}, undefined),
					cancel: () => { cancelled++; state.set(undefined, undefined); },
					reset: () => assert.fail('Dismissal must not reset committed state'),
					select: id => state.set({ ...state.get()!, selectedModelIds: [id] }, undefined),
					back: () => { }, next: () => { }, setCount: () => { },
					finish: () => assert.fail('Dismissal must not commit'),
				};
				const { picker, popup, anchor, context, dismiss, selections } = createPicker({ workflow });
				if (!committed) {
					element(popup, '[aria-label="Compare Models"]').click();
				}
				element(popup, '.chat-model-picker-model').click();
				if (dismissal === 'Cancel') {
					element(popup, '.model-picker-workflow-actions .monaco-button').click();
				} else if (dismissal === 'Escape') {
					element(popup, '.monaco-list').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
				} else {
					dismiss();
				}
				const closed = { visible: picker.isVisible, state: state.get(), cancelled, selections, summary: workflow.summary.get() };
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
		test(`workflow selections preserve typed search text and focused model with ${clickSelection ? 'mouse' : 'keyboard'} selection`, () => {
			const state = observableValue<IModelPickerWorkflowState | undefined>('workflow', undefined);
			const workflow: IModelPickerWorkflow = {
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
			};
			const result = createPicker({ workflow });
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
			unmanagedDetails: null, focusedControl: 'Thinking Effort', unmanaged: [], selections: [],
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

	/** The labels of the options in the open details' "Optimize for" control. */
	function autoTiers(popup: HTMLElement): string[] {
		return Array.from(popup.querySelectorAll('.tabbed-action-list-details [role="radiogroup"][aria-label="Optimize for"] [role="radio"]'), option => option.textContent ?? '');
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

	test('HydraFusion without an Auto to join shows its description and Learn more under its own entry, without a flyout', () => {
		const auto = model('auto', false);
		const hydra = createHydraFusionModel();
		const result = createPicker({ models: [auto, hydra, ...models], selectedModelId: auto.identifier });
		const leading = listRows(result.popup).slice(0, 2);
		const row = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-picker-routing-model'))
			.find(row => row.querySelector('.title')?.textContent === 'HydraFusion');
		assert.ok(row);
		// A large font stands in for a long translation, which must shorten the text rather than hide the link.
		result.popup.style.cssText = '--vscode-fontSize-label2: 16px; --vscode-spacing-size160: 16px; --vscode-spacing-size200: 20px;';
		const detail = element(row, '.detail');
		const link = element(detail, '.monaco-link');
		const detailBounds = detail.getBoundingClientRect();
		const linkBounds = link.getBoundingClientRect();
		const snapshot = {
			leading,
			detail: detail.lastChild?.textContent,
			link: link.textContent,
			ariaLabel: row.getAttribute('aria-label'),
			chevron: !!row.querySelector('.action-list-submenu-indicator.has-submenu'),
			truncated: detail.scrollHeight > detail.clientHeight,
			linkEndsLastLine: Math.abs(linkBounds.bottom - detailBounds.bottom) <= 0.5 && Math.abs(linkBounds.right - detailBounds.right) <= 0.5,
		};
		row.click();
		assert.deepStrictEqual({ ...snapshot, selections: result.selections }, {
			leading: ['auto', 'HydraFusion'],
			detail: 'Picks a workflow per task, using one or more models to draft, review, or escalate.',
			link: 'Learn more',
			ariaLabel: 'HydraFusion, Research preview, Picks a workflow per task, using one or more models to draft, review, or escalate.',
			chevron: false,
			truncated: true,
			linkEndsLastLine: true,
			selections: [hydra.identifier],
		});
	});

	test('HydraFusion is Auto\'s last tier and describes itself as a research preview once chosen', async () => {
		const auto = createAutoModel();
		const hydra = createHydraFusionModel();
		const result = createPicker({ models: [...models, auto, hydra], selectedModelId: models[0].identifier });
		const autoRow = () => {
			const row = Array.from(result.popup.querySelectorAll('.chat-model-picker-model')).find(row => row.querySelector('.title')?.textContent === 'Auto')!;
			const badge = row.querySelector<HTMLElement>('.action-item-badge');
			return { checked: row.getAttribute('aria-checked'), readout: row.querySelector('.action-label')?.textContent, badge: badge?.style.display === 'none' ? undefined : badge?.textContent };
		};
		const description = () => {
			const element = result.popup.querySelector<HTMLElement>('.chat-model-card-alternative-description');
			return element && !element.hidden ? element.textContent : undefined;
		};
		const list = { rows: listRows(result.popup), auto: autoRow() };
		openDetails(result.popup, 'Auto');
		const headerBadge = () => result.popup.querySelector('.chat-model-card-header .chat-model-card-badge')?.textContent;
		const discount = () => {
			const element = result.popup.querySelector<HTMLElement>('.chat-model-card-discount-description');
			return element && !element.hidden ? element.textContent : undefined;
		};
		const tiers = {
			options: autoTiers(result.popup), description: description(), badge: headerBadge(), discount: discount(),
			above: result.popup.querySelector('.tabbed-action-list-details .chat-model-card > .chat-model-card-description')?.textContent,
		};
		chooseOption(result.popup, 'HydraFusion');
		await timeout(0);
		const chosen = {
			model: result.popup.querySelector('.tabbed-action-list-details .chat-model-card-name')?.textContent,
			active: result.popup.querySelector('.tabbed-action-list-details [role="radio"][aria-checked="true"]')?.textContent,
			description: description(),
			learnMore: !!result.popup.querySelector('.chat-model-card-alternative-description a'),
			badge: headerBadge(),
			discount: discount(),
			ariaLabel: result.popup.querySelector('.tabbed-action-list-details [role="radio"][aria-checked="true"]')?.getAttribute('aria-label'),
		};
		goBack(result.popup);
		const listWithHydraFusion = autoRow();
		// Auto stands for its HydraFusion tier, so picking it again keeps HydraFusion.
		selectRow(result.popup, 'Auto');
		reopen(result);
		const reopenedWithHydraFusion = autoRow();
		openDetails(result.popup, 'Auto');
		chooseOption(result.popup, 'Efficiency');
		await timeout(0);
		const returned = { description: description(), values: result.values.get(auto.identifier), badge: headerBadge(), discount: discount() };
		goBack(result.popup);
		const listWithAuto = autoRow();
		assert.deepStrictEqual({ list, tiers, chosen, listWithHydraFusion, reopenedWithHydraFusion, returned, listWithAuto, selections: result.selections }, {
			list: { rows: ['Auto', '--', 'First', 'Fixed', 'Second'], auto: { checked: 'false', readout: 'Balance', badge: '10% discount' } },
			tiers: {
				options: ['Efficiency', 'Balance', 'Intelligence', 'HydraFusion'], description: undefined, badge: '10% discount',
				discount: 'Models routed via Auto Balance receive a 10% discount.',
				above: 'Auto routes based on your task and real-time system health and model performance. Learn More',
			},
			chosen: {
				model: 'Auto', active: 'HydraFusion', learnMore: true,
				description: 'HydraFusion is a research preview. Learn more',
				badge: 'Research preview',
				discount: undefined,
				ariaLabel: 'HydraFusion, HydraFusion is a research preview. It picks a workflow per task, using one or more models to draft, review, or escalate.',
			},
			listWithHydraFusion: { checked: 'true', readout: 'HydraFusion', badge: 'Research preview' },
			reopenedWithHydraFusion: { checked: 'true', readout: 'HydraFusion', badge: 'Research preview' },
			returned: { description: undefined, values: { tier: 'efficiency' }, badge: '10% discount', discount: 'Models routed via Auto Efficiency receive a 10% discount.' },
			listWithAuto: { checked: 'true', readout: 'Efficiency', badge: '10% discount' },
			selections: [hydra.identifier, auto.identifier],
		});
	});

	/** Reopens the picker on the latest selection, as the chat input does. */
	function reopen(result: ReturnType<typeof createPicker>): void {
		result.picker.show(result.anchor, { ...result.context, selectedModelId: result.selections.at(-1) ?? result.context.selectedModelId });
	}

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

	test('Auto leads only the Copilot tab, and search still finds HydraFusion', () => {
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
			initial: { rows: ['Auto', '--', 'First', 'Fixed', 'Second'], selected: ['First'], defaults: ['Auto'] },
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
			const result = createPicker({
				models: [auto, hydra, ...models],
				selectedModelId: auto.identifier,
				entitlement,
				showUnavailable: false,
				controlModels: {},
			});
			result.picker.refresh([auto, hydra, ...models]);
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
		openDetails(result.popup, 'Auto');
		const before = autoTiers(result.popup);
		goBack(result.popup);
		result.setEntitlement(ChatEntitlement.Free);
		const unavailableHydra = element(result.popup, '.chat-model-picker-unavailable');
		assert.deepStrictEqual({
			before,
			label: unavailableHydra.querySelector('.title')?.textContent,
			upgrade: unavailableHydra.textContent?.includes('Upgrade'),
			selected: selectedModels(result.popup),
			selections: result.selections,
		}, {
			before: ['Efficiency', 'Balance', 'Intelligence', 'HydraFusion'],
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
		const before = element(result.popup, '[aria-label^="Auto Details"]').textContent;
		result.setEntitlement(ChatEntitlement.Free);
		assert.deepStrictEqual({
			before,
			upgrade: element(result.popup, '.chat-model-picker-unavailable').textContent?.includes('Upgrade'),
			selected: selectedModels(result.popup),
			after: element(result.popup, '[aria-label^="Auto Details"]').textContent,
			selections: result.selections,
		}, {
			before: 'HydraFusion',
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

	for (const { name, routing, requested, expected } of [
		{ name: 'Auto with tiers', routing: [createAutoModel()], requested: 'auto', expected: { model: 'Auto', groups: ['Optimize for'] } },
		{ name: 'Auto without a schema', routing: [model('auto', false)], requested: 'auto', expected: { model: 'auto', groups: [] } },
		{ name: 'HydraFusion as Auto\'s tier', routing: [createAutoModel(), createHydraFusionModel()], requested: 'hydrafusion', expected: { model: 'Auto', groups: ['Optimize for'] } },
		{ name: 'HydraFusion without an Auto to join', routing: [createHydraFusionModel()], requested: 'hydrafusion', expected: undefined },
	]) {
		test(`${name} ${expected ? 'opens Auto\'s Details' : 'has no Details'} from the chat input, the list, and search`, () => {
			const { picker, popup, anchor, context, selections } = createPicker({ models: [...routing, ...models], details: `copilot/${requested}` });
			const details = () => {
				const page = popup.querySelector('.tabbed-action-list-details');
				return page ? {
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
			assert.deepStrictEqual({ direct, listAction, searchAction, reopened: details(), selections }, {
				direct: expected, listAction: !!expected, searchAction: !!expected, reopened: expected, selections: [],
			});
		});
	}

	test('an Auto tier controlled by a read-only schema cannot be changed, but HydraFusion can still be chosen', async () => {
		const auto = createAutoModel();
		const hydra = createHydraFusionModel();
		const result = createPicker({
			models: [{ ...auto, metadata: { ...auto.metadata, configurationSchema: { properties: { tier: { ...auto.metadata.configurationSchema!.properties!.tier, readOnly: true } } } } }, hydra, ...models],
		});
		openDetails(result.popup, 'Auto');
		const disabled = Array.from(result.popup.querySelectorAll('.tabbed-action-list-details [role="radio"]'), option => option.getAttribute('aria-disabled') === 'true');
		chooseOption(result.popup, 'Intelligence');
		await timeout(0);
		const saved = result.values.get(auto.identifier);
		chooseOption(result.popup, 'HydraFusion');
		await timeout(0);
		assert.deepStrictEqual({ disabled, saved, selections: result.selections }, {
			disabled: [true, true, true, false], saved: undefined, selections: [hydra.identifier],
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
			}, { focusedControl: 'Thinking Effort', restoredFocus: 'First Details, Low · 32K', selections: [] });
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
			}, { currentModelCopy: false, selectionHint: false, groups: ['Thinking Effort', 'Context'], selections: [] });
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
			opened: { prevented: true, model: 'First', focusedControl: 'Thinking Effort' },
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
			}, { pageFocused: direct, focusedControl: direct ? undefined : 'Thinking Effort', selections: [] });
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
