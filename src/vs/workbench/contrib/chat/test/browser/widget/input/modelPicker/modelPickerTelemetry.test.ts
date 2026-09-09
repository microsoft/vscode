/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { Emitter } from '../../../../../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../../../base/common/observable.js';
import { extUri } from '../../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { ActionListItemKind, IActionListItem, IActionListOptions } from '../../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { TabbedActionListWidget } from '../../../../../../../../platform/actionWidget/browser/tabbedActionListWidget.js';
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

	function createPicker(tabbed: boolean, selectedModel = model) {
		const instantiationService = store.add(new TestInstantiationService());
		const events: { name: string; data: unknown }[] = [];
		const openedLinks: string[] = [];
		const configurations = new Map<string, IStringDictionary<unknown>>();
		const configurationAccess: IModelConfigurationAccess = {
			getModelConfiguration: id => configurations.get(id),
			setModelConfiguration: async (id, values) => { configurations.set(id, { ...configurations.get(id), ...values }); },
			getModelConfigurationActions: () => [],
		};
		const models = [autoModel, model, otherModel, thirdPartyModel];
		const container = dom.append(mainWindow.document.body, dom.$('.monaco-reduce-motion'));
		store.add(toDisposable(() => container.remove()));
		const footer = dom.append(container, dom.$('div'));
		const footerDisposable = store.add(new MutableDisposable());
		const onDidHide = store.add(new Emitter<void>());
		const onDidChangeTab = store.add(new Emitter<string>());
		let visible = false;
		let listOptions: IActionListOptions | undefined;
		let selectItem: (label: string) => void = () => assert.fail('Picker has not opened');
		let selectTab: (label: string) => void = () => assert.fail('Tabbed picker has not opened');
		let showCard: (label: string) => HTMLElement = () => assert.fail('Picker has not opened');
		let refreshList = () => { };
		let hideFlatPicker = () => { };

		function setItems<T>(items: readonly IActionListItem<T>[], onSelect: (item: T) => void): void {
			selectItem = label => {
				const item = items.find(item => item.label === label);
				assert.ok(item?.item, label);
				onSelect(item.item);
			};
			showCard = label => {
				const content = items.find(item => item.label === label)?.hover?.content;
				assert.ok(typeof content === 'function');
				const card = content();
				assert.ok(dom.isHTMLElement(card));
				container.appendChild(card);
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
			show: options => {
				visible = true;
				let activeTab = options.initialTab;
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
				footerDisposable.clear();
				dom.clearNode(footer);
				footerDisposable.value = options.renderFooter?.(footer, options.initialTab);
			},
			refreshActiveList: () => refreshList(),
			hide: () => {
				visible = false;
				footerDisposable.clear();
				onDidHide.fire();
			},
			dispose: () => footerDisposable.clear(),
		});
		instantiationService.stub(ICommandService, {});
		instantiationService.stub(IOpenerService, { open: async resource => { openedLinks.push(resource.toString()); return true; } });
		instantiationService.stub(ITelemetryService, { publicLog2: (name, data) => { events.push({ name, data }); } });
		instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
			override getLanguageModelIds() { return models.map(model => model.identifier); }
			override getRecentlyUsedModelIds() { return [model.identifier]; }
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
			events, openedLinks, picker, container,
			selectItem: (label: string) => selectItem(label),
			selectTab: (label: string) => selectTab(label),
			showCard: (label: string) => showCard(label),
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
					if (tabbed) {
						const container = change.model === autoModel ? result.container : result.showCard(change.model.metadata.name);
						option(container, change.label).click();
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

	test('tabbed Auto toggles report the current previous model while the popup stays open', () => {
		const result = createPicker(true);
		const toggle = result.container.querySelector<HTMLElement>('[role="switch"]');
		assert.ok(toggle);
		toggle.click();
		toggle.click();
		toggle.click();
		assert.deepStrictEqual(result.events, [modelChange(model, autoModel), modelChange(autoModel, model), modelChange(model, autoModel)]);
	});

	test('activating the remembered Auto tier only reports switching to Auto', async () => {
		const result = createPicker(true);
		option(result.container, 'Balance').click();
		await timeout(0);
		assert.deepStrictEqual(result.events, [modelChange(model, autoModel)]);
	});

	test('changing the Auto tier while off reports the tier change and switching to Auto once', async () => {
		const result = createPicker(true);
		option(result.container, 'Intelligence').click();
		await timeout(0);
		assert.deepStrictEqual(result.events, [{
			name: 'chat.thinkingEffortChange',
			data: { model: new TelemetryTrustedValue(autoModel.identifier), property: 'tier', fromValue: 'balance', toValue: 'intelligence' },
		}, modelChange(model, autoModel)]);
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
});
