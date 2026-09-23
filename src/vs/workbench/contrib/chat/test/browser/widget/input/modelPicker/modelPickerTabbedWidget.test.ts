/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { DeferredPromise, timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { Emitter, Event } from '../../../../../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
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
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelProviderDescriptor, ILanguageModelsService, IModelConfigurationAccess } from '../../../../../common/languageModels.js';

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

suite('TabbedModelPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const models = [model('First'), model('Second'), model('Fixed', false)];

	function createPicker(options: { models?: ILanguageModelChatMetadataAndIdentifier[]; access?: IModelConfigurationAccess; details?: string; cacheWarm?: boolean } = {}) {
		const container = dom.append(document.body, dom.$('.monaco-workbench.monaco-reduce-motion'));
		disposables.add(toDisposable(() => container.remove()));
		const anchor = dom.append(container, dom.$('button'));
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
			getVendors: () => [upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'copilot', displayName: 'Copilot', isDefault: true })],
			getLanguageModelGroups: () => [],
		}));
		const changed = disposables.add(new Emitter<string>());
		const values = new Map<string, IStringDictionary<unknown>>();
		const access: IModelConfigurationAccess = options.access ?? {
			getModelConfiguration: id => values.get(id),
			getModelConfigurationActions: () => [],
			setModelConfiguration: async (id, next) => {
				values.set(id, { ...values.get(id), ...next });
				changed.fire(id);
			},
			onDidChange: changed.event,
		};
		const selections: string[] = [];
		const pins: string[] = [];
		let hintDismissed = false;
		const availableModels = options.models ?? models;
		const context: ITabbedModelPickerContext = {
			models: availableModels, selectedModelId: availableModels[0].identifier,
			recentModelIds: [], pinnedModelIds: [],
			controlModels: Object.fromEntries(availableModels.map(model => [model.metadata.id, { exists: true, featured: true, label: model.metadata.name }])),
			configurationAccess: access, isUBB: false, showManageModels: false, providerPlaceholders: [],
			unavailableContext: { show: false, currentVSCodeVersion: '1.140.0', manageSettingsUrl: undefined, updateStateType: StateType.Idle },
			onUnavailableLinkClick: () => { },
			onSelect: model => selections.push(model.identifier),
			onTogglePin: (id, pinned) => { if (pinned) { pins.push(id); } },
			onManageModels: () => { },
			onDidToggleOtherModels: () => { },
			onConfigurationChanged: () => { },
			cacheBreakHint: undefined,
			configurationCacheBreakHint: options.cacheWarm ? { text: 'Changing options resets the prompt cache.', link: undefined, dismiss: () => { hintDismissed = true; } } : undefined,
		};
		const picker = disposables.add(instantiationService.createInstance(TabbedModelPicker));
		picker.show(anchor, context, options.details);
		return { picker, popup, anchor, context, selections, pins, values, changed, get hintDismissed() { return hintDismissed; } };
	}

	function element(container: ParentNode, selector: string): HTMLElement {
		const element = container.querySelector<HTMLElement>(selector);
		assert.ok(element, selector);
		return element;
	}

	function openDetails(popup: HTMLElement, name: string): void {
		element(popup, `[role="button"][aria-label="${name} Details"]`).click();
	}

	function goBack(popup: HTMLElement): void {
		element(popup, '[role="button"][aria-label="Back to Models"]').click();
	}

	for (const enabled of [false, true]) {
		test(`Auto ${enabled ? 'on' : 'off'} exposes its tiers only in details without selecting on inspection`, () => {
			const auto = createAutoModel();
			const result = createPicker({ models: enabled ? [auto, ...models] : [...models, auto] });
			const footer = element(result.popup, '.chat-model-picker-auto-row');
			const footerState = {
				groups: footer.querySelectorAll('[role="radiogroup"]').length,
				description: footer.querySelector('.chat-model-picker-auto-description')?.textContent,
				checked: footer.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
			};
			openDetails(result.popup, 'Auto');
			const group = element(result.popup, '.chat-model-card [role="radiogroup"]');
			const choices = Array.from(group.querySelectorAll('[role="radio"]'), choice => ({ label: choice.textContent, checked: choice.getAttribute('aria-checked') }));
			goBack(result.popup);
			assert.deepStrictEqual({
				footerState,
				groupLabel: group.getAttribute('aria-label'),
				choices,
				selections: result.selections,
				collapsed: element(result.popup, '.tabbed-action-list-body').inert,
			}, {
				footerState: { groups: 0, description: '10% discount', checked: String(enabled) },
				groupLabel: 'Optimize for',
				choices: [{ label: 'Efficiency', checked: 'false' }, { label: 'Balance', checked: 'true' }, { label: 'Intelligence', checked: 'false' }],
				selections: [],
				collapsed: enabled,
			});
		});
	}

	for (const [index, tier] of [[1, 'balance'], [2, 'intelligence']] as const) {
		test(`choosing ${tier} in Auto details enables Auto and preserves the tier through toggling`, async () => {
			const auto = createAutoModel();
			const result = createPicker({ models: [...models, auto] });
			openDetails(result.popup, 'Auto');
			result.popup.querySelectorAll<HTMLElement>('.chat-model-card [role="radio"]')[index].click();
			await timeout(0);
			goBack(result.popup);
			const enabledAfterChoice = element(result.popup, '[role="switch"]').getAttribute('aria-checked');
			const collapsedAfterChoice = element(result.popup, '.tabbed-action-list-body').inert;
			element(result.popup, '[role="switch"]').click();
			element(result.popup, '[role="switch"]').click();
			openDetails(result.popup, 'Auto');
			assert.deepStrictEqual({
				enabledAfterChoice,
				collapsedAfterChoice,
				selections: result.selections,
				saved: result.values.get(auto.identifier),
				selectedTier: result.popup.querySelector('.chat-model-card [role="radio"][aria-checked="true"]')?.textContent,
				footerGroups: result.popup.querySelectorAll('.chat-model-picker-auto-row [role="radiogroup"]').length,
			}, {
				enabledAfterChoice: 'true', collapsedAfterChoice: true,
				selections: [auto.identifier, models[0].identifier, auto.identifier],
				saved: { tier }, selectedTier: index === 1 ? 'Balance' : 'Intelligence', footerGroups: 0,
			});
		});
	}

	test('turning Auto off after leaving a pending tier save is not overridden by its completion', async () => {
		const auto = createAutoModel();
		const pending = new DeferredPromise<void>();
		const values = { tier: 'balance' };
		const result = createPicker({
			models: [...models, auto], access: {
				getModelConfiguration: id => id === auto.identifier ? values : undefined,
				getModelConfigurationActions: () => [],
				setModelConfiguration: async (_id, next) => { await pending.p; Object.assign(values, next); },
			}
		});
		openDetails(result.popup, 'Auto');
		result.popup.querySelectorAll<HTMLElement>('.chat-model-card [role="radio"]')[2].click();
		await timeout(0);
		goBack(result.popup);
		element(result.popup, '[role="switch"]').click();
		element(result.popup, '[role="switch"]').click();
		await pending.complete();
		await timeout(0);
		assert.deepStrictEqual({
			selections: result.selections,
			values,
			checked: result.popup.querySelector('[role="switch"]')?.getAttribute('aria-checked'),
			visible: result.picker.isVisible,
		}, { selections: [auto.identifier, models[0].identifier], values: { tier: 'intelligence' }, checked: 'false', visible: true });
	});

	test('all rows show effective values and offer details without selecting', () => {
		const result = createPicker();
		const rows = Array.from(result.popup.querySelectorAll('.chat-model-picker-model'), row => ({
			name: row.querySelector('.title')?.textContent,
			summary: row.querySelector('.description')?.textContent,
			details: row.querySelector('.action-label')?.getAttribute('aria-label'),
		}));
		openDetails(result.popup, 'Fixed');
		assert.deepStrictEqual({
			rows,
			selections: result.selections,
			information: result.popup.querySelector('.chat-model-card-description')?.textContent?.trim(),
			settings: result.popup.querySelectorAll('.tabbed-action-list-details [role="radiogroup"]').length,
			hoverPanels: result.popup.querySelectorAll('.chat-model-card-panel').length,
		}, {
			rows: [
				{ name: 'First', summary: 'Low · 32K', details: 'First Details' },
				{ name: 'Fixed', summary: '200K', details: 'Fixed Details' },
				{ name: 'Second', summary: 'Low · 32K', details: 'Second Details' },
			],
			selections: [], information: 'Model information.', settings: 0, hoverPanels: 0,
		});
	});

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
		test(`hovering Back does not focus configuration after ${direct ? 'direct' : 'row'} details entry`, () => {
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
			}, { pageFocused: true, focusedControl: undefined, selections: [] });
		});
	}

	test('configuration stays visible beside a promotion without repeating the discount', () => {
		const base = model('Promo');
		const promotional = { ...base, metadata: { ...base.metadata, promo: { id: 'offer', discountPercent: 25, message: 'Temporary offer.' } } };
		const result = createPicker({ models: [promotional] });
		assert.deepStrictEqual({
			badge: result.popup.querySelector('.chat-model-picker-model .action-item-badge')?.textContent,
			summary: result.popup.querySelector('.chat-model-picker-model .description')?.textContent,
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
			settingFocused: true, pinFocused: 'Unpin Model', restoredFocus: 'Second Details',
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

	test('live scoped values refresh details and Back restores Auto collapse', async () => {
		const auto = model('auto');
		const result = createPicker({ models: [auto, ...models], details: auto.identifier });
		result.values.set(auto.identifier, { effort: 'high' });
		result.changed.fire(auto.identifier);
		const active = element(result.popup, '.chat-model-card [role="radiogroup"] [aria-checked="true"]').textContent;
		goBack(result.popup);
		await timeout(0);
		assert.deepStrictEqual({
			active, collapsed: element(result.popup, '.tabbed-action-list-body').inert,
			visible: result.picker.isVisible, selections: result.selections,
		}, { active: 'High', collapsed: true, visible: true, selections: [] });
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
			const summary = row.querySelector('.description')?.textContent;
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
