/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../../base/browser/dom.js';
import { IManagedHoverContentOrFactory } from '../../../../../../../../base/browser/ui/hover/hover.js';
import { Switch } from '../../../../../../../../base/browser/ui/toggle/switch.js';
import { mainWindow } from '../../../../../../../../base/browser/window.js';
import { toAction } from '../../../../../../../../base/common/actions.js';
import { DeferredPromise, timeout } from '../../../../../../../../base/common/async.js';
import { IStringDictionary } from '../../../../../../../../base/common/collections.js';
import { Emitter, Event as CommonEvent } from '../../../../../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from '../../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, transaction } from '../../../../../../../../base/common/observable.js';
import { extUri } from '../../../../../../../../base/common/resources.js';
import { upcastPartial } from '../../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ActionWidgetService, IActionWidgetService } from '../../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { ICommandService } from '../../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../../platform/contextkey/common/contextkey.js';
import { IContextViewDelegate, IContextViewService } from '../../../../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../../../../platform/contextview/browser/contextViewService.js';
import { IDefaultAccountService } from '../../../../../../../../platform/defaultAccount/common/defaultAccount.js';
import { IHoverService } from '../../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { TestInstantiationService } from '../../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { ILayoutService } from '../../../../../../../../platform/layout/browser/layoutService.js';
import { ILogService, NullLogService } from '../../../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { IProductService } from '../../../../../../../../platform/product/common/productService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../../platform/telemetry/common/telemetry.js';
import { IUpdateService, StateType } from '../../../../../../../../platform/update/common/update.js';
import { IUriIdentityService } from '../../../../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../../../platform/workspace/common/workspaceTrust.js';
import { ChatEntitlement, IChatEntitlementService } from '../../../../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService, TestWorkspaceTrustManagementService } from '../../../../../../../test/common/workbenchTestServices.js';
import { IModelPickerAdditionalContentContext, IModelPickerDelegate, IModelPickerSelectionPresentation, ModelPickerActionItem } from '../../../../../browser/widget/input/modelPicker/modelPickerActionItem.js';
import { IModelConfigurationAccess, MODEL_CONFIG_GROUP_EFFORT } from '../../../../../browser/widget/input/modelPicker/modelPickerModelConfig.js';
import { ModelPickerWidget, TABBED_MODEL_PICKER_SETTING_ID } from '../../../../../browser/widget/input/modelPicker/modelPickerWidget.js';
import { ModelPickerInlineWidget } from '../../../../../browser/widget/input/modelPicker/modelPickerInlineWidget.js';
import { ILanguageModelChatMetadata, ILanguageModelChatMetadataAndIdentifier, ILanguageModelProviderDescriptor, ILanguageModelsService } from '../../../../../common/languageModels.js';
import { NullLanguageModelsService } from '../../../../common/languageModels.js';

function createModel(id: string, name: string, vendor = 'copilot'): ILanguageModelChatMetadataAndIdentifier {
	return {
		identifier: `${vendor}/${id}`,
		metadata: upcastPartial<ILanguageModelChatMetadata>({
			id, name, vendor, family: id, version: '1.0',
			maxInputTokens: 128000, maxOutputTokens: 4096, isDefaultForLocation: {},
			configurationSchema: {
				properties: {
					reasoningEffort: { type: 'string', title: 'Thinking Effort', group: 'navigation', enum: ['medium', 'high'], enumItemLabels: ['Medium', 'High'], default: 'medium' },
				},
			},
		}),
	};
}

const MODEL = createModel('example', 'Example Model');
const LOCAL_MODEL = createModel('local', 'Local Model', 'local');
const AUTO_MODEL = createModel('auto', 'Auto');
const ALTERNATE_SELECTION: IModelPickerSelectionPresentation = {
	label: 'Saved +2',
	ariaLabel: 'Saved choice with three participants',
	tooltip: 'Saved choice: Example Model and two other participants',
};

async function waitForLayout(element: HTMLElement): Promise<void> {
	const targetWindow = dom.getWindow(element);
	await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => targetWindow.requestAnimationFrame(() => resolve())));
	await timeout(0);
}

suite('ModelPickerWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function createPicker(tabbed: boolean, options: {
		selectionPresentation?: IModelPickerSelectionPresentation;
		selectedModel?: ILanguageModelChatMetadataAndIdentifier;
		restrictedMode?: boolean;
		setupRequired?: boolean;
		compact?: boolean;
		workspaceTrustInitialized?: Promise<void>;
		additionalContent?: IModelPickerDelegate['getAdditionalContent'];
		realPopup?: boolean;
	} = {}) {
		const instantiationService = store.add(new TestInstantiationService());
		const container = dom.append(mainWindow.document.body, dom.$('.monaco-workbench.monaco-reduce-motion'));
		container.style.position = 'fixed';
		container.style.bottom = '0';
		container.style.width = '640px';
		container.style.height = options.realPopup ? '600px' : '';
		const layoutContainer = options.realPopup ? container : mainWindow.document.body;
		const onDidLayoutContainer = store.add(new Emitter<{ readonly container: HTMLElement; readonly dimension: dom.IDimension }>());
		instantiationService.stub(ILayoutService, {
			getContainer: () => layoutContainer,
			mainContainer: layoutContainer,
			activeContainer: layoutContainer,
			onDidChangeActiveContainer: CommonEvent.None,
			onDidAddContainer: CommonEvent.None,
			onDidLayoutMainContainer: CommonEvent.None,
			onDidLayoutActiveContainer: CommonEvent.None,
			onDidLayoutContainer: onDidLayoutContainer.event,
		});
		const activeRender = store.add(new MutableDisposable());
		let activeDelegate: IContextViewDelegate | undefined;
		const hide = (): void => {
			if (options.realPopup) {
				contextViewService.hideContextView();
				return;
			}
			const delegate = activeDelegate;
			activeDelegate = undefined;
			delegate?.onHide?.();
			activeRender.clear();
			dom.clearNode(popup);
		};
		store.add(toDisposable(hide));
		const contextViewService: IContextViewService = options.realPopup ? store.add(instantiationService.createInstance(ContextViewService)) : upcastPartial<IContextViewService>({
			showContextView: delegate => {
				hide();
				activeDelegate = delegate;
				activeRender.value = delegate.render(popup);
				delegate.focus?.();
				return { close: hide };
			},
			hideContextView: hide,
			getContextViewElement: (): HTMLElement => popup,
			layout: () => { },
		});
		instantiationService.stub(IContextViewService, contextViewService);
		const popup: HTMLElement = options.realPopup ? contextViewService.getContextViewElement() : dom.append(mainWindow.document.body, dom.$('.monaco-reduce-motion'));
		store.add(toDisposable(() => { container.remove(); popup.remove(); }));
		const isVisible = () => options.realPopup ? popup.style.display !== 'none' : !!activeDelegate;
		const configurationService = new TestConfigurationService({ [TABBED_MODEL_PICKER_SETTING_ID]: tabbed });
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, store.add(new ContextKeyService(configurationService)));
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
			override isMotionReduced(): boolean { return true; }
		}());
		const hovers = new Map<HTMLElement, { content: IManagedHoverContentOrFactory }>();
		instantiationService.stub(IHoverService, {
			...NullHoverService,
			setupManagedHover: (_delegate, target, content) => {
				const entry = { content };
				hovers.set(target, entry);
				return {
					show: () => { },
					hide: () => { },
					update: content => { entry.content = content; },
					dispose: () => {
						if (hovers.get(target) === entry) {
							hovers.delete(target);
						}
					},
				};
			},
		});
		instantiationService.set(IOpenerService, NullOpenerService);
		instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
		const telemetryEvents: string[] = [];
		instantiationService.stub(ITelemetryService, { publicLog2: name => { telemetryEvents.push(name); } });
		instantiationService.stub(IProductService, { version: '1.100.0' });
		instantiationService.stub(IUpdateService, { state: { type: StateType.Uninitialized } });
		instantiationService.stub(ILogService, new NullLogService());
		const notificationErrors: string[] = [];
		instantiationService.stub(INotificationService, { error: (error: string | Error) => notificationErrors.push(String(error)) });
		instantiationService.stub(IUriIdentityService, { extUri });
		instantiationService.stub(IDefaultAccountService, { resolveGitHubUrl: () => 'https://github.com/settings/copilot' });
		instantiationService.stub(IWorkspaceTrustRequestService, {});
		const trustService = store.add(new class extends TestWorkspaceTrustManagementService {
			override get workspaceTrustInitialized(): Promise<void> {
				return options.workspaceTrustInitialized ?? super.workspaceTrustInitialized;
			}
		}(!options.restrictedMode));
		instantiationService.stub(IWorkspaceTrustManagementService, trustService);
		const entitlement = new TestChatEntitlementService();
		entitlement.entitlement = options.setupRequired ? ChatEntitlement.Available : ChatEntitlement.Pro;
		instantiationService.stub(IChatEntitlementService, entitlement);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		const models = options.setupRequired ? [] : [AUTO_MODEL, MODEL, LOCAL_MODEL];
		const modelHistoryCalls: string[] = [];
		instantiationService.stub(ILanguageModelsService, new class extends NullLanguageModelsService {
			override getLanguageModelIds() { return models.map(model => model.identifier); }
			override getRecentlyUsedModelIds() { return [MODEL.identifier]; }
			override addToRecentlyUsedList() { modelHistoryCalls.push('recent'); }
			override pinModel(id: string) { modelHistoryCalls.push(`pin:${id}`); }
			override unpinModel(id: string) { modelHistoryCalls.push(`unpin:${id}`); }
			override getVendors(): ILanguageModelProviderDescriptor[] {
				return [
					upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'copilot', displayName: 'GitHub Copilot', isDefault: true }),
					upcastPartial<ILanguageModelProviderDescriptor>({ vendor: 'local', displayName: 'Local', isDefault: false }),
				];
			}
		}());
		const configurations = new Map<string, IStringDictionary<unknown>>();
		const configurationAccess: IModelConfigurationAccess = {
			getModelConfiguration: id => configurations.get(id),
			setModelConfiguration: async (id, values) => { configurations.set(id, { ...configurations.get(id), ...values }); },
			getModelConfigurationActions: () => [],
		};
		const actionWidgetService = store.add(instantiationService.createInstance(ActionWidgetService));
		instantiationService.stub(IActionWidgetService, actionWidgetService);
		const currentModel = observableValue<ILanguageModelChatMetadataAndIdentifier | undefined>('currentModel', options.selectedModel ?? MODEL);
		const selectionPresentation = observableValue<IModelPickerSelectionPresentation | undefined>('selectionPresentation', options.selectionPresentation);
		const selections: string[] = [];
		let contentReads = 0;
		const delegate: IModelPickerDelegate = {
			currentModel,
			selectionPresentation,
			setModel: model => {
				selections.push(model.identifier);
				transaction(tx => {
					currentModel.set(model, tx);
					selectionPresentation.set(undefined, tx);
				});
			},
			getModels: () => models,
			getPresentationOptions: () => ({
				useGroupedModelPicker: true, showManageModelsAction: false, showUnavailableFeatured: false,
				showFeatured: true, showAutoModel: true, showModelIcon: true,
			}),
			modelConfiguration: configurationAccess,
			getAdditionalContent: options.additionalContent ? () => {
				contentReads++;
				return options.additionalContent!();
			} : undefined,
		};
		const picker = store.add(instantiationService.createInstance(ModelPickerActionItem,
			toAction({ id: 'pickModel', label: 'Models', run: () => { } }), delegate, { compact: constObservable(options.compact ?? false) }));
		picker.render(container);
		if (options.realPopup) {
			const anchor = container.querySelector<HTMLElement>('.model-picker-split');
			assert.ok(anchor);
			anchor.style.position = 'absolute';
			anchor.style.bottom = '0';
		}
		if (!options.workspaceTrustInitialized) {
			await trustService.workspaceTrustInitialized;
		}

		const nameButton = () => {
			const button = container.querySelector<HTMLElement>('.model-picker-name');
			assert.ok(button);
			return button;
		};
		const rows = () => [...popup.querySelectorAll<HTMLElement>('.monaco-list-row.action')];
		const row = (label: string) => {
			const result = rows().find(row => row.textContent?.includes(label));
			assert.ok(result, `Missing action row: ${label}`);
			return result;
		};
		const createStandalonePicker = async (overrides: Partial<IModelPickerDelegate> = {}) => {
			const standaloneDelegate: IModelPickerDelegate = {
				...delegate,
				selectionPresentation: undefined,
				getAdditionalContent: undefined,
				...overrides,
			};
			const standalone = store.add(instantiationService.createInstance(ModelPickerWidget, standaloneDelegate));
			store.add(standalone.onDidChangeSelection(model => standaloneDelegate.setModel(model)));
			await trustService.workspaceTrustInitialized;
			return standalone;
		};
		const openModelConfiguration = () => {
			const list = popup.querySelector<HTMLElement>('.monaco-list');
			assert.ok(list);
			if (!tabbed) {
				actionWidgetService.focusItemById(MODEL.identifier);
			}
			list.focus();
			list.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight', keyCode: 39 }));
			if (!tabbed) {
				const button = popup.querySelector<HTMLElement>('.chat-model-hover-configurable .monaco-button');
				assert.ok(button);
				button.click();
			}
		};
		const configurationOption = (label: string) => {
			if (!tabbed) {
				return row(label);
			}
			const option = [...popup.querySelectorAll<HTMLElement>('.chat-model-card [role="radio"]')].find(option => option.textContent === label);
			assert.ok(option);
			return option;
		};
		return {
			picker, container, popup, currentModel, selectionPresentation, selections, telemetryEvents,
			modelHistoryCalls, configurations, actionWidgetService, hovers, hide, nameButton, rows, row, createStandalonePicker, openModelConfiguration, configurationOption,
			notificationErrors,
			createInlinePicker: (overrides: Partial<IModelPickerDelegate> = {}) => {
				const inlineDelegate = { ...delegate, ...overrides };
				const inline = store.add(instantiationService.createInstance(ModelPickerInlineWidget, inlineDelegate));
				inline.setSelectedModel(inlineDelegate.currentModel.get());
				store.add(inline.onDidChangeSelection(model => inlineDelegate.setModel(model)));
				return inline;
			},
			layoutWorkbench: () => onDidLayoutContainer.fire({ container: layoutContainer, dimension: dom.getClientArea(layoutContainer) }),
			get visible() { return isVisible(); },
			get contentReads() { return contentReads; },
			show: () => {
				nameButton().focus();
				picker.show();
			},
			presentation: () => {
				const button = nameButton();
				const content = hovers.get(button)?.content;
				return {
					label: button.querySelector('.chat-input-picker-label')?.textContent,
					ariaLabel: button.ariaLabel,
					tooltip: typeof content === 'function' ? content() : content,
				};
			},
		};
	}

	suite('inline picker', () => {
		test('refocusing model choices preserves the search and existing list', async () => {
			const result = await createPicker(false);
			const parent = dom.append(result.container, dom.$('div'));
			const inline = result.createInlinePicker();
			inline.show(parent, 'Choose Worker Model');
			const input = parent.querySelector<HTMLInputElement>('input[role="combobox"]');
			assert.ok(input);
			input.value = 'Local';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			await waitForLayout(parent);
			const list = parent.querySelector('.monaco-list');
			result.nameButton().focus();
			inline.focus();
			assert.deepStrictEqual({
				focused: dom.getActiveElement() === input,
				sameList: parent.querySelector('.monaco-list') === list,
				query: input.value,
				choices: [...parent.querySelectorAll('.monaco-list-row.action')].map(row => row.textContent?.trim()),
				selections: result.selections,
				externalPopup: result.visible,
			}, { focused: true, sameList: true, query: 'Local', choices: ['Local Model'], selections: [], externalPopup: false });
		});

		test('refocusing reasoning choices uses the existing list without changing configuration', async () => {
			const result = await createPicker(false);
			const parent = dom.append(result.container, dom.$('div'));
			const inline = result.createInlinePicker();
			inline.show(parent, 'Worker Reasoning', MODEL_CONFIG_GROUP_EFFORT);
			const list = parent.querySelector<HTMLElement>('[role="menu"]');
			assert.ok(list);
			result.nameButton().focus();
			inline.focus();
			assert.deepStrictEqual({
				focused: dom.getActiveElement() === list,
				sameList: parent.querySelector('[role="menu"]') === list,
				configurationWrites: result.configurations.size,
				externalPopup: result.visible,
			}, { focused: true, sameList: true, configurationWrites: 0, externalPopup: false });
		});

		test('search and keyboard selection stay inside the owning surface', async () => {
			const result = await createPicker(false);
			const parent = dom.append(result.container, dom.$('div'));
			const inline = result.createInlinePicker();
			inline.show(parent, 'Choose Worker Model');
			const input = parent.querySelector<HTMLInputElement>('input[role="combobox"]');
			assert.ok(input);
			input.value = 'Local';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			await waitForLayout(parent);
			const visibleChoices = [...parent.querySelectorAll('.monaco-list-row.action')].map(row => row.textContent?.trim());
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			await waitForLayout(parent);
			assert.deepStrictEqual({
				visibleChoices,
				selections: result.selections,
				parentConnected: parent.isConnected,
				inlineClosed: !parent.querySelector('.chat-model-picker-inline'),
				externalPopup: result.visible,
			}, { visibleChoices: ['Local Model'], selections: [LOCAL_MODEL.identifier], parentConnected: true, inlineClosed: true, externalPopup: false });
		});

		test('reasoning keyboard selection saves only the selected model configuration', async () => {
			const result = await createPicker(false);
			const parent = dom.append(result.container, dom.$('div'));
			const inline = result.createInlinePicker();
			inline.show(parent, 'Worker Reasoning', MODEL_CONFIG_GROUP_EFFORT);
			const menu = parent.querySelector<HTMLElement>('[role="menu"]');
			assert.ok(menu);
			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true, cancelable: true }));
			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			await waitForLayout(parent);
			assert.deepStrictEqual({
				configuration: result.configurations.get(MODEL.identifier),
				selections: result.selections,
				parentConnected: parent.isConnected,
				inlineClosed: !parent.querySelector('.chat-model-picker-inline'),
				externalPopup: result.visible,
			}, { configuration: { reasoningEffort: 'high' }, selections: [], parentConnected: true, inlineClosed: true, externalPopup: false });
		});

		test('Escape dismisses only the inline choices', async () => {
			const result = await createPicker(false);
			const parent = dom.append(result.container, dom.$('div'));
			let escapedParent = false;
			store.add(dom.addDisposableListener(parent, 'keydown', () => escapedParent = true));
			const inline = result.createInlinePicker();
			inline.show(parent, 'Choose Worker Model');
			const input = parent.querySelector<HTMLInputElement>('input');
			assert.ok(input);
			input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
			assert.deepStrictEqual({
				escapedParent, parentConnected: parent.isConnected,
				inlineClosed: !parent.querySelector('.chat-model-picker-inline'), selections: result.selections,
			}, { escapedParent: false, parentConnected: true, inlineClosed: true, selections: [] });
		});

		test('read-only configuration cannot be changed through inline choices', async () => {
			const model: ILanguageModelChatMetadataAndIdentifier = {
				...MODEL,
				metadata: {
					...MODEL.metadata,
					configurationSchema: {
						properties: {
							reasoningEffort: { group: MODEL_CONFIG_GROUP_EFFORT, enum: ['medium', 'high'], default: 'medium', readOnly: true },
						},
					},
				},
			};
			const result = await createPicker(false, { selectedModel: model });
			const parent = dom.append(result.container, dom.$('div'));
			const inline = result.createInlinePicker();
			inline.show(parent, 'Worker Reasoning', MODEL_CONFIG_GROUP_EFFORT);
			const menu = parent.querySelector<HTMLElement>('[role="menu"]');
			assert.ok(menu);
			menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true }));
			await waitForLayout(parent);
			assert.deepStrictEqual({
				readOnlyAnnounced: [...parent.querySelectorAll('[role="menuitemradio"]')].map(option => option.getAttribute('aria-label')?.includes('Read-only')),
				writes: result.configurations.size,
				open: !!parent.querySelector('.chat-model-picker-inline'),
			}, { readOnlyAnnounced: [true, true], writes: 0, open: true });
		});

		test('failed reasoning saves stay open and report the error', async () => {
			const result = await createPicker(false);
			const parent = dom.append(result.container, dom.$('div'));
			const inline = result.createInlinePicker({
				modelConfiguration: {
					getModelConfiguration: () => ({ reasoningEffort: 'medium' }),
					getModelConfigurationActions: () => [],
					setModelConfiguration: async () => { throw new Error('Unable to save reasoning'); },
				},
			});
			inline.show(parent, 'Worker Reasoning', MODEL_CONFIG_GROUP_EFFORT);
			const high = [...parent.querySelectorAll<HTMLElement>('[role="menuitemradio"]')].find(row => row.textContent?.includes('High'));
			assert.ok(high);
			high.click();
			await waitForLayout(parent);
			assert.deepStrictEqual({
				open: !!parent.querySelector('.chat-model-picker-inline'),
				busy: parent.querySelector('.chat-model-picker-inline')?.getAttribute('aria-busy'),
				errors: result.notificationErrors,
				checked: parent.querySelector('[role="menuitemradio"][aria-checked="true"]')?.textContent?.trim(),
			}, { open: true, busy: 'false', errors: ['Error: Unable to save reasoning'], checked: 'MediumDefault' });
		});
	});

	for (const tabbed of [false, true]) {
		suite(tabbed ? 'tabbed picker' : 'classic picker', () => {
			test('header-only content preserves the normal model UI and width', async () => {
				const ordinary = await createPicker(tabbed, { realPopup: true });
				ordinary.show();
				const ordinaryWidth = ordinary.popup.querySelector<HTMLElement>('.action-widget')?.style.width;
				ordinary.hide();
				const result = await createPicker(tabbed, {
					realPopup: true,
					additionalContent: () => ({
						renderHeader: container => {
							dom.append(container, dom.$('button', { type: 'button' }, 'Team'));
							return Disposable.None;
						},
					}),
				});
				result.show();
				await waitForLayout(result.popup);
				const widget = result.popup.querySelector<HTMLElement>('.action-widget');
				assert.deepStrictEqual({
					visible: result.visible,
					headerFirst: widget?.firstElementChild?.classList.contains('action-list-custom-header'),
					width: widget?.style.width,
					hasModel: result.rows().some(row => row.textContent?.includes('Example Model')),
					hasSearch: !!result.popup.querySelector(tabbed ? '[data-id="search"]' : 'input'),
					customFooter: !!result.popup.querySelector('.action-list-custom-footer'),
				}, {
					visible: true, headerFirst: true, width: ordinaryWidth,
					hasModel: true, hasSearch: true, customFooter: false,
				});
			});

			test('replacement content has no model list, search, Auto footer or unavailable state', async () => {
				let contentContext: IModelPickerAdditionalContentContext | undefined;
				const result = await createPicker(tabbed, {
					realPopup: true,
					additionalContent: () => ({
						replaceModelList: true,
						renderHeader: (container, context) => {
							contentContext = context;
							dom.append(container, dom.$('button', { type: 'button' }, 'Team'));
							return Disposable.None;
						},
						render: container => {
							dom.append(container, dom.$('button', { type: 'button' }, 'Lead model'));
							dom.append(container, dom.$('button', { type: 'button' }, 'Worker model'));
							return Disposable.None;
						},
					}),
				});
				result.show();
				const anchor = result.container.querySelector('.model-picker-split');
				const state = {
					header: result.popup.querySelector('.action-list-custom-header')?.textContent,
					body: result.popup.querySelector('.chat-model-picker-custom-body')?.textContent,
					normalControls: result.popup.querySelectorAll('.monaco-list, input, .tabbed-action-list-footer, .chat-model-picker-tabbar').length,
					unavailable: result.popup.textContent?.includes('unavailable'),
					stableAnchor: contentContext?.anchor === anchor,
					focused: dom.getActiveElement()?.textContent,
				};
				result.hide();
				assert.deepStrictEqual({ ...state, anchorConnectedAfterHide: contentContext?.anchor.isConnected }, {
					header: 'Team', body: 'Lead modelWorker model', normalControls: 0, unavailable: false,
					stableAnchor: true, focused: 'Team', anchorConnectedAfterHide: true,
				});
			});

			test('replacement content uses its intrinsic width without exceeding the viewport', async () => {
				const result = await createPicker(tabbed, {
					realPopup: true,
					additionalContent: () => ({
						replaceModelList: true,
						render: container => {
							const body = dom.append(container, dom.$('div'));
							body.style.width = '480px';
							body.style.maxWidth = '100%';
							body.style.display = 'grid';
							body.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
							for (const role of ['Lead', 'Worker', 'Scout']) {
								dom.append(body, dom.$('button', { type: 'button' }, role));
							}
							return Disposable.None;
						},
					}),
				});
				result.show();
				await waitForLayout(result.popup);
				const widget = result.popup.querySelector<HTMLElement>('.chat-model-picker-custom-content');
				const body = result.popup.querySelector<HTMLElement>('.chat-model-picker-custom-body > div');
				assert.ok(widget && body);
				const preferredWidth = body.getBoundingClientRect().width;
				const cards = [...body.children].map(card => card.getBoundingClientRect());
				body.style.width = '10000px';
				await waitForLayout(result.popup);
				const bounds = widget.getBoundingClientRect();
				assert.deepStrictEqual({
					preferredWidth,
					horizontal: cards.every(card => card.top === cards[0].top),
					bounded: bounds.left >= 0 && bounds.right <= mainWindow.innerWidth,
					contentBounded: body.getBoundingClientRect().width <= bounds.width,
					visible: result.visible,
				}, { preferredWidth: 480, horizontal: true, bounded: true, contentBounded: true, visible: true });
			});

			test('custom content reopens from the delegate without closing the selection flow', async () => {
				const result = await createPicker(tabbed, { realPopup: true });
				let enabled = false;
				let closes = 0;
				const anchors: HTMLElement[] = [];
				const picker = await result.createStandalonePicker({
					getAdditionalContent: () => ({
						replaceModelList: enabled,
						renderHeader: (container, context) => {
							anchors.push(context.anchor);
							const button = dom.append(container, dom.$('button', { type: 'button' }, 'Team'));
							return dom.addDisposableListener(button, 'click', () => {
								enabled = !enabled;
								context.hide();
								context.reopen();
							});
						},
						render: enabled ? container => {
							dom.append(container, dom.$('button', { type: 'button' }, 'Worker model'));
							return Disposable.None;
						} : undefined,
					}),
				});
				store.add(picker.onDidClose(() => closes++));
				const anchor = result.nameButton();
				anchor.focus();
				picker.show(anchor);
				const states = [];
				for (let i = 0; i < 2; i++) {
					result.popup.querySelector<HTMLElement>('.action-list-custom-header button')?.click();
					await waitForLayout(result.popup);
					states.push({
						enabled, visible: result.visible, closes,
						hasList: !!result.popup.querySelector('.monaco-list'),
						hasBody: !!result.popup.querySelector('.chat-model-picker-custom-body'),
					});
				}
				assert.deepStrictEqual({ states, stableAnchors: anchors.every(candidate => candidate === anchor) }, {
					states: [
						{ enabled: true, visible: true, closes: 0, hasList: false, hasBody: true },
						{ enabled: false, visible: true, closes: 0, hasList: true, hasBody: false },
					],
					stableAnchors: true,
				});
			});

			test('custom header Switch leaves Enter and Space to native button activation', async () => {
				const result = await createPicker(tabbed, { realPopup: true });
				let changes = 0;
				let closes = 0;
				const picker = await result.createStandalonePicker({
					getAdditionalContent: () => ({
						renderHeader: container => {
							const contentStore = new DisposableStore();
							const toggle = contentStore.add(new Switch({ ariaLabel: 'Team', checked: false }));
							contentStore.add(toggle.onChange(() => changes++));
							container.appendChild(toggle.domNode);
							return contentStore;
						},
					}),
				});
				store.add(picker.onDidClose(() => closes++));
				picker.show(result.nameButton());
				const toggle = result.popup.querySelector<HTMLElement>('.action-list-custom-header [role="switch"]');
				assert.ok(toggle);
				toggle.focus();
				const prevented = [];
				for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
					const event = new KeyboardEvent('keydown', { key, keyCode, bubbles: true, cancelable: true });
					toggle.dispatchEvent(event);
					prevented.push(event.defaultPrevented);
				}
				await timeout(0);
				assert.deepStrictEqual({
					prevented, visible: result.visible, focused: dom.getActiveElement() === toggle,
					changes, closes, selections: result.selections,
				}, { prevented: [false, false], visible: true, focused: true, changes: 0, closes: 0, selections: [] });
			});

			for (const contentLocation of ['header', 'footer', 'replacement'] as const) {
				test(`${contentLocation} resize preserves focus and does not close the popup`, async () => {
					const result = await createPicker(tabbed, { realPopup: true });
					const button = dom.$('button', { type: 'button' }, 'Team');
					const render = (container: HTMLElement) => {
						container.appendChild(button);
						return Disposable.None;
					};
					const picker = await result.createStandalonePicker({
						getAdditionalContent: () => ({
							renderHeader: contentLocation === 'header' ? render : undefined,
							render: contentLocation !== 'header' ? render : undefined,
							replaceModelList: contentLocation === 'replacement',
						}),
					});
					let closes = 0;
					store.add(picker.onDidClose(() => closes++));
					result.nameButton().focus();
					picker.show(result.nameButton());
					await waitForLayout(result.popup);
					button.focus();
					button.style.height = '80px';
					await waitForLayout(result.popup);
					assert.deepStrictEqual({ visible: result.visible, focused: dom.getActiveElement() === button, closes }, {
						visible: true, focused: true, closes: 0,
					});
				});
			}

			for (const anchorAtTop of [false, true]) {
				test(`replacement body scrolls within the viewport with a pinned header (anchor at top: ${anchorAtTop})`, async () => {
					const result = await createPicker(tabbed, { realPopup: true });
					const targetWindow = dom.getWindow(result.container);
					const anchor = dom.append(result.container, dom.$('button', { type: 'button' }, 'Models'));
					anchor.style.position = 'fixed';
					anchor.style.left = '24px';
					anchor.style[anchorAtTop ? 'top' : 'bottom'] = '12px';
					const header = dom.$('button', { type: 'button' }, 'Team');
					const first = dom.$('button', { type: 'button' }, 'Lead model');
					const last = dom.$('button', { type: 'button' }, 'Worker model');
					const roles = dom.$('div');
					roles.style.display = 'flex';
					roles.style.flexDirection = 'column';
					roles.style.justifyContent = 'space-between';
					roles.style.height = `${targetWindow.innerHeight * 3}px`;
					roles.append(first, last);
					const picker = await result.createStandalonePicker({
						getAdditionalContent: () => ({
							replaceModelList: true,
							renderHeader: container => {
								container.appendChild(header);
								return Disposable.None;
							},
							render: container => {
								container.appendChild(roles);
								return Disposable.None;
							},
						}),
					});
					let closes = 0;
					store.add(picker.onDidClose(() => closes++));
					anchor.focus();
					picker.show(anchor);
					await waitForLayout(result.popup);
					const viewport = result.popup.querySelector<HTMLElement>('.chat-model-picker-custom-body-viewport');
					const widget = result.popup.querySelector<HTMLElement>('.chat-model-picker-custom-content');
					const slider = result.popup.querySelector<HTMLElement>('.scrollbar.vertical .slider');
					assert.ok(viewport && widget && slider);
					const initialBounds = widget.getBoundingClientRect();
					const initialAnchorBounds = anchor.getBoundingClientRect();
					const initialHeaderTop = header.getBoundingClientRect().top;
					const initialSliderHeight = slider.getBoundingClientRect().height;
					viewport.scrollTop = 100;
					await waitForLayout(result.popup);
					const scrolled = viewport.scrollTop > 0;
					const headerPinned = header.getBoundingClientRect().top === initialHeaderTop;
					header.focus();
					roles.style.height = `${targetWindow.innerHeight * 4}px`;
					widget.style.width = '200px';
					await waitForLayout(result.popup);
					const bodyGrowthObserved = viewport.scrollHeight >= targetWindow.innerHeight * 4;
					const initialViewportHeight = viewport.clientHeight;
					anchor.style.top = `${Math.floor(targetWindow.innerHeight / 2)}px`;
					anchor.style.bottom = '';
					targetWindow.dispatchEvent(new Event('resize'));
					await waitForLayout(result.popup);
					const resizedBounds = widget.getBoundingClientRect();
					const resizedViewportHeight = viewport.clientHeight;
					const resizeShrunkBody = resizedViewportHeight < initialViewportHeight;
					anchor.style.top = '12px';
					result.layoutWorkbench();
					await waitForLayout(result.popup);
					const layoutBounds = widget.getBoundingClientRect();
					last.focus();
					await waitForLayout(result.popup);
					const viewportBounds = viewport.getBoundingClientRect();
					const lastBounds = last.getBoundingClientRect();
					assert.deepStrictEqual({
						visible: result.visible, closes, scrolled, headerPinned, bodyGrowthObserved,
						scrollbarUpdated: initialSliderHeight > 0 && slider.getBoundingClientRect().height < initialSliderHeight,
						bounded: initialBounds.top >= 0 && initialBounds.bottom <= targetWindow.innerHeight && resizedBounds.top >= 0 && resizedBounds.bottom <= targetWindow.innerHeight && layoutBounds.top >= 0 && layoutBounds.bottom <= targetWindow.innerHeight,
						resizeShrunkBody,
						workbenchExpandedBody: viewport.clientHeight > resizedViewportHeight,
						besideAnchor: anchorAtTop ? initialBounds.top >= initialAnchorBounds.bottom : initialBounds.bottom <= initialAnchorBounds.top,
						bodyBounded: viewport.clientHeight > 0 && viewport.clientHeight < viewport.scrollHeight,
						lastControlVisible: lastBounds.top >= viewportBounds.top && lastBounds.bottom <= viewportBounds.bottom + 1,
						focused: dom.getActiveElement() === last,
					}, {
						visible: true, closes: 0, scrolled: true, headerPinned: true, bodyGrowthObserved: true, scrollbarUpdated: true,
						bounded: true, resizeShrunkBody: true, workbenchExpandedBody: true, besideAnchor: true, bodyBounded: true, lastControlVisible: true, focused: true,
					});
				});
			}

			test('standalone selection closes once after applying the model and restores anchor focus', async () => {
				const result = await createPicker(tabbed, { realPopup: true, selectedModel: AUTO_MODEL });
				const picker = await result.createStandalonePicker();
				const anchor = result.nameButton();
				const closedStates: { model: string | undefined; visible: boolean; focused: boolean }[] = [];
				store.add(picker.onDidClose(() => closedStates.push({
					model: result.currentModel.get()?.identifier, visible: result.visible, focused: dom.getActiveElement() === anchor,
				})));
				anchor.focus();
				picker.show(anchor);
				result.row('Example Model').click();
				await timeout(0);
				picker.hide();
				assert.deepStrictEqual({ rendered: !!picker.domNode, selections: result.selections, closedStates }, {
					rendered: false, selections: [MODEL.identifier],
					closedStates: [{ model: MODEL.identifier, visible: false, focused: true }],
				});
			});

			test('standalone cancellation can reopen the parent without a stale instance closing it', async () => {
				const result = await createPicker(tabbed, { realPopup: true });
				const picker = await result.createStandalonePicker();
				let closes = 0;
				store.add(picker.onDidClose(() => {
					closes++;
					result.picker.show(result.nameButton());
				}));
				result.nameButton().focus();
				picker.show(result.nameButton());
				const focused = dom.getActiveElement();
				assert.ok(dom.isHTMLElement(focused));
				focused.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape', keyCode: 27 }));
				await waitForLayout(result.popup);
				picker.hide();
				picker.dispose();
				assert.deepStrictEqual({ closes, visible: result.visible, selections: result.selections }, {
					closes: 1, visible: true, selections: [],
				});
			});

			for (const replacement of [false, true]) {
				test(`hiding or disposing a replaced instance does not close another picker (replacement: ${replacement})`, async () => {
					const result = await createPicker(tabbed, { realPopup: true });
					const first = await result.createStandalonePicker({
						getAdditionalContent: replacement ? () => ({
							replaceModelList: true,
							render: container => {
								dom.append(container, dom.$('button', { type: 'button' }, 'Worker model'));
								return Disposable.None;
							},
						}) : undefined,
					});
					const second = await result.createStandalonePicker();
					let secondCloses = 0;
					store.add(second.onDidClose(() => secondCloses++));
					first.show(result.nameButton());
					second.show(result.nameButton());
					await timeout(0);
					first.hide();
					first.dispose();
					assert.deepStrictEqual({ visible: result.visible, secondCloses }, { visible: true, secondCloses: 0 });
				});
			}

			test('standalone configuration stays in the selection flow until dismissed', async () => {
				const result = await createPicker(tabbed, { realPopup: true });
				const picker = await result.createStandalonePicker();
				const anchor = result.nameButton();
				let closes = 0;
				let focusRestored = false;
				store.add(picker.onDidClose(() => {
					closes++;
					focusRestored = dom.getActiveElement() === anchor;
					result.picker.show(anchor);
				}));
				anchor.focus();
				picker.show(anchor);
				result.openModelConfiguration();
				await timeout(0);
				const configuredPopup = {
					visible: result.visible, closes,
					focused: dom.isAncestorOfActiveElement(result.popup),
					aboveAnchor: result.popup.getBoundingClientRect().bottom <= anchor.getBoundingClientRect().top + 1,
				};
				result.configurationOption('High').click();
				await timeout(0);
				const afterConfiguration = {
					configuration: result.configurations.get(MODEL.identifier), visible: result.visible, closes,
					focused: dom.isAncestorOfActiveElement(result.popup),
				};
				picker.hide();
				await waitForLayout(result.popup);
				picker.hide();
				picker.dispose();
				assert.deepStrictEqual({ configuredPopup, afterConfiguration, closes, focusRestored, parentVisible: result.visible }, {
					configuredPopup: { visible: true, closes: 0, focused: true, aboveAnchor: true },
					afterConfiguration: { configuration: { reasoningEffort: 'high' }, visible: true, closes: 0, focused: true },
					closes: 1, focusRestored: true, parentVisible: true,
				});
			});

			for (const fromModelPicker of [false, true]) {
				test(`public configuration picker keeps standalone flow ownership (from model list: ${fromModelPicker})`, async () => {
					const result = await createPicker(tabbed, { realPopup: true });
					const picker = await result.createStandalonePicker();
					const anchor = result.nameButton();
					let closes = 0;
					let focusRestored = false;
					store.add(picker.onDidClose(() => {
						closes++;
						focusRestored = dom.getActiveElement() === anchor;
						result.picker.show(anchor);
					}));
					anchor.focus();
					if (fromModelPicker) {
						picker.show(anchor);
						picker.showConfiguration(undefined, MODEL_CONFIG_GROUP_EFFORT);
					} else {
						picker.showConfiguration(anchor, MODEL_CONFIG_GROUP_EFFORT);
					}
					await timeout(0);
					const opened = {
						closes, visible: result.visible,
						focused: dom.isAncestorOfActiveElement(result.popup),
						focusedGroup: result.popup.querySelector('.monaco-list-row.focused')?.textContent?.includes('Medium'),
						aboveAnchor: result.popup.getBoundingClientRect().bottom <= anchor.getBoundingClientRect().top + 1,
					};
					result.row('High').click();
					await timeout(0);
					const configured = { closes, visible: result.visible, configuration: result.configurations.get(MODEL.identifier) };
					picker.hide();
					await waitForLayout(result.popup);
					picker.hide();
					picker.dispose();
					assert.deepStrictEqual({
						opened, configured, closes, focusRestored, selections: result.selections,
						rendered: !!picker.domNode, parentVisible: result.visible,
					}, {
						opened: { closes: 0, visible: true, focused: true, focusedGroup: true, aboveAnchor: true },
						configured: { closes: 0, visible: true, configuration: { reasoningEffort: 'high' } },
						closes: 1, focusRestored: true, selections: [], rendered: false, parentVisible: true,
					});
				});
			}

			test('public configuration cannot open an unavailable widget or close another instance', async () => {
				const result = await createPicker(tabbed, { realPopup: true });
				const disabled = await result.createStandalonePicker();
				const disposed = await result.createStandalonePicker();
				const unanchored = await result.createStandalonePicker();
				disabled.setEnabled(false);
				disposed.dispose();
				result.show();
				disabled.showConfiguration(result.nameButton(), MODEL_CONFIG_GROUP_EFFORT);
				disposed.showConfiguration(result.nameButton(), MODEL_CONFIG_GROUP_EFFORT);
				unanchored.showConfiguration();
				assert.deepStrictEqual({
					visible: result.visible,
					hasModelList: result.rows().some(row => row.textContent?.includes('Example Model')),
					hasConfiguration: result.rows().some(row => row.querySelector('.title')?.textContent === 'High'),
				}, { visible: true, hasModelList: true, hasConfiguration: false });
			});

			test('standalone roles keep independent configuration for the same model', async () => {
				const result = await createPicker(tabbed, { realPopup: true });
				const first = await result.createStandalonePicker();
				const secondValues: IStringDictionary<unknown> = { reasoningEffort: 'high' };
				const second = await result.createStandalonePicker({
					modelConfiguration: {
						getModelConfiguration: () => secondValues,
						setModelConfiguration: async (_id, values) => { Object.assign(secondValues, values); },
						getModelConfigurationActions: () => [],
					},
				});
				for (const [picker, effort] of [[first, 'High'], [second, 'Medium']] as const) {
					result.nameButton().focus();
					picker.show(result.nameButton());
					result.openModelConfiguration();
					result.configurationOption(effort).click();
					await timeout(0);
					picker.hide();
					await timeout(0);
				}
				assert.deepStrictEqual({ first: result.configurations.get(MODEL.identifier), second: secondValues }, {
					first: { reasoningEffort: 'high' }, second: { reasoningEffort: 'medium' },
				});
			});

			test('renders interactive additional content and disposes it with the popup', async () => {
				let renders = 0;
				let disposals = 0;
				let clicks = 0;
				const result = await createPicker(tabbed, {
					additionalContent: () => ({
						render: container => {
							renders++;
							const button = dom.append(container, dom.$('button', undefined, 'Worker model'));
							button.className = 'test-model-team-card';
							const listener = dom.addDisposableListener(button, 'click', () => clicks++);
							return toDisposable(() => { listener.dispose(); button.remove(); disposals++; });
						},
					}),
				});
				result.show();
				result.popup.querySelector<HTMLElement>('.test-model-team-card')?.click();
				result.hide();
				result.show();
				assert.deepStrictEqual({
					renders, disposals, clicks, cards: result.popup.querySelectorAll('.test-model-team-card').length,
					selections: result.selections, history: result.modelHistoryCalls,
				}, { renders: 2, disposals: 1, clicks: 1, cards: 1, selections: [], history: [] });
			});

			test('compact presentation retains both agent identities', async () => {
				const result = await createPicker(tabbed, {
					compact: true,
					selectionPresentation: {
						...ALTERNATE_SELECTION,
						segments: [{ label: 'Lead Model', icon: { id: 'agent' } }, { label: 'Worker Model', icon: { id: 'agent' } }],
					},
				});
				assert.deepStrictEqual({
					segments: [...result.nameButton().querySelectorAll('.model-picker-selection-segment')].map(element => element.textContent),
					multiple: result.container.querySelector('.model-picker-split')?.classList.contains('multiple-models'),
					ariaLabel: result.nameButton().ariaLabel,
				}, { segments: ['Lead Model', 'Worker Model'], multiple: true, ariaLabel: ALTERNATE_SELECTION.ariaLabel });
			});

			test('ordinary model selection is preserved without a team presentation', async () => {
				const result = await createPicker(tabbed);
				result.show();
				assert.deepStrictEqual({
					label: result.presentation().label,
					modelChecked: !!result.row('Example Model').querySelector('.codicon-check'),
					model: result.currentModel.get(),
				}, { label: 'Example Model', modelChecked: true, model: MODEL });
			});

			test('multi-segment chips use balanced spacing and hide only the global configuration chip', async () => {
				const result = await createPicker(tabbed, {
					compact: true,
					selectionPresentation: {
						...ALTERNATE_SELECTION,
						segments: [{ label: 'Lead Model', icon: { id: 'agent' } }, { label: 'Worker Model', icon: { id: 'agent' } }],
					},
				});
				const workbench = dom.append(mainWindow.document.body, dom.$('.monaco-workbench.interactive-session'));
				store.add(toDisposable(() => workbench.remove()));
				const toolbars = dom.append(workbench, dom.$('.chat-input-toolbars'));
				const toolbar = dom.append(toolbars, dom.$('.chat-input-toolbar'));
				toolbar.appendChild(result.container);
				result.container.style.setProperty('--vscode-spacing-size60', '6px');
				const separator = result.nameButton().querySelector<HTMLElement>('.model-picker-selection-separator');
				const segment = result.nameButton().querySelector<HTMLElement>('.model-picker-selection-segment');
				const label = segment?.querySelector<HTMLElement>('.chat-input-picker-label');
				const configuration = result.container.querySelector<HTMLElement>('.model-picker-config');
				assert.ok(separator && segment && label && configuration);
				const style = dom.getWindow(separator).getComputedStyle(separator);
				const labelStyle = dom.getWindow(label).getComputedStyle(label);
				const segmented = {
					configurationVisible: configuration.style.display !== 'none',
					padding: [style.paddingInlineStart, style.paddingInlineEnd],
					iconLabelGap: dom.getWindow(segment).getComputedStyle(segment).gap,
					labelMargin: [labelStyle.marginInlineStart, labelStyle.marginInlineEnd],
					ellipsis: labelStyle.textOverflow,
					decorative: [...result.nameButton().querySelectorAll('.model-picker-selection-separator, .model-picker-selection-segment .codicon')].map(element => element.getAttribute('aria-hidden')),
				};
				result.selectionPresentation.set(undefined, undefined);
				assert.deepStrictEqual({ segmented, singleConfigurationVisible: configuration.style.display !== 'none' }, {
					segmented: {
						configurationVisible: false, padding: ['6px', '6px'], iconLabelGap: '6px',
						labelMargin: ['0px', '0px'], ellipsis: 'ellipsis', decorative: ['true', 'true', 'true'],
					},
					singleConfigurationVisible: !tabbed,
				});
			});

			test('reactively restores labels, ARIA and tooltip without changing the underlying model', async () => {
				const result = await createPicker(tabbed);
				const ordinary = result.presentation();
				result.show();
				const focused = dom.getActiveElement();
				const states = [];
				for (const presentation of [ALTERNATE_SELECTION, { ...ALTERNATE_SELECTION, label: 'Changed +2', ariaLabel: 'Changed selection', tooltip: 'Changed selection details' }, undefined]) {
					result.selectionPresentation.set(presentation, undefined);
					states.push({
						presentation: result.presentation(),
						focused: dom.getActiveElement() === focused,
						model: result.currentModel.get(),
					});
				}
				assert.deepStrictEqual(states, [
					{ presentation: ALTERNATE_SELECTION, focused: true, model: MODEL },
					{ presentation: { label: 'Changed +2', ariaLabel: 'Changed selection', tooltip: 'Changed selection details' }, focused: true, model: MODEL },
					{ presentation: ordinary, focused: true, model: MODEL },
				]);
			});

			test('selecting the real underlying model clears the alternate presentation', async () => {
				const result = await createPicker(tabbed, { selectionPresentation: ALTERNATE_SELECTION });
				result.show();
				result.row('Example Model').click();
				assert.deepStrictEqual({
					label: result.presentation().label, selections: result.selections, model: result.currentModel.get(),
					presentation: result.selectionPresentation.get(), telemetry: result.telemetryEvents,
				}, {
					label: 'Example Model', selections: [MODEL.identifier], model: MODEL,
					presentation: undefined, telemetry: ['chat.modelChange'],
				});
			});

			test('the alternate label stays visible in compact mode', async () => {
				const result = await createPicker(tabbed, { compact: true, selectionPresentation: ALTERNATE_SELECTION });
				assert.deepStrictEqual(result.presentation(), ALTERNATE_SELECTION);
			});

			test('keeps configuration attached to the real model', async () => {
				const result = await createPicker(tabbed, { selectionPresentation: ALTERNATE_SELECTION });
				if (tabbed) {
					result.show();
					const row = result.row('Example Model');
					row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
					row.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, movementY: 1 }));
					await timeout(50);
					const high = [...result.popup.querySelectorAll<HTMLElement>('[role="radio"]')].find(option => option.textContent === 'High');
					assert.ok(high);
					high.click();
				} else {
					const button = result.container.querySelector<HTMLElement>('.model-picker-config');
					assert.ok(button && button.style.display !== 'none');
					button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
					result.row('High').click();
				}
				await timeout(0);
				assert.deepStrictEqual({
					configuration: result.configurations.get(MODEL.identifier), presentation: result.presentation(),
					model: result.currentModel.get(), selections: result.selections, telemetry: result.telemetryEvents,
				}, {
					configuration: { reasoningEffort: 'high' }, presentation: ALTERNATE_SELECTION,
					model: MODEL, selections: [], telemetry: ['chat.thinkingEffortChange'],
				});
			});

			test('does not retain popup observers or old controls across show, hide and render', async () => {
				const result = await createPicker(tabbed, { additionalContent: () => undefined });
				const states = [];
				for (let i = 0; i < 3; i++) {
					result.show();
					result.hide();
					const contentReads = result.contentReads;
					const oldButton = result.nameButton();
					result.picker.render(result.container);
					oldButton.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter', keyCode: 13 }));
					result.selectionPresentation.set(i % 2 ? undefined : ALTERNATE_SELECTION, undefined);
					states.push({
						refreshedHiddenPicker: result.contentReads !== contentReads, visible: result.visible,
						oldButtonConnected: oldButton.isConnected, hovers: result.hovers.size,
					});
				}
				assert.deepStrictEqual(states, Array.from({ length: 3 }, () => ({
					refreshedHiddenPicker: false, visible: false, oldButtonConnected: false, hovers: 1,
				})));
			});

			for (const unavailable of ['restrictedMode', 'setupRequired'] as const) {
				test(`does not expose team content or presentation through ${unavailable}`, async () => {
					const result = await createPicker(tabbed, { [unavailable]: true, additionalContent: () => undefined, selectionPresentation: ALTERNATE_SELECTION });
					result.show();
					assert.deepStrictEqual({
						label: result.presentation().label,
						contentReads: result.contentReads, hasAlternateTooltip: result.presentation().tooltip === ALTERNATE_SELECTION.tooltip,
					}, { label: 'Models', contentReads: 0, hasAlternateTooltip: false });
				});
			}

			test('does not open team content when the control is disabled', async () => {
				const result = await createPicker(tabbed, { additionalContent: () => undefined });
				result.picker.setEnabled(false);
				result.picker.render(result.container);
				result.show();
				assert.deepStrictEqual({ visible: result.visible, contentReads: result.contentReads }, { visible: false, contentReads: 0 });
			});

			test('does not expose team content before workspace trust is initialized', async () => {
				const initialized = new DeferredPromise<void>();
				const result = await createPicker(tabbed, { additionalContent: () => undefined, workspaceTrustInitialized: initialized.p });
				result.show();
				const state = { contentReads: result.contentReads };
				result.hide();
				await initialized.complete();
				assert.deepStrictEqual(state, { contentReads: 0 });
			});
		});
	}

	test('an asynchronous configuration save cannot update another instance popup', async () => {
		const result = await createPicker(false, { realPopup: true });
		const save = new DeferredPromise<void>();
		const picker = await result.createStandalonePicker({
			modelConfiguration: {
				getModelConfiguration: () => undefined,
				setModelConfiguration: () => save.p,
				getModelConfigurationActions: () => [],
			},
		});
		result.nameButton().focus();
		picker.show(result.nameButton());
		result.openModelConfiguration();
		result.configurationOption('High').click();
		picker.hide();
		result.picker.show(result.nameButton());
		await save.complete();
		await timeout(0);
		picker.dispose();
		assert.deepStrictEqual({
			visible: result.visible,
			hasModels: result.rows().some(row => row.textContent?.includes('Example Model')),
			hasConfiguration: result.rows().some(row => row.textContent === 'High'),
			focused: dom.isAncestorOfActiveElement(result.popup),
		}, { visible: true, hasModels: true, hasConfiguration: false, focused: true });
	});
});
