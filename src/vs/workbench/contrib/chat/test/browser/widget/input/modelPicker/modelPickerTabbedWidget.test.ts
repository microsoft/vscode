/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { errorHandler, setUnexpectedErrorHandler } from '../../../../../../../../base/common/errors.js';
import { MutableDisposable, toDisposable } from '../../../../../../../../base/common/lifecycle.js';
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
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelProviderDescriptor, ILanguageModelsService, IModelConfigurationAccess, IModelControlEntry } from '../../../../../common/languageModels.js';
import { ChatConfiguration } from '../../../../../common/constants.js';
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
		policyDefault?: string;
		userDefault?: string;
		selectedModelId?: string;
		pinnedModelIds?: string[];
		controlModels?: IStringDictionary<IModelControlEntry>;
		showUnavailable?: boolean;
		providerPlaceholders?: ITabbedModelPickerContext['providerPlaceholders'];
		beforeSave?: (values: IStringDictionary<unknown>) => Promise<void>;
	} = {}) {
		const container = dom.append(document.body, dom.$('.monaco-workbench.monaco-reduce-motion'));
		container.style.cssText = '--vscode-spacing-size60: 6px; --vscode-spacing-size280: 28px;';
		disposables.add(toDisposable(() => container.remove()));
		const anchor = dom.append(container, dom.$('button'));
		anchor.style.cssText = 'position: fixed; bottom: 20px; left: 20px; width: 120px; height: 22px;';
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
		instantiationService.set(IChatEntitlementService, upcastPartial<IChatEntitlementService>({ entitlement: ChatEntitlement.Pro }));
		instantiationService.set(ILanguageModelsService, upcastPartial<ILanguageModelsService>({
			getVendors: () => [
				upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'copilot', displayName: 'Copilot', isDefault: true }),
				upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'ollama', displayName: 'Ollama' }),
			],
			getLanguageModelGroups: () => [],
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
			models: availableModels, selectedModelId: options.selectedModelId ?? availableModels[0].identifier,
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
		picker.show(anchor, context, options.details);
		return {
			picker, popup, anchor, context, selections, pins, values, changed, configurationService, configurationChanges,
			get hintDismissed() { return hintDismissed; },
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
		element(popup, '[role="button"][aria-label="Back to Models"]').click();
	}

	function defaultBadgeModels(popup: HTMLElement): string[] {
		return Array.from(popup.querySelectorAll('.chat-model-picker-org-default-badge:not([hidden])'), badge => {
			const name = badge.closest('.monaco-list-row')?.querySelector('.title')?.textContent
				?? (badge.closest('.separator') ? 'Auto' : undefined);
			assert.ok(name);
			return name;
		});
	}

	function selectedModels(popup: HTMLElement): string[] {
		return Array.from(popup.querySelectorAll('.chat-model-picker-model[aria-checked="true"] .title'), title => title.textContent!);
	}

	for (const initiallyAuto of [false, true]) {
		test(`mode and provider changes retain the popup size when opened in ${initiallyAuto ? 'Auto' : 'manual'} mode`, () => {
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
			// Copilot has only two models here, so the Auto view is the taller layout and
			// must still fit: Efficiency, Balance, Intelligence, and HydraFusion.
			const visibleRoutes = () => {
				const listBottom = element(popup, '.monaco-list').getBoundingClientRect().bottom;
				return Array.from(popup.querySelectorAll('.chat-model-picker-routing-model'), row => row.getBoundingClientRect())
					.filter(row => row.height > 0 && row.bottom <= listBottom + 0.5).length;
			};
			const initial = bounds();
			const switchTop = element(popup, '[role="switch"]').getBoundingClientRect().top;
			const initialRoutes = visibleRoutes();
			element(popup, '[role="switch"]').click();
			const toggled = bounds();
			const toggledSwitchTop = element(popup, '[role="switch"]').getBoundingClientRect().top;
			const autoRoutes = initiallyAuto ? initialRoutes : visibleRoutes();
			element(popup, '[role="switch"]').click();
			element(popup, '.chat-model-picker-tabbar [aria-label="Ollama"]').click();
			const otherProvider = bounds();
			element(popup, '.chat-model-picker-tabbar [aria-label="Copilot"]').click();
			assert.deepStrictEqual({ measurable: initial.height > 0, toggled, toggledSwitchTop, otherProvider, restored: bounds(), autoRoutes }, {
				measurable: true, toggled: initial, toggledSwitchTop: switchTop, otherProvider: initial, restored: initial, autoRoutes: 4,
			});
		});
	}

	for (const target of ['list', 'switch', 'search', 'details', 'detailsControl', 'back'] as const) {
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
				switch: '[role="switch"]',
				search: 'input',
				details: '.tabbed-action-list-details',
				detailsControl: '.tabbed-action-list-details [role="radio"]',
				back: '[aria-label="Back to Models"]',
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
		{ name: 'Auto as the managed default', models: [createAutoModel(), ...models], policyDefault: 'auto', expected: ['Auto'], selected: ['Balance'] },
		{ name: 'Auto overriding the managed default', models: [createAutoModel(), ...models], policyDefault: 'First', expected: [], selected: ['Balance'] },
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

	test('refreshes the policy badge and mode switch when models arrive or leave', () => {
		const { picker, popup, selections } = createPicker({ policyDefault: 'Late' });
		const state = () => ({ defaults: defaultBadgeModels(popup), switchHidden: element(popup, '.tabbed-action-list-tab-toggle').hidden });
		const initial = state();
		picker.refresh([...models, model('Late'), createAutoModel()]);
		const added = state();
		picker.refresh(models);
		assert.deepStrictEqual({ initial, added, removed: state(), selections }, {
			initial: { defaults: [], switchHidden: true },
			added: { defaults: ['Late'], switchHidden: false },
			removed: { defaults: [], switchHidden: true }, selections: [],
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

	function selectRoutingChoice(popup: HTMLElement, label: string): void {
		const row = Array.from(popup.querySelectorAll<HTMLElement>('.chat-model-picker-model')).find(row => row.querySelector('.title')?.textContent === label);
		assert.ok(row, label);
		row.click();
	}

	test('HydraFusion routing shows a concise description and Learn more in its accessible flyout', () => {
		const auto = createAutoModel();
		const result = createPicker({ models: [auto, createHydraFusionModel(), ...models], selectedModelId: auto.identifier });
		const row = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-picker-routing-model'))
			.find(row => row.querySelector('.title')?.textContent === 'HydraFusion');
		assert.ok(row);
		row.querySelector<HTMLElement>('.action-list-submenu-indicator')?.click();
		const panel = result.popup.querySelector<HTMLElement>('.action-list-submenu-panel');
		const link = panel?.querySelector<HTMLAnchorElement>('a');
		assert.deepStrictEqual({
			detail: row.querySelector('.detail')?.textContent,
			ariaDescription: row.getAttribute('aria-label'),
			expanded: row.getAttribute('aria-expanded'),
			panelRole: panel?.getAttribute('role'),
			description: panel?.querySelector('.chat-model-hover-description p')?.textContent?.trim(),
			paragraphCount: panel?.querySelectorAll('.chat-model-hover-description p').length,
			linkInline: link?.parentElement === panel?.querySelector('.chat-model-hover-description p'),
			link: { label: link?.textContent, href: link?.getAttribute('href') },
			selections: result.selections,
		}, {
			detail: 'May use multiple models',
			ariaDescription: 'HydraFusion, Research preview, HydraFusion picks a workflow for each task, using one or more models to draft, review, or escalate when needed.',
			expanded: 'true',
			panelRole: 'dialog',
			description: 'HydraFusion picks a workflow for each task, using one or more models to draft, review, or escalate when needed. Learn more',
			paragraphCount: 1,
			linkInline: true,
			link: { label: 'Learn more', href: 'https://aka.ms/hydrafusion-blog' },
			selections: [],
		});
	});

	test('HydraFusion flyout link is reachable by keyboard without selecting the model', () => {
		const auto = createAutoModel();
		const result = createPicker({ models: [auto, createHydraFusionModel(), ...models], selectedModelId: auto.identifier });
		const row = Array.from(result.popup.querySelectorAll<HTMLElement>('.chat-model-picker-routing-model'))
			.find(row => row.querySelector('.title')?.textContent === 'HydraFusion');
		assert.ok(row);
		const list = element(result.popup, '.monaco-list');
		list.focus();
		for (let i = 0; i < 5 && !row.closest('.monaco-list-row')?.classList.contains('focused'); i++) {
			list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
		}
		list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
		const link = result.popup.querySelector<HTMLAnchorElement>('.action-list-submenu-panel a');
		assert.deepStrictEqual({
			linkFocused: document.activeElement === link,
			expanded: row.getAttribute('aria-expanded'),
			selections: result.selections,
		}, {
			linkFocused: true,
			expanded: 'true',
			selections: [],
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
		selectRoutingChoice(result.popup, 'Intelligence');
		const closed = !result.picker.isVisible;
		reopen(result);
		selectRoutingChoice(result.popup, 'Efficiency');
		await timeout(0);
		const before = [...writes];
		await pending.complete();
		await timeout(0);
		reopen(result);
		const changes = result.configurationChanges.map(([, , , from, to]) => ({ from, to }));
		assert.deepStrictEqual({ closed, before, writes, changes, selected: selectedModels(result.popup), selections: result.selections }, {
			closed: true,
			before: [{ tier: 'intelligence' }],
			writes: [{ tier: 'intelligence' }, { tier: 'efficiency' }],
			changes: [{ from: 'balance', to: 'intelligence' }, { from: 'intelligence', to: 'efficiency' }],
			selected: ['Efficiency'], selections: [],
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
				// The Copilot tab remembers Auto mode, so its tiers are one click away.
				result.picker.show(result.anchor, { ...result.context, selectedModelId: ollama.identifier });
				element(result.popup, '.chat-model-picker-tabbar [aria-label="Copilot"]').click();
			}
			const reported: Error[] = [];
			const previousHandler = errorHandler.getUnexpectedErrorHandler();
			setUnexpectedErrorHandler(error => reported.push(error));
			try {
				selectRoutingChoice(result.popup, 'Intelligence');
				await timeout(0);
			} finally {
				setUnexpectedErrorHandler(previousHandler);
			}
			result.picker.show(result.anchor, { ...result.context, selectedModelId: start === 'Auto' ? auto.identifier : ollama.identifier });
			element(result.popup, '.chat-model-picker-tabbar [aria-label="Copilot"]').click();
			assert.deepStrictEqual({
				reported,
				changes: result.configurationChanges,
				selected: selectedModels(result.popup),
				selections: result.selections,
			}, { reported: [failure], changes: [], selected: start === 'Auto' ? ['Balance'] : [], selections: [] });
		});
	}

	for (const reopen of [false, true]) {
		test(`pending tier saves cannot override ${reopen ? 'a reopened picker with a new scope' : 'switching to manual mode'}`, async () => {
			const auto = createAutoModel();
			const pending = new DeferredPromise<void>();
			const result = createPicker({ models: [auto, ...models], beforeSave: () => pending.p });
			selectRoutingChoice(result.popup, 'Intelligence');
			result.picker.show(result.anchor, result.context);
			element(result.popup, '[role="switch"]').click();
			if (reopen) {
				result.picker.hide();
				result.picker.show(result.anchor, {
					...result.context, selectedModelId: models[0].identifier,
					configurationAccess: {
						getModelConfiguration: () => undefined,
						getModelConfigurationActions: () => [],
						setModelConfiguration: async () => assert.fail('The new scope must not receive the old write'),
					},
				});
			}
			await pending.complete();
			await timeout(0);
			assert.deepStrictEqual({
				values: result.values.get(auto.identifier),
				selected: selectedModels(result.popup),
				mode: element(result.popup, '[role="switch"]').getAttribute('aria-checked'),
				selections: result.selections,
			}, { values: { tier: 'intelligence' }, selected: ['First'], mode: 'false', selections: [models[0].identifier] });
		});
	}

	test('Copilot modes retain their choices, use exclusive routing, and preserve switch focus', async () => {
		const auto = createAutoModel();
		const hydra = createHydraFusionModel();
		const local = model('Local');
		const result = createPicker({
			policyDefault: 'auto', models: [...models, auto, hydra, {
				...local, identifier: 'ollama/local', metadata: { ...local.metadata, vendor: 'ollama' },
			}]
		});
		const state = () => ({ selected: selectedModels(result.popup), defaults: defaultBadgeModels(result.popup) });
		const states = [state()];
		let toggle = element(result.popup, '[role="switch"]');
		toggle.focus();
		toggle.click();
		const focusAfterToggle = document.activeElement === toggle;
		const separateControl = !toggle.closest('.monaco-button');
		const routes = Array.from(result.popup.querySelectorAll('.chat-model-picker-model .title'), title => title.textContent);
		const closedAfter: boolean[] = [];
		const choose = (label: string) => {
			selectRoutingChoice(result.popup, label);
			closedAfter.push(!result.picker.isVisible);
			reopen(result);
		};
		choose('Balance');
		await timeout(0);
		states.push(state());
		element(result.popup, '.chat-model-picker-tabbar [aria-label="Ollama"]').click();
		const otherProvider = { selected: selectedModels(result.popup), switch: result.popup.querySelector('[role="switch"]'), defaults: defaultBadgeModels(result.popup) };
		element(result.popup, '.chat-model-picker-tabbar [aria-label="Copilot"]').click();
		states.push(state());
		element(result.popup, '[data-id="search"]').click();
		const input = result.popup.querySelector<HTMLInputElement>('input')!;
		input.value = 'HydraFusion';
		input.dispatchEvent(new InputEvent('input', { bubbles: true }));
		const searchResults = Array.from(result.popup.querySelectorAll('.chat-model-picker-model .title'), title => title.textContent);
		choose('HydraFusion');
		toggle = element(result.popup, '[role="switch"]');
		states.push(state());
		toggle.click();
		states.push(state());
		toggle.click();
		states.push(state());
		choose('Efficiency');
		await timeout(0);
		reopen(result);
		toggle = element(result.popup, '[role="switch"]');
		toggle.click();
		toggle.click();
		states.push(state());
		assert.deepStrictEqual({
			states, routes, otherProvider, searchResults, focusAfterToggle, separateControl, closedAfter,
			selections: result.selections,
			changes: result.configurationChanges.map(([, , , from, to]) => ({ from, to })),
		}, {
			states: [
				{ selected: ['First'], defaults: [] },
				{ selected: ['Balance'], defaults: ['Auto'] },
				{ selected: ['Balance'], defaults: ['Auto'] },
				{ selected: ['HydraFusion'], defaults: ['Auto'] },
				{ selected: ['First'], defaults: [] },
				{ selected: ['HydraFusion'], defaults: ['Auto'] },
				{ selected: ['Efficiency'], defaults: ['Auto'] },
			],
			routes: ['Efficiency', 'Balance', 'Intelligence', 'HydraFusion'],
			otherProvider: { selected: [], switch: null, defaults: [] },
			searchResults: ['HydraFusion'],
			focusAfterToggle: true,
			separateControl: true,
			closedAfter: [true, true, true],
			selections: [auto.identifier, hydra.identifier, models[0].identifier, hydra.identifier, auto.identifier, models[0].identifier, auto.identifier],
			changes: [{ from: 'balance', to: 'efficiency' }],
		});
	});

	test('neither routing choices nor the manual fallback select unsupported models or other providers', () => {
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
		const hydra = element(result.popup, '.chat-model-picker-unavailable');
		hydra.click();
		const routing = selectedModels(result.popup);
		element(result.popup, '[role="switch"]').click();
		assert.deepStrictEqual({ unavailable: hydra.querySelector('.title')?.textContent, routing, selections: result.selections }, {
			unavailable: 'HydraFusion', routing: ['Balance'], selections: [models[1].identifier],
		});
	});

	test('Auto-only plans name the tab Auto without a switch and retain unavailable models and provider navigation', () => {
		const result = createPicker({
			models: [createAutoModel()],
			showUnavailable: true,
			controlModels: { locked: { label: 'Locked Model', exists: false, featured: true } },
			providerPlaceholders: [{ vendor: 'ollama', label: 'Ollama', message: 'Add a model.' }],
		});
		const initial = {
			tabs: Array.from(result.popup.querySelectorAll('.chat-model-picker-tabbar [role="radio"]'), tab => tab.getAttribute('aria-label')),
			switchHidden: element(result.popup, '.tabbed-action-list-tab-toggle').hidden,
			selected: selectedModels(result.popup),
			unavailable: result.popup.textContent?.includes('Locked Model'),
		};
		element(result.popup, '.chat-model-picker-tabbar [aria-label="Ollama"]').click();
		assert.deepStrictEqual({ initial, emptyProvider: !!result.popup.querySelector('.tabbed-action-list-empty'), selections: result.selections }, {
			initial: { tabs: ['Auto', 'Ollama'], switchHidden: true, selected: ['Balance'], unavailable: true },
			emptyProvider: true,
			selections: [],
		});
	});

	for (const [name, auto] of [['Auto with tiers', createAutoModel()], ['Auto without a schema', model('auto', false)], ['HydraFusion', createHydraFusionModel()]] as const) {
		test(`${name} has no Details entry point`, () => {
			const { picker, popup, anchor, context, selections } = createPicker({ models: [auto, ...models], details: auto.identifier });
			const initial = {
				details: !!popup.querySelector('.tabbed-action-list-details'),
				actions: popup.querySelectorAll('.chat-model-picker-model .action-label').length,
				mode: element(popup, '[role="switch"]').getAttribute('aria-checked'),
			};
			element(popup, '[data-id="search"]').click();
			const input = popup.querySelector<HTMLInputElement>('input')!;
			input.value = auto.metadata.name;
			input.dispatchEvent(new InputEvent('input', { bubbles: true }));
			const searchActions = popup.querySelectorAll('.chat-model-picker-model .action-label').length;
			picker.hide();
			picker.show(anchor, context, auto.identifier, true);
			assert.deepStrictEqual({ initial, searchActions, reopenedDetails: !!popup.querySelector('.tabbed-action-list-details'), selections }, {
				initial: { details: false, actions: 0, mode: 'true' }, searchActions: 0, reopenedDetails: false, selections: [],
			});
		});
	}

	test('an Auto tier controlled by a read-only schema cannot be changed', () => {
		const auto = createAutoModel();
		const result = createPicker({
			models: [{ ...auto, metadata: { ...auto.metadata, configurationSchema: { properties: { tier: { ...auto.metadata.configurationSchema!.properties!.tier, readOnly: true } } } } }, ...models],
		});
		selectRoutingChoice(result.popup, 'Intelligence');
		const inlineSelection = result.popup.querySelector('.chat-model-picker-model[aria-checked="true"] .title')?.textContent;
		assert.deepStrictEqual({
			inlineSelection,
			disabled: Array.from(result.popup.querySelectorAll('.chat-model-picker-model'), choice => choice.classList.contains('option-disabled')),
			saved: result.values.get(auto.identifier),
			selections: result.selections,
		}, { inlineSelection: 'Balance', disabled: [true, false, true], saved: undefined, selections: [] });
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
			const back = element(popup, '[role="button"][aria-label="Back to Models"]');
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
		const back = element(header, '[role="button"][aria-label="Back to Models"]');
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

	for (const direct of [false, true]) {
		test(`hovering Back preserves focus after ${direct ? 'direct' : 'configuration readout'} details entry`, () => {
			const result = createPicker({ details: direct ? models[0].identifier : undefined });
			if (!direct) {
				openDetails(result.popup, 'First');
			}
			const page = element(result.popup, '.tabbed-action-list-details');
			const back = element(page, '[role="button"][aria-label="Back to Models"]');
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

	test('live scoped values refresh Auto choices directly without a Details page', () => {
		const auto = model('auto');
		const result = createPicker({ models: [auto, ...models], details: auto.identifier });
		result.values.set(auto.identifier, { effort: 'high' });
		result.changed.fire(auto.identifier);
		assert.deepStrictEqual({
			inlineTier: result.popup.querySelector('.chat-model-picker-model[aria-checked="true"] .title')?.textContent,
			details: !!result.popup.querySelector('.tabbed-action-list-details'),
			visible: result.picker.isVisible, selections: result.selections,
		}, { inlineTier: 'High', details: false, visible: true, selections: [] });
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
