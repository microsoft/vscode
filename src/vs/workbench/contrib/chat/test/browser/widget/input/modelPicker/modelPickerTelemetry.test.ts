/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { Emitter } from '../../../../../../../../base/common/event.js';
import { DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../../../base/common/observable.js';
import { extUri } from '../../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListItem, IActionListOptions } from '../../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ITabbedActionListDetailsOptions, TabbedActionListWidget } from '../../../../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
import { ICommandService } from '../../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IDefaultAccountService } from '../../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { IProductService } from '../../../../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../../platform/telemetry/common/telemetry.js';
import { TelemetryTrustedValue } from '../../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IUpdateService, StateType } from '../../../../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService, TestWorkspaceTrustManagementService } from '../../../../../../../test/common/workbenchTestServices.js';
import { ModelPickerConfiguration } from '../../../../../browser/widget/input/modelPicker/modelPickerConfiguration.js';
import { IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ModelPickerWidget, TABBED_MODEL_PICKER_SETTING_ID } from '../../../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService } from '../../../../../common/languageModels.js';
import { NullLanguageModelsService } from '../../../../common/languageModels.js';

function createModel(id: string, metadata: Partial<ILanguageModelChatMetadata> = {}): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `${metadata.vendor ?? 'copilot'}/${id}`,
		metadata: upcastPartial<ILanguageModelChatMetadata>({
			id,
			name: id,
			vendor: 'copilot',
			family: id,
			version: '1.0',
			maxInputTokens: 264000,
			maxOutputTokens: 64000,
			isDefaultForLocation: {},
			configurationSchema: {
				properties: {
					reasoningEffort: { type: 'string', group: 'navigation', enum: ['medium', 'high'], enumItemLabels: ['Medium', 'High'], default: 'medium' },
					contextSize: { type: 'number', group: 'tokens', enum: [264000, 1000000], enumItemLabels: ['264K', '1M'], default: 264000 },
				},
			},
			...metadata,
		}),
	};
}

suite('ModelPickerTelemetry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const model = createModel('test-model');
	const fastModel = createModel('test-model-fast');
	const otherModel = createModel('other-model');
	const thirdPartyModel = createModel('private-model', { vendor: 'third-party' });
	const autoModel = createModel('auto', {
		configurationSchema: {
			properties: {
				tier: {
					type: 'string', group: 'navigation', title: 'Optimize for',
					enum: ['efficiency', 'balance', 'intelligence'],
					enumItemLabels: ['Efficiency', 'Balance', 'Intelligence'],
					default: 'balance',
				},
			},
		},
	});

	function createPicker(tabbed: boolean, selectedModel = model, beforeSave?: (id: string) => Promise<void>) {
		const instantiationService = store.add(new TestInstantiationService());
		const events: { name: string; data: unknown }[] = [];
		const openedLinks: string[] = [];
		const configurations = new Map<string, IStringDictionary<unknown>>();
		const pinnedModelIds: string[] = [];
		let tabbedShows = 0;
		const configurationAccess: IModelConfigurationAccess = {
			getModelConfiguration: id => configurations.get(id),
			setModelConfiguration: async (id, values) => {
				await beforeSave?.(id);
				configurations.set(id, { ...configurations.get(id), ...values });
			},
			getModelConfigurationActions: () => [],
		};
		const models = [autoModel, model, fastModel, otherModel, thirdPartyModel];
		const container = dom.append(mainWindow.document.body, dom.$('.monaco-reduce-motion'));
		store.add(toDisposable(() => container.remove()));
		const details = dom.append(container, dom.$('.tabbed-action-list-details', { role: 'dialog', tabindex: '-1' }));
		const detailsDisposable = store.add(new MutableDisposable());
		let detailsOptions: ITabbedActionListDetailsOptions | undefined;
		const onDidHide = store.add(new Emitter<void>());
		const onDidChangeTab = store.add(new Emitter<string>());
		let visible = false;
		let listOptions: IActionListOptions | undefined;
		let selectItem: (label: string) => void = () => assert.fail('Picker has not opened');
		let selectTab: (label: string) => void = () => assert.fail('Tabbed picker has not opened');
		let showCard: (label: string) => HTMLElement = () => assert.fail('Picker has not opened');
		let refreshList = () => { };
		let searchModels: () => void = () => assert.fail('Tabbed picker has not opened');
		let toggleAuto: () => void = () => assert.fail('Tabbed picker has not opened');
		let hideFlatPicker = () => { };
		const hideDetails = () => {
			const options = detailsOptions;
			detailsOptions = undefined;
			detailsDisposable.clear();
			dom.clearNode(details);
			refreshList();
			options?.onBack?.();
		};

		function setItems<T>(items: readonly IActionListItem<T>[], onSelect: (item: T) => void): void {
			selectItem = label => {
				if (detailsOptions) {
					hideDetails();
					selectItem(label);
					return;
				}
				const item = items.find(item => item.label === label);
				assert.ok(item?.item, label);
				onSelect(item.item);
			};
			showCard = label => {
				const current = details.querySelector<HTMLElement>('.chat-model-card');
				if (current && details.querySelector('.chat-model-card-name')?.textContent === label) {
					return current;
				}
				if (detailsOptions) {
					hideDetails();
					return showCard(label);
				}
				const action = items.find(item => item.label === label)?.toolbarActions?.find(action => action.id === 'chat.modelPicker.details')
					?? items.flatMap(item => item.toolbarActions ?? []).find(action => action.tooltip === `${label} Details`);
				if (action) {
					void action.run();
				} else {
					searchModels();
					return showCard(label);
				}
				const card = details.querySelector<HTMLElement>('.chat-model-card');
				assert.ok(card);
				return card;
			};
		}

		const actionWidgetService = instantiationService.stub(IActionWidgetService, {
			show: (_user, _supportsPreview, items, delegate, _anchor, _container, _actions, _accessibilityProvider, options) => {
				setItems(items, item => delegate.onSelect(item));
				listOptions = options;
				hideFlatPicker = () => delegate.onHide();
			},
			hide: () => hideFlatPicker(),
			focusItemById: () => { },
			updateItems: () => { },
		});
		store.add(toDisposable(() => actionWidgetService.hide()));
		instantiationService.stubInstance(TabbedActionListWidget, {
			onDidChangeTab: onDidChangeTab.event,
			onDidHide: onDidHide.event,
			get isVisible() { return visible; },
			get isShowingDetails() { return !!detailsOptions; },
			show: options => {
				tabbedShows++;
				visible = true;
				let activeTab = options.initialTab;
				toggleAuto = () => {
					const toggle = options.tabs.find(tab => tab.id === activeTab)?.toggle;
					const state = toggle?.getState();
					assert.ok(toggle && state?.enabled);
					toggle.onChange(!state.checked);
				};
				searchModels = () => {
					const search = options.tabBarActions?.find(action => action.id === 'search');
					assert.ok(search && !search.checked, 'Model must be available in the picker or in search');
					search.run();
				};
				refreshList = () => {
					const list = options.createActionList(activeTab);
					setItems(list.items, item => options.delegate.onSelect(item));
					listOptions = list.listOptions;
				};
				selectTab = label => {
					const tab = options.tabs.find(tab => tab.label === label);
					assert.ok(tab, label);
					activeTab = tab.id;
					onDidChangeTab.fire(tab.id);
					refreshList();
				};
				refreshList();
			},
			showDetails: options => {
				detailsDisposable.clear();
				dom.clearNode(details);
				detailsOptions = options;
				const detailStore = new DisposableStore();
				detailsDisposable.value = detailStore;
				if (options.renderHeader) {
					detailStore.add(options.renderHeader(dom.append(details, dom.$('.tabbed-action-list-details-header'))));
				}
				detailStore.add(options.render(details));
				options.focus?.(details);
			},
			hideDetails,
			focusItemAction: () => false,
			refreshActiveList: () => {
				if (!detailsOptions) {
					refreshList();
				}
			},
			hide: () => {
				visible = false;
				detailsOptions = undefined;
				detailsDisposable.clear();
				dom.clearNode(details);
				onDidHide.fire();
			},
			dispose: () => { },
		});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IOpenerService, { open: async resource => { openedLinks.push(resource.toString()); return true; } });
		instantiationService.stub(ITelemetryService, { publicLog2: (name, data) => { events.push({ name, data }); } });
		instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
			override getLanguageModelIds() { return models.map(model => model.identifier); }
			override getRecentlyUsedModelIds() { return [model.identifier]; }
			override getPinnedModelIds() { return [...pinnedModelIds]; }
			override pinModel(id: string) { pinnedModelIds.push(id); }
			override unpinModel(id: string) { pinnedModelIds.splice(pinnedModelIds.indexOf(id), 1); }
		}());
		instantiationService.stub(IProductService, { version: '1.100.0' });
		const entitlementService = new TestChatEntitlementService();
		entitlementService.entitlement = ChatEntitlement.Pro;
		instantiationService.stub(IChatEntitlementService, entitlementService);
		instantiationService.stub(IUpdateService, { state: { type: StateType.Uninitialized } });
		instantiationService.stub(IUriIdentityService, { extUri });
		instantiationService.stub(IDefaultAccountService, { resolveGitHubUrl: () => 'https://github.com/settings/copilot' });
		instantiationService.stub(IWorkspaceTrustManagementService, store.add(new TestWorkspaceTrustManagementService()));
		instantiationService.stub(IWorkspaceTrustRequestService, {});
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ [TABBED_MODEL_PICKER_SETTING_ID]: tabbed }));

		const picker = store.add(instantiationService.createInstance(ModelPickerWidget, {
			currentModel: constObservable(selectedModel),
			setModel: () => { },
			getModels: () => models,
			getChatSessionId: () => 'session-1',
			getPresentationOptions: () => ({
				useGroupedModelPicker: true, showManageModelsAction: false, showUnavailableFeatured: true,
				showFeatured: true, showAutoModel: true, showModelIcon: false,
			}),
			modelConfiguration: configurationAccess,
		}));
		picker.setSelectedModel(selectedModel);
		picker.show(container);

		return {
			events, openedLinks, picker, container, configurations, pinnedModelIds,
			get visible() { return visible; },
			get tabbedShows() { return tabbedShows; },
			selectItem: (label: string) => selectItem(label),
			selectTab: (label: string) => selectTab(label),
			toggleAuto: () => toggleAuto(),
			showCard: (label: string) => showCard(label),
			backToModels: () => hideDetails(),
			get listOptions() {
				assert.ok(listOptions);
				return listOptions;
			},
			showConfiguration: () => {
				actionWidgetService.hide();
				instantiationService.createInstance(ModelPickerConfiguration, {
					getSelectedModel: () => picker.selectedModel,
					getConfigurationAccess: () => configurationAccess,
					isDisabled: () => false,
					shouldShowCacheBreakHint: () => false,
					getCacheBreakLearnMoreLink: () => undefined,
					dismissCacheBreakHint: () => { },
				}).show(container);
			},
		};
	}

	test('the input readout opens details directly and restores the invoking control', () => {
		const result = createPicker(true);
		result.picker.render(result.container);
		result.picker.show(result.container);
		const readout = result.container.querySelector<HTMLElement>('.model-picker-config')!;
		readout.focus();
		readout.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		const during = {
			label: readout.textContent,
			popup: readout.getAttribute('aria-haspopup'),
			expanded: readout.getAttribute('aria-expanded'),
			model: result.container.querySelector('.chat-model-card-name')?.textContent,
		};
		result.picker.show(result.container);
		assert.deepStrictEqual({ during, focused: document.activeElement === readout, expanded: readout.getAttribute('aria-expanded'), events: result.events }, {
			during: { label: 'Medium · 264K', popup: 'dialog', expanded: 'true', model: model.metadata.name },
			focused: true, expanded: 'false', events: [],
		});
	});

	for (const target of ['name', 'config']) {
		test(`the Auto ${target} pill opens routing choices, not Details`, async () => {
			const result = createPicker(true, autoModel);
			result.picker.render(result.container);
			result.picker.show(result.container);
			const trigger = result.container.querySelector<HTMLElement>(`.model-picker-${target}`)!;
			trigger.focus();
			trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
			const opened = {
				details: !!result.container.querySelector('.chat-model-card'),
				expanded: Array.from(result.container.querySelectorAll('.model-picker-section'), pill => pill.getAttribute('aria-expanded')),
				readoutPopup: result.container.querySelector('.model-picker-config')?.getAttribute('aria-haspopup'),
			};
			result.selectItem('Efficiency');
			await timeout(0);
			result.picker.show(result.container);
			assert.deepStrictEqual({ opened, focused: document.activeElement === trigger, saved: result.configurations.get(autoModel.identifier) }, {
				opened: { details: false, expanded: ['true', 'true'], readoutPopup: 'menu' },
				focused: true, saved: { tier: 'efficiency' },
			});
		});
	}

	for (const keyboard of [false, true]) {
		test(`opening details ${keyboard ? 'with the keyboard focuses configuration' : 'with the pointer does not focus a setting'}`, () => {
			const result = createPicker(true);
			result.picker.render(result.container);
			result.picker.show(result.container);
			const readout = result.container.querySelector<HTMLElement>('.model-picker-config')!;
			readout.focus();
			readout.dispatchEvent(keyboard
				? new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
				: new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
			assert.deepStrictEqual({
				focusedRole: document.activeElement?.getAttribute('role'),
				focusedSetting: document.activeElement?.closest('[role="radiogroup"]')?.getAttribute('aria-label'),
				events: result.events,
			}, { focusedRole: keyboard ? 'radio' : 'dialog', focusedSetting: keyboard ? 'Thinking Effort' : undefined, events: [] });
		});
	}

	test('the composite picker tracks whole-name hover separately from its configuration target', () => {
		const result = createPicker(true);
		result.picker.render(result.container);
		const chip = result.picker.domNode!;
		const name = result.container.querySelector<HTMLElement>('.model-picker-name')!;
		const config = result.container.querySelector<HTMLElement>('.model-picker-config')!;
		name.dispatchEvent(new MouseEvent('mouseenter'));
		const nameHovered = chip.classList.contains('model-picker-name-hovered');
		name.dispatchEvent(new MouseEvent('mouseleave'));
		config.dispatchEvent(new MouseEvent('mouseenter'));
		assert.deepStrictEqual({
			tabbed: chip.classList.contains('tabbed'),
			hasConfig: chip.classList.contains('has-config'),
			nameHovered,
			configHighlightsWholeChip: chip.classList.contains('model-picker-name-hovered'),
			targets: [name.getAttribute('role'), config.getAttribute('role')],
			summary: config.textContent,
		}, { tabbed: true, hasConfig: true, nameHovered: true, configHighlightsWholeChip: false, targets: ['button', 'button'], summary: 'Medium · 264K' });
	});

	test('opening from the model name keeps the whole chip active in Auto until dismissal', () => {
		const result = createPicker(true);
		result.picker.render(result.container);
		result.picker.show(result.container);
		const chip = result.picker.domNode!;
		const name = result.container.querySelector<HTMLElement>('.model-picker-name')!;
		name.dispatchEvent(new MouseEvent('mouseenter'));
		name.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
		name.dispatchEvent(new MouseEvent('mouseleave'));
		const afterOpen = chip.classList.contains('model-picker-name-active');
		result.toggleAuto();
		const inAuto = chip.classList.contains('model-picker-name-active');
		result.picker.show(result.container);
		assert.deepStrictEqual({
			afterOpen,
			inAuto,
			afterClose: chip.classList.contains('model-picker-name-active'),
			nameExpanded: name.getAttribute('aria-expanded'),
		}, { afterOpen: true, inAuto: true, afterClose: false, nameExpanded: 'false' });
	});

	test('opening configuration does not activate the whole model-name chip', () => {
		const result = createPicker(true);
		result.picker.render(result.container);
		result.picker.show(result.container);
		const config = result.container.querySelector<HTMLElement>('.model-picker-config')!;
		config.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			wholeChipActive: result.picker.domNode!.classList.contains('model-picker-name-active'),
			configExpanded: config.getAttribute('aria-expanded'),
		}, { wholeChipActive: false, configExpanded: 'true' });
	});

	test('a disabled input readout cannot open model details', () => {
		const result = createPicker(true);
		result.picker.render(result.container);
		result.picker.show(result.container);
		result.picker.setEnabled(false);
		result.container.querySelector<HTMLElement>('.model-picker-config')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		assert.deepStrictEqual({ visible: result.visible, events: result.events }, { visible: false, events: [] });
	});

	test('the model-name entry retains the existing return to the previously focused editor', () => {
		const result = createPicker(true);
		result.picker.render(result.container);
		result.picker.show(result.container);
		const input = dom.append(result.container, dom.$('textarea'));
		input.focus();
		result.container.querySelector<HTMLElement>('.model-picker-name')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		result.selectItem(otherModel.metadata.name);
		assert.strictEqual(document.activeElement, input);
	});

	test('closing direct details falls back to the model name when the readout disappears', () => {
		const result = createPicker(true);
		result.picker.render(result.container);
		result.picker.show(result.container);
		const readout = result.container.querySelector<HTMLElement>('.model-picker-config')!;
		readout.focus();
		readout.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		result.picker.setSelectedModel(undefined);
		result.picker.show(result.container);
		assert.strictEqual(document.activeElement, result.container.querySelector('.model-picker-name'));
	});

	test('saving the current model updates the input readout without a configuration event source', async () => {
		const result = createPicker(true);
		result.picker.render(result.container);
		option(result.showCard(model.metadata.name), 'High').click();
		await timeout(0);
		assert.deepStrictEqual({
			label: result.container.querySelector('.model-picker-config')?.textContent,
			modelChanges: result.events.filter(event => event.name === 'chat.modelChange'),
		}, { label: 'High · 264K', modelChanges: [] });
	});

	function option(container: HTMLElement, label: string): HTMLElement {
		const result = Array.from(container.querySelectorAll<HTMLElement>('[role="radio"]')).find(option => option.textContent === label);
		assert.ok(result, label);
		return result;
	}

	function modelChange(from: ILanguageModelChatMetadataAndIdentifier, to: ILanguageModelChatMetadataAndIdentifier) {
		return {
			name: 'chat.modelChange',
			data: {
				fromModel: from.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(from.identifier) : 'unknown',
				toModel: to.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(to.identifier) : 'unknown',
				chatSessionId: 'session-1',
			},
		};
	}

	for (const tabbed of [false, true]) {
		suite(tabbed ? 'tabbed picker' : 'flat picker', () => {
			for (const nextModel of [otherModel, thirdPartyModel]) {
				test(`reports model selection with session correlation and ${nextModel.metadata.vendor} privacy handling`, () => {
					const result = createPicker(tabbed);
					if (tabbed && nextModel === thirdPartyModel) {
						result.selectTab('Third-party');
					}
					result.selectItem(nextModel.metadata.name);
					assert.deepStrictEqual(result.events, [modelChange(model, nextModel)]);
				});
			}

			test('reports only user expansion and collapse of Other Models', () => {
				const result = createPicker(tabbed);
				assert.ok(result.listOptions.onDidToggleSection);
				result.listOptions.onDidToggleSection('other', false);
				result.listOptions.onDidToggleSection('other', true);
				result.listOptions.onDidToggleSection('unrelated', false);
				assert.deepStrictEqual(result.events, [
					{ name: 'chat.modelPickerInteraction', data: { interaction: 'otherModelsExpanded' } },
					{ name: 'chat.modelPickerInteraction', data: { interaction: 'otherModelsCollapsed' } },
				]);
			});

			test('reports upgrade and contact-admin links without counting unrelated links', () => {
				const result = createPicker(tabbed);
				const links = ['command:workbench.action.chat.upgradePlan', 'https://github.com/settings/copilot', 'https://example.com/'];
				assert.ok(result.listOptions.linkHandler);
				for (const link of links) {
					result.listOptions.linkHandler(URI.parse(link), { kind: ActionListItemKind.Action });
				}
				assert.deepStrictEqual({ events: result.events, openedLinks: result.openedLinks }, {
					events: [
						{ name: 'chat.modelPickerInteraction', data: { interaction: 'premiumModelUpgradePlanClicked' } },
						{ name: 'chat.modelPickerInteraction', data: { interaction: 'disabledModelContactAdminClicked' } },
					],
					openedLinks: links,
				});
			});

			for (const change of [
				{ model, label: 'High', event: 'chat.thinkingEffortChange', property: 'reasoningEffort', fromValue: 'medium', toValue: 'high' },
				{ model, label: '1M', event: 'chat.contextSizeChange', fromValue: '264000', toValue: '1000000' },
				{ model: autoModel, label: 'Efficiency', event: 'chat.thinkingEffortChange', property: 'tier', fromValue: 'balance', toValue: 'efficiency' },
				{ model: thirdPartyModel, label: 'High', event: 'chat.thinkingEffortChange', property: 'unknown', fromValue: 'medium', toValue: 'high' },
			]) {
				test(`reports ${change.model.metadata.vendor} ${change.property ?? 'context size'} changes`, async () => {
					const result = createPicker(tabbed, change.model);
					if (tabbed && change.model === autoModel) {
						result.selectItem(change.label);
					} else if (tabbed) {
						option(result.showCard(change.model.metadata.name), change.label).click();
					} else {
						result.showConfiguration();
						result.selectItem(change.label);
					}
					await timeout(0);
					assert.deepStrictEqual(result.events, [{
						name: change.event,
						data: {
							model: change.model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(change.model.identifier) : 'unknown',
							...(change.property ? { property: change.property } : {}),
							fromValue: change.fromValue,
							toValue: change.toValue,
						},
					}]);
				});
			}
		});
	}

	test('returning to the list during a speed change does not report a revert to Standard', () => {
		const result = createPicker(true);
		option(result.showCard(model.metadata.name), 'Fast').click();
		result.selectItem(fastModel.metadata.name);

		assert.deepStrictEqual({ selected: result.picker.selectedModel?.identifier, events: result.events }, {
			selected: fastModel.identifier,
			events: [modelChange(model, fastModel), modelChange(fastModel, fastModel)],
		});
	});

	for (const initiallyFast of [false, true]) {
		test(`selecting a remembered speed through search reports Fast (initially fast: ${initiallyFast})`, async () => {
			const result = createPicker(true, initiallyFast ? fastModel : model);
			if (!initiallyFast) {
				option(result.showCard(model.metadata.name), 'Fast').click();
				await timeout(0);
			}
			result.selectItem(otherModel.metadata.name);
			result.picker.show(result.container);
			result.listOptions.onType?.('test');
			result.selectItem(fastModel.metadata.name);

			assert.deepStrictEqual({ searching: result.listOptions.showFilter, events: result.events }, {
				searching: true,
				events: [
					...(initiallyFast ? [] : [modelChange(model, fastModel)]),
					modelChange(fastModel, otherModel),
					modelChange(otherModel, fastModel),
				],
			});
		});
	}

	test('pinning a model then changing speed preserves its pin without a configuration event', async () => {
		const result = createPicker(true);
		const card = result.showCard(model.metadata.name);
		result.container.querySelector<HTMLElement>('[aria-label="Pin Model"]')!.click();
		option(card, 'Fast').click();
		await timeout(0);
		result.showCard(fastModel.metadata.name);
		result.container.querySelector<HTMLElement>('[aria-label="Unpin Model"]')!.click();

		assert.deepStrictEqual({ pinned: result.pinnedModelIds, events: result.events }, {
			pinned: [],
			events: [modelChange(model, fastModel)],
		});
	});

	test('reselecting a current legacy option persists the choice without reporting a value change', async () => {
		const result = createPicker(false);
		result.showConfiguration();
		result.selectItem('Medium');
		await timeout(0);
		assert.deepStrictEqual({ events: result.events, saved: result.configurations.get(model.identifier) }, {
			events: [], saved: { reasoningEffort: 'medium' },
		});
	});

	test('tabbed Auto toggles report the current previous model while the popup stays open', () => {
		const result = createPicker(true);
		result.toggleAuto();
		result.toggleAuto();
		result.toggleAuto();
		assert.deepStrictEqual(result.events, [modelChange(model, autoModel), modelChange(autoModel, model), modelChange(model, autoModel)]);
	});

	test('activating the remembered Auto tier only reports switching to Auto', async () => {
		const result = createPicker(true);
		result.toggleAuto();
		result.selectItem('Balance');
		await timeout(0);
		assert.deepStrictEqual(result.events, [modelChange(model, autoModel)]);
	});

	test('activating the current Auto tier while already enabled does not report a change', async () => {
		const result = createPicker(true, autoModel);
		result.selectItem('Balance');
		await timeout(0);
		assert.deepStrictEqual(result.events, []);
	});

	test('enabling Auto and then changing the tier reports each change once', async () => {
		const result = createPicker(true);
		result.toggleAuto();
		result.selectItem('Intelligence');
		await timeout(0);
		assert.deepStrictEqual(result.events, [modelChange(model, autoModel), {
			name: 'chat.thinkingEffortChange',
			data: { model: new TelemetryTrustedValue(autoModel.identifier), property: 'tier', fromValue: 'balance', toValue: 'intelligence' },
		}]);
	});

	test('configuring another model reports both the configuration and model change', async () => {
		const result = createPicker(true);
		option(result.showCard(otherModel.metadata.name), 'High').click();
		await timeout(0);
		assert.deepStrictEqual(result.events, [{
			name: 'chat.thinkingEffortChange',
			data: { model: new TelemetryTrustedValue(otherModel.identifier), property: 'reasoningEffort', fromValue: 'medium', toValue: 'high' },
		}, modelChange(model, otherModel)]);
	});

	test('multiple configuration changes and pinning preserve the tabbed picker and the same card', async () => {
		const result = createPicker(true);
		const card = result.showCard(otherModel.metadata.name);
		option(card, 'High').click();
		await timeout(0);
		option(card, '1M').click();
		await timeout(0);
		const pin = result.container.querySelector<HTMLElement>('[aria-label="Pin Model"]');
		assert.ok(pin);
		pin.click();
		await timeout(0);
		const sameCardAfterPin = result.showCard(otherModel.metadata.name) === card;
		const pinned = [...result.pinnedModelIds];
		const unpin = result.container.querySelector<HTMLElement>('[aria-label="Unpin Model"]');
		assert.ok(unpin);
		unpin.click();
		await timeout(0);

		assert.deepStrictEqual({
			visible: result.visible,
			shows: result.tabbedShows,
			sameCardAfterPin,
			sameCardAfterUnpin: result.showCard(otherModel.metadata.name) === card,
			pinned,
			unpinned: result.pinnedModelIds,
			config: result.configurations.get(otherModel.identifier),
			modelChanges: result.events.filter(event => event.name === 'chat.modelChange'),
		}, {
			visible: true,
			shows: 1,
			sameCardAfterPin: true,
			sameCardAfterUnpin: true,
			pinned: [otherModel.identifier],
			unpinned: [],
			config: { reasoningEffort: 'high', contextSize: 1000000 },
			modelChanges: [modelChange(model, otherModel)],
		});
	});

	for (const latest of ['current model', 'Auto']) {
		test(`a delayed save in another card cannot override a newer interaction with ${latest}`, async () => {
			const saved = new DeferredPromise<void>();
			const result = createPicker(true, model, async id => {
				if (id === otherModel.identifier) {
					await saved.p;
				}
			});
			option(result.showCard(otherModel.metadata.name), 'High').click();
			if (latest === 'Auto') {
				result.backToModels();
				result.toggleAuto();
			} else {
				option(result.showCard(model.metadata.name), 'High').click();
			}
			await timeout(0);
			await saved.complete();
			await timeout(0);

			assert.deepStrictEqual({
				selected: result.picker.selectedModel?.identifier,
				saved: result.configurations.get(otherModel.identifier),
				modelChanges: result.events.filter(event => event.name === 'chat.modelChange'),
				configurationChanges: result.events.filter(event => event.name === 'chat.thinkingEffortChange'),
				visible: result.visible,
			}, {
				selected: latest === 'Auto' ? autoModel.identifier : model.identifier,
				saved: { reasoningEffort: 'high' },
				modelChanges: latest === 'Auto' ? [modelChange(model, autoModel)] : [],
				configurationChanges: (latest === 'Auto' ? [otherModel] : [model, otherModel]).map(model => ({
					name: 'chat.thinkingEffortChange',
					data: { model: new TelemetryTrustedValue(model.identifier), property: 'reasoningEffort', fromValue: 'medium', toValue: 'high' },
				})),
				visible: true,
			});
		});
	}
});
