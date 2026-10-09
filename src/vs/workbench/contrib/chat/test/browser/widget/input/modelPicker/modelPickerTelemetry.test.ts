/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { EventType as TouchEventType } from '../../../../../../../../base/browser/touch.js';
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
import { IModelConfigurationAccess } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ModelPickerTelemetrySession } from '../../../../../browser/widget/input/modelPicker/modelPickerTelemetry.js';
import { ModelPickerWidget } from '../../../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelsService, IModelPinTelemetryContext } from '../../../../../common/languageModels.js';
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

	function createPicker(selectedModel = model, beforeSave?: (id: string) => Promise<void>, models = [autoModel, model, fastModel, otherModel, thirdPartyModel], entitlement = ChatEntitlement.Pro, supportsProgrammaticSelection = true, showAutoModel = true) {
		const instantiationService = store.add(new TestInstantiationService());
		const events: { name: string; data: unknown }[] = [];
		const pickerEvents: { name: string; data: unknown }[] = [];
		const pickerSessionIds: string[] = [];
		const eventNames: string[] = [];
		const openedLinks: string[] = [];
		const configurations = new Map<string, IStringDictionary<unknown>>();
		const pinnedModelIds: string[] = [];
		const delegateSelections: string[] = [];
		const programmaticDelegateSelections: string[] = [];
		let tabbedShows = 0;
		let trustRequests = 0;
		let renderWelcome: () => HTMLElement | undefined = () => assert.fail('Tabbed picker has not opened');
		let tabBarActionIds: string[] = [];
		let listLabels: (string | undefined)[] = [];
		const configurationAccess: IModelConfigurationAccess = {
			getModelConfiguration: id => configurations.get(id),
			setModelConfiguration: async (id, values) => {
				await beforeSave?.(id);
				configurations.set(id, { ...configurations.get(id), ...values });
			},
			getModelConfigurationActions: () => [],
		};
		const container = dom.append(mainWindow.document.body, dom.$('.monaco-reduce-motion'));
		store.add(toDisposable(() => container.remove()));
		const details = dom.append(container, dom.$('.tabbed-action-list-details', { role: 'dialog', tabindex: '-1' }));
		const detailsDisposable = store.add(new MutableDisposable());
		let detailsOptions: ITabbedActionListDetailsOptions | undefined;
		const onDidHide = store.add(new Emitter<void>());
		const onDidChangeTab = store.add(new Emitter<string>());
		let visible = false;
		let listOptions: IActionListOptions | undefined;
		let contextViewLayer: number | undefined;
		let selectItem: (label: string) => void = () => assert.fail('Picker has not opened');
		let selectTab: (label: string) => void = () => assert.fail('Tabbed picker has not opened');
		let showCard: (label: string) => HTMLElement = () => assert.fail('Picker has not opened');
		let refreshList = () => { };
		let searchModels: () => void = () => assert.fail('Tabbed picker has not opened');
		let toggleAuto: () => void = () => assert.fail('Tabbed picker has not opened');
		const hideTabbedPicker = () => {
			visible = false;
			detailsOptions = undefined;
			detailsDisposable.clear();
			dom.clearNode(details);
			onDidHide.fire();
		};
		const hideDetails = () => {
			const options = detailsOptions;
			detailsOptions = undefined;
			detailsDisposable.clear();
			dom.clearNode(details);
			refreshList();
			options?.onBack?.();
		};

		function setItems<T>(items: readonly IActionListItem<T>[], onSelect: (item: T) => void): void {
			listLabels = items.map(item => item.label);
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

		instantiationService.stubInstance(TabbedActionListWidget, {
			onDidChangeTab: onDidChangeTab.event,
			onDidHide: onDidHide.event,
			get isVisible() { return visible; },
			get isShowingDetails() { return !!detailsOptions; },
			show: options => {
				tabbedShows++;
				visible = true;
				contextViewLayer = options.contextViewLayer;
				let activeTab = options.initialTab;
				tabBarActionIds = options.tabBarActions?.map(action => action.id) ?? [];
				renderWelcome = () => {
					const body = dom.$('div');
					const rendered = options.renderEmpty?.(body, activeTab);
					return rendered ? (store.add(rendered), body) : undefined;
				};
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
			hide: () => hideTabbedPicker(),
			dispose: () => { },
		});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IOpenerService, { open: async resource => { openedLinks.push(resource.toString()); return true; } });
		instantiationService.stub(ITelemetryService, {
			publicLog2: (name, data) => {
				// Replace the random session id with its open order and check each duration
				// is a real elapsed time, so events stay deterministic to compare.
				const normalized: IStringDictionary<unknown> = { ...data };
				if (name !== 'chat.modelPickerInteraction') {
					assert.strictEqual(normalized.provider, 'copilotcli');
					delete normalized.provider;
				}
				if (typeof normalized.pickerSessionId === 'string') {
					if (!pickerSessionIds.includes(normalized.pickerSessionId)) {
						pickerSessionIds.push(normalized.pickerSessionId);
					}
					normalized.pickerSessionId = pickerSessionIds.indexOf(normalized.pickerSessionId);
				}
				if (normalized.durationMs !== undefined) {
					assert.ok(typeof normalized.durationMs === 'number' && normalized.durationMs >= 0, name);
					delete normalized.durationMs;
				}
				eventNames.push(name);
				(name === 'chat.modelPickerOpened' || name === 'chat.modelPickerClosed' ? pickerEvents : events).push({ name, data: normalized });
			},
		});
		instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
			override getLanguageModelIds() { return models.map(model => model.identifier); }
			override getRecentlyUsedModelIds() { return [model.identifier]; }
			override getPinnedModelIds() { return [...pinnedModelIds]; }
			// The real service reports pin changes; record what the picker passes it instead.
			override pinModel(id: string, telemetry?: IModelPinTelemetryContext) {
				pinnedModelIds.push(id);
				events.push({ name: 'pinModel', data: { id, pickerSessionId: telemetry && pickerSessionIds.indexOf(telemetry.pickerSessionId) } });
			}
			override unpinModel(id: string, telemetry?: IModelPinTelemetryContext) {
				pinnedModelIds.splice(pinnedModelIds.indexOf(id), 1);
				events.push({ name: 'unpinModel', data: { id, pickerSessionId: telemetry && pickerSessionIds.indexOf(telemetry.pickerSessionId) } });
			}
		}());
		instantiationService.stub(IProductService, { version: '1.100.0' });
		const entitlementChanged = store.add(new Emitter<void>());
		const entitlementService = new class extends TestChatEntitlementService {
			override readonly onDidChangeEntitlement = entitlementChanged.event;
		}();
		entitlementService.entitlement = entitlement;
		instantiationService.stub(IChatEntitlementService, entitlementService);
		instantiationService.stub(IUpdateService, { state: { type: StateType.Uninitialized } });
		instantiationService.stub(IUriIdentityService, { extUri });
		instantiationService.stub(IDefaultAccountService, { resolveGitHubUrl: () => 'https://github.com/settings/copilot' });
		const workspaceTrustManagementService = store.add(new TestWorkspaceTrustManagementService());
		instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustManagementService);
		instantiationService.stub(IWorkspaceTrustRequestService, { requestWorkspaceTrust: async () => { trustRequests++; return true; } });
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IConfigurationService, new TestConfigurationService());

		const picker = store.add(instantiationService.createInstance(ModelPickerWidget, {
			currentModel: constObservable(selectedModel),
			setModel: model => delegateSelections.push(model.identifier),
			setModelProgrammatically: supportsProgrammaticSelection ? model => programmaticDelegateSelections.push(model.identifier) : undefined,
			getModels: () => models,
			getChatSessionId: () => 'session-1',
			getProvider: () => 'copilotcli',
			getPresentationOptions: () => ({
				showManageModelsAction: false, showUnavailableFeatured: true,
				showAutoModel, showModelIcon: false,
			}),
			modelConfiguration: configurationAccess,
		}));
		picker.setSelectedModel(selectedModel);
		picker.show(container);

		return {
			events, pickerEvents, eventNames, openedLinks, picker, container, configurations, pinnedModelIds, delegateSelections, programmaticDelegateSelections,
			get visible() { return visible; },
			get tabbedShows() { return tabbedShows; },
			get trustRequests() { return trustRequests; },
			get tabBarActionIds() { return tabBarActionIds; },
			get listLabels() { return listLabels; },
			setTrusted: (trusted: boolean) => workspaceTrustManagementService.setWorkspaceTrust(trusted),
			/** The welcome shown in place of the active tab's list, as its title, message, and action. */
			welcome: () => {
				const body = renderWelcome();
				return body && {
					text: Array.from(body.querySelectorAll('.chat-model-picker-welcome-title, .chat-model-picker-welcome-message, .monaco-button'), part => part.textContent),
					runAction: () => body.querySelector<HTMLElement>('.monaco-button')?.click(),
				};
			},
			get contextViewLayer() { return contextViewLayer; },
			setEntitlement: (entitlement: ChatEntitlement) => {
				entitlementService.entitlement = entitlement;
				entitlementChanged.fire();
			},
			selectItem: (label: string) => selectItem(label),
			selectTab: (label: string) => selectTab(label),
			toggleAuto: () => toggleAuto(),
			hide: () => hideTabbedPicker(),
			showCard: (label: string) => showCard(label),
			backToModels: () => hideDetails(),
			get listOptions() {
				assert.ok(listOptions);
				return listOptions;
			},
		};
	}

	for (const entitlement of [ChatEntitlement.Free, ChatEntitlement.EDU]) {
		test(`${ChatEntitlement[entitlement]} entitlement replaces a persisted HydraFusion selection when the picker is constructed`, () => {
			const hydraFusion = createModel('hydrafusion');
			const result = createPicker(hydraFusion, undefined, [autoModel, hydraFusion, model], entitlement);
			assert.deepStrictEqual({
				selected: result.picker.selectedModel?.identifier,
				delegateSelections: result.delegateSelections,
				programmaticDelegateSelections: result.programmaticDelegateSelections,
			}, {
				selected: autoModel.identifier,
				delegateSelections: [],
				programmaticDelegateSelections: [autoModel.identifier],
			});
		});
	}

	test('Free entitlement falls back to setModel when the delegate has no programmatic selection', () => {
		const hydraFusion = createModel('hydrafusion');
		const result = createPicker(hydraFusion, undefined, [autoModel, hydraFusion, model], ChatEntitlement.Free, false);
		assert.deepStrictEqual({
			selected: result.picker.selectedModel?.identifier,
			delegateSelections: result.delegateSelections,
			programmaticDelegateSelections: result.programmaticDelegateSelections,
		}, {
			selected: autoModel.identifier,
			delegateSelections: [autoModel.identifier],
			programmaticDelegateSelections: [],
		});
	});

	test('explains in the Copilot tab that models will appear while none are loaded', () => {
		const result = createPicker(autoModel, undefined, []);
		assert.deepStrictEqual({ tabbedShows: result.tabbedShows, list: result.listLabels, welcome: result.welcome()?.text, tabBarActions: result.tabBarActionIds }, {
			tabbedShows: 1,
			list: [],
			welcome: ['Copilot', 'Models will appear here once they are available.'],
			tabBarActions: [],
		});
	});

	for (const entitlement of [ChatEntitlement.Free, ChatEntitlement.Pro]) {
		test(`without Auto or models, ${ChatEntitlement[entitlement]} plans are told no models are available${entitlement === ChatEntitlement.Free ? ' and offered an upgrade' : ''}`, () => {
			const result = createPicker(model, undefined, [], entitlement, true, false);
			const welcome = result.welcome();
			welcome?.runAction();
			assert.deepStrictEqual({ welcome: welcome?.text, visible: result.visible, events: result.events, openedLinks: result.openedLinks }, entitlement === ChatEntitlement.Free ? {
				welcome: ['Copilot', 'No models are available. Upgrade to GitHub Copilot Pro to use the best models.', 'Upgrade'],
				visible: false,
				events: [{ name: 'chat.modelPickerInteraction', data: { interaction: 'premiumModelUpgradePlanClicked' } }],
				openedLinks: ['command:workbench.action.chat.upgradePlan'],
			} : {
				welcome: ['Copilot', 'No models are available.'],
				visible: true,
				events: [],
				openedLinks: [],
			});
		});
	}

	test('Restricted Mode lists no cached models and offers to trust the workspace in the picker', async () => {
		const result = createPicker();
		result.hide();
		// Trust is only reported once initialized, and the change closes an open picker.
		await timeout(0);
		await result.setTrusted(false);
		result.picker.show(result.container);
		const welcome = result.welcome();
		welcome?.runAction();
		await timeout(0);
		assert.deepStrictEqual({
			list: result.listLabels,
			welcome: welcome?.text,
			tabBarActions: result.tabBarActionIds,
			visible: result.visible,
			trustRequests: result.trustRequests,
		}, {
			list: [],
			welcome: ['Restricted Mode', 'Trust this workspace to enable models.', 'Trust Workspace'],
			tabBarActions: [],
			visible: false,
			trustRequests: 1,
		});
	});

	test('forwards the requested context view layer to the picker', () => {
		const result = createPicker();
		result.hide();
		result.picker.setContextViewLayer(1);
		result.picker.show(result.container);

		assert.strictEqual(result.contextViewLayer, 1);
		result.hide();
	});

	test('the input readout opens details directly and restores the invoking control', () => {
		const result = createPicker();
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

	test('the input readout forwards dialog layering without confusing it with the details model', () => {
		const result = createPicker();
		result.picker.render(result.container);
		result.picker.show(result.container);
		result.picker.setContextViewLayer(1);
		const readout = result.container.querySelector<HTMLElement>('.model-picker-config')!;
		readout.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
		assert.deepStrictEqual({
			layer: result.contextViewLayer,
			model: result.container.querySelector('.chat-model-card-name')?.textContent,
			expanded: readout.getAttribute('aria-expanded'),
			events: result.events,
		}, { layer: 1, model: model.metadata.name, expanded: 'true', events: [] });
	});

	for (const target of ['name', 'config']) {
		test(`the Auto ${target} pill opens routing choices, not Details`, async () => {
			const result = createPicker(autoModel);
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
		test(`opening details with the ${keyboard ? 'keyboard' : 'pointer'} focuses configuration`, () => {
			const result = createPicker();
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
			}, { focusedRole: 'radio', focusedSetting: 'Thinking Effort', events: [] });
		});
	}

	test('the composite picker keeps model and configuration as separate accessible targets', () => {
		const result = createPicker();
		result.picker.render(result.container);
		const chip = result.picker.domNode!;
		const name = result.container.querySelector<HTMLElement>('.model-picker-name')!;
		const config = result.container.querySelector<HTMLElement>('.model-picker-config')!;
		assert.deepStrictEqual({
			hasConfig: chip.classList.contains('has-config'),
			targets: [name.getAttribute('role'), config.getAttribute('role')],
			summary: config.textContent,
		}, { hasConfig: true, targets: ['button', 'button'], summary: 'Medium · 264K' });
	});

	test('opening from the model name keeps the whole chip active in Auto until dismissal', () => {
		const result = createPicker();
		result.picker.render(result.container);
		result.picker.show(result.container);
		const chip = result.picker.domNode!;
		const name = result.container.querySelector<HTMLElement>('.model-picker-name')!;
		name.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
		const afterOpen = chip.classList.contains('model-picker-active');
		result.toggleAuto();
		const inAuto = chip.classList.contains('model-picker-active');
		result.picker.show(result.container);
		assert.deepStrictEqual({
			afterOpen,
			inAuto,
			afterClose: chip.classList.contains('model-picker-active'),
			nameExpanded: name.getAttribute('aria-expanded'),
		}, { afterOpen: true, inAuto: true, afterClose: false, nameExpanded: 'false' });
	});

	test('opening configuration keeps the entire picker active until dismissed', () => {
		const result = createPicker();
		result.picker.render(result.container);
		result.hide();
		const config = result.container.querySelector<HTMLElement>('.model-picker-config')!;
		config.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true, cancelable: true }));
		const state = () => ({
			wholeChipActive: result.picker.domNode!.classList.contains('model-picker-active'),
			configExpanded: config.getAttribute('aria-expanded'),
		});
		const opened = state();
		result.hide();
		assert.deepStrictEqual({ opened, closed: state() }, {
			opened: { wholeChipActive: true, configExpanded: 'true' },
			closed: { wholeChipActive: false, configExpanded: 'false' },
		});
	});

	for (const target of ['name', 'config']) {
		test(`a touch tap on the model ${target} opens the picker`, () => {
			const result = createPicker();
			result.picker.render(result.container);
			result.hide();
			const trigger = result.container.querySelector<HTMLElement>(`.model-picker-${target}`)!;
			trigger.dispatchEvent(new CustomEvent(TouchEventType.Tap, { bubbles: true, cancelable: true }));
			const opened = {
				wholeChipActive: result.picker.domNode!.classList.contains('model-picker-active'),
				expanded: trigger.getAttribute('aria-expanded'),
			};
			result.hide();
			assert.deepStrictEqual(opened, { wholeChipActive: true, expanded: 'true' });
		});
	}

	test('a disabled input readout cannot open model details', () => {
		const result = createPicker();
		result.picker.render(result.container);
		result.picker.show(result.container);
		result.picker.setEnabled(false);
		result.container.querySelector<HTMLElement>('.model-picker-config')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		assert.deepStrictEqual({ visible: result.visible, events: result.events }, { visible: false, events: [] });
	});

	test('the model-name entry retains the existing return to the previously focused editor', () => {
		const result = createPicker();
		result.picker.render(result.container);
		result.picker.show(result.container);
		const input = dom.append(result.container, dom.$('textarea'));
		input.focus();
		result.container.querySelector<HTMLElement>('.model-picker-name')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
		result.selectItem(otherModel.metadata.name);
		assert.strictEqual(document.activeElement, input);
	});

	test('closing direct details falls back to the model name when the readout disappears', () => {
		const result = createPicker();
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
		const result = createPicker();
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

	function modelChange(from: ILanguageModelChatMetadataAndIdentifier, to: ILanguageModelChatMetadataAndIdentifier, pickerSessionId = 0, { searched = false, otherModelsExpanded = false } = {}) {
		return {
			name: 'chat.modelChange',
			data: {
				fromModel: from.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(from.identifier) : 'unknown',
				toModel: to.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(to.identifier) : 'unknown',
				chatSessionId: 'session-1',
				searched,
				otherModelsExpanded,
				pickerSessionId,
			},
		};
	}

	function pinChange(pinned: boolean, target = otherModel) {
		return { name: pinned ? 'pinModel' : 'unpinModel', data: { id: target.identifier, pickerSessionId: 0 } };
	}

	function pickerOpened(pickerSessionId: number, entryPoint: string, inputMethod = 'unknown') {
		return {
			name: 'chat.modelPickerOpened',
			data: { pickerSessionId, entryPoint, inputMethod, model: new TelemetryTrustedValue(model.identifier), chatSessionId: 'session-1' },
		};
	}

	function pickerClosed(pickerSessionId: number, searched = false) {
		return { name: 'chat.modelPickerClosed', data: { pickerSessionId, searched } };
	}

	suite('picker sessions', () => {
		for (const nextModel of [otherModel, thirdPartyModel]) {
			test(`reports model selection with session correlation and ${nextModel.metadata.vendor} privacy handling`, () => {
				const result = createPicker();
				if (nextModel === thirdPartyModel) {
					result.selectTab('Third-party');
				}
				result.selectItem(nextModel.metadata.name);
				assert.deepStrictEqual(result.events, [modelChange(model, nextModel)]);
			});
		}

		test('reports only user expansion and collapse of Other Models', () => {
			const result = createPicker();
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
			const result = createPicker();
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

		test('reports the open, the change, and the close of one picker session', () => {
			const result = createPicker();
			result.selectItem(otherModel.metadata.name);
			assert.deepStrictEqual({ order: result.eventNames, pickerEvents: result.pickerEvents }, {
				order: ['chat.modelPickerOpened', 'chat.modelChange', 'chat.modelPickerClosed'],
				pickerEvents: [
					pickerOpened(0, 'command'),
					pickerClosed(0),
				],
			});
		});

		test('reports closing the picker without a change', () => {
			const result = createPicker();
			result.hide();
			assert.deepStrictEqual({ events: result.events, pickerEvents: result.pickerEvents }, {
				events: [],
				pickerEvents: [pickerOpened(0, 'command'), pickerClosed(0)],
			});
		});

		test('reports searching the model list without the query when leaving without a switch', () => {
			const result = createPicker();
			result.listOptions.onDidChangeFilter?.('private');
			result.hide();
			assert.deepStrictEqual(result.pickerEvents, [pickerOpened(0, 'command'), pickerClosed(0, true)]);
		});

		test('reports whether the user searched and expanded Other Models before switching', () => {
			const result = createPicker();
			result.listOptions.onDidChangeFilter?.('other');
			result.listOptions.onDidToggleSection?.('other', false);
			result.selectItem(otherModel.metadata.name);
			assert.deepStrictEqual(result.events.filter(event => event.name === 'chat.modelChange'), [
				modelChange(model, otherModel, 0, { searched: true, otherModelsExpanded: true }),
			]);
		});

		for (const change of [
			{ model, label: 'High', event: 'chat.thinkingEffortChange', property: 'reasoningEffort', fromValue: 'medium', toValue: 'high' },
			{ model, label: '1M', event: 'chat.contextSizeChange', fromValue: '264000', toValue: '1000000' },
			{ model: autoModel, label: 'Efficiency', event: 'chat.thinkingEffortChange', property: 'tier', fromValue: 'balance', toValue: 'efficiency' },
			{ model: thirdPartyModel, label: 'High', event: 'chat.thinkingEffortChange', property: 'unknown', fromValue: 'medium', toValue: 'high' },
		]) {
			test(`reports ${change.model.metadata.vendor} ${change.property ?? 'context size'} changes`, async () => {
				const result = createPicker(change.model);
				if (change.model === autoModel) {
					result.selectItem(change.label);
				} else {
					option(result.showCard(change.model.metadata.name), change.label).click();
				}
				await timeout(0);
				assert.deepStrictEqual(result.events, [{
					name: change.event,
					data: {
						model: change.model.metadata.vendor === 'copilot' ? new TelemetryTrustedValue(change.model.identifier) : 'unknown',
						...(change.property ? { property: change.property } : {}),
						fromValue: change.fromValue,
						toValue: change.toValue,
						pickerSessionId: 0,
					},
				}]);
			});
		}
	});

	test('the tabbed picker reports pins from model cards and typed searches', () => {
		const result = createPicker();
		result.listOptions.onType?.('p');
		result.showCard(otherModel.metadata.name);
		result.container.querySelector<HTMLElement>('[aria-label="Pin Model"]')!.click();
		result.hide();
		assert.deepStrictEqual({ pins: result.events.filter(event => event.name === 'pinModel'), pickerEvents: result.pickerEvents }, {
			pins: [pinChange(true)],
			pickerEvents: [pickerOpened(0, 'command'), pickerClosed(0, true)],
		});
	});

	for (const { target, keyboard } of [{ target: 'name', keyboard: false }, { target: 'config', keyboard: true }]) {
		test(`opening the tabbed picker from the ${target} pill reports its entry point and input`, () => {
			const result = createPicker();
			result.picker.render(result.container);
			result.hide();
			result.container.querySelector<HTMLElement>(`.model-picker-${target}`)!.dispatchEvent(keyboard
				? new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
				: new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
			assert.deepStrictEqual(result.pickerEvents.slice(2), [
				pickerOpened(1, target === 'name' ? 'modelName' : 'configuration', keyboard ? 'keyboard' : 'mouse'),
			]);
		});
	}

	test('reports the time from opening to each change and to the close, waiting for pending saves', async () => {
		const logged: { name: string; durationMs: unknown; pickerSessionId: unknown }[] = [];
		let now = 1000;
		const session = new ModelPickerTelemetrySession(upcastPartial<ITelemetryService>({
			publicLog2: (name: string, data?: IStringDictionary<unknown>) => {
				assert.strictEqual(data?.provider, 'codex-openai');
				logged.push({ name, durationMs: data?.durationMs, pickerSessionId: data?.pickerSessionId });
			},
		}), new NullLanguageModelsService(), { entryPoint: 'modelName', inputMethod: 'mouse' }, model, 'session-1', 'codex-openai', () => now);
		now = 1250.4;
		session.logModelChange(model, otherModel, 'session-1');
		now = 2000;
		const saved = new DeferredPromise<void>();
		session.close(saved.p);
		session.close();
		now = 3000;
		// A change requested at 1600 whose save only finishes after the close.
		session.logConfigurationChange(otherModel, 'tokens', 'contextSize', 264000, 1000000, 1600);
		const beforeSave = logged.map(event => event.name);
		await saved.complete();
		await timeout(0);
		assert.deepStrictEqual({ beforeSave, logged }, {
			beforeSave: ['chat.modelPickerOpened', 'chat.modelChange', 'chat.contextSizeChange'],
			logged: [
				{ name: 'chat.modelPickerOpened', durationMs: undefined, pickerSessionId: session.id },
				{ name: 'chat.modelChange', durationMs: 250, pickerSessionId: session.id },
				{ name: 'chat.contextSizeChange', durationMs: 600, pickerSessionId: session.id },
				{ name: 'chat.modelPickerClosed', durationMs: 1000, pickerSessionId: session.id },
			],
		});
	});

	test('dismissing during a pending configuration save still reports the change before the close', async () => {
		const saved = new DeferredPromise<void>();
		const result = createPicker(model, () => saved.p);
		option(result.showCard(model.metadata.name), 'High').click();
		result.hide();
		result.picker.show(result.container);
		const beforeSave = [...result.eventNames];
		await saved.complete();
		await timeout(0);
		assert.deepStrictEqual({ beforeSave, after: result.eventNames.slice(beforeSave.length) }, {
			beforeSave: ['chat.modelPickerOpened', 'chat.modelPickerOpened'],
			after: ['chat.thinkingEffortChange', 'chat.modelPickerClosed'],
		});
	});

	test('disposing an open tabbed picker reports its close', () => {
		const result = createPicker();
		result.picker.dispose();
		assert.deepStrictEqual(result.pickerEvents, [pickerOpened(0, 'command'), pickerClosed(0)]);
	});

	test('returning to the list during a speed change does not report a revert to Standard', () => {
		const result = createPicker();
		option(result.showCard(model.metadata.name), 'Fast').click();
		result.selectItem(fastModel.metadata.name);

		assert.deepStrictEqual({ selected: result.picker.selectedModel?.identifier, events: result.events }, {
			selected: fastModel.identifier,
			events: [modelChange(model, fastModel), modelChange(fastModel, fastModel)],
		});
	});

	for (const initiallyFast of [false, true]) {
		test(`selecting a remembered speed through search reports Fast (initially fast: ${initiallyFast})`, async () => {
			const result = createPicker(initiallyFast ? fastModel : model);
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
					// Selecting a model closes the picker, so the reopened picker is a new session.
					modelChange(otherModel, fastModel, 1, { searched: true }),
				],
			});
		});
	}

	test('pinning a model then changing speed preserves its pin without a configuration event', async () => {
		const result = createPicker();
		const card = result.showCard(model.metadata.name);
		result.container.querySelector<HTMLElement>('[aria-label="Pin Model"]')!.click();
		option(card, 'Fast').click();
		await timeout(0);
		result.showCard(fastModel.metadata.name);
		result.container.querySelector<HTMLElement>('[aria-label="Unpin Model"]')!.click();

		assert.deepStrictEqual({ pinned: result.pinnedModelIds, events: result.events }, {
			pinned: [],
			events: [pinChange(true, model), modelChange(model, fastModel), pinChange(false, model)],
		});
	});

	test('switching between agent-host Copilot models reports their ids rather than unknown', () => {
		// Copies of the built-in models an agent host relays name another vendor but keep
		// the built-in provider's group, as in the Copilot CLI session reported in #338061.
		const relayed = (target: ILanguageModelChatMetadataAndIdentifier) => createModel(target.metadata.id, {
			vendor: 'agent-host-copilotcli', isBYOK: true, modelGroup: { id: 'copilot' }, configurationSchema: target.metadata.configurationSchema,
		});
		const relayedAuto = relayed(autoModel);
		const relayedModel = relayed(model);
		const result = createPicker(relayedAuto, undefined, [relayedAuto, relayedModel]);
		result.toggleAuto();
		assert.deepStrictEqual(result.events, [{
			name: 'chat.modelChange',
			data: {
				fromModel: new TelemetryTrustedValue('agent-host-copilotcli/auto'),
				toModel: new TelemetryTrustedValue('agent-host-copilotcli/test-model'),
				chatSessionId: 'session-1', searched: false, otherModelsExpanded: false, pickerSessionId: 0,
			},
		}]);
	});

	test('tabbed Auto toggles report the current previous model while the popup stays open', () => {
		const result = createPicker();
		result.toggleAuto();
		result.toggleAuto();
		result.toggleAuto();
		assert.deepStrictEqual(result.events, [modelChange(model, autoModel), modelChange(autoModel, model), modelChange(model, autoModel)]);
	});

	test('activating the remembered Auto tier only reports switching to Auto', async () => {
		const result = createPicker();
		result.toggleAuto();
		result.selectItem('Balance');
		await timeout(0);
		assert.deepStrictEqual(result.events, [modelChange(model, autoModel)]);
	});

	test('activating the current Auto tier while already enabled does not report a change', async () => {
		const result = createPicker(autoModel);
		result.selectItem('Balance');
		await timeout(0);
		assert.deepStrictEqual(result.events, []);
	});

	test('enabling Auto and then changing the tier reports each change once', async () => {
		const result = createPicker();
		result.toggleAuto();
		result.selectItem('Intelligence');
		await timeout(0);
		assert.deepStrictEqual(result.events, [modelChange(model, autoModel), {
			name: 'chat.thinkingEffortChange',
			data: { model: new TelemetryTrustedValue(autoModel.identifier), property: 'tier', fromValue: 'balance', toValue: 'intelligence', pickerSessionId: 0 },
		}]);
	});

	test('configuring another model reports both the configuration and model change', async () => {
		const result = createPicker();
		option(result.showCard(otherModel.metadata.name), 'High').click();
		await timeout(0);
		assert.deepStrictEqual(result.events, [{
			name: 'chat.thinkingEffortChange',
			data: { model: new TelemetryTrustedValue(otherModel.identifier), property: 'reasoningEffort', fromValue: 'medium', toValue: 'high', pickerSessionId: 0 },
		}, modelChange(model, otherModel)]);
	});

	test('multiple configuration changes and pinning preserve the tabbed picker and the same card', async () => {
		const result = createPicker();
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
			const result = createPicker(model, async id => {
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
					data: { model: new TelemetryTrustedValue(model.identifier), property: 'reasoningEffort', fromValue: 'medium', toValue: 'high', pickerSessionId: 0 },
				})),
				visible: true,
			});
		});
	}
});
