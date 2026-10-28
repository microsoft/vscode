/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../base/browser/dom.js';
import { retry } from '../../../../../../../base/common/async.js';
import { Event } from '../../../../../../../base/common/event.js';
import { MutableDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IMenu, IMenuService, MenuId, MenuItemAction, MenuRegistry } from '../../../../../../../platform/actions/common/actions.js';
import { MenuWorkbenchToolBar } from '../../../../../../../platform/actions/browser/toolbar.js';
import { MenuService } from '../../../../../../../platform/actions/common/menuService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationService, IConfigurationValue } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { NullOpenerService } from '../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IWorkbenchAssignmentService } from '../../../../../../services/assignment/common/assignmentService.js';
import { TestProductService } from '../../../../../../test/common/workbenchTestServices.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { createAgentPickerInAttachContext, ModePickerActionItem } from '../../../../browser/widget/input/modePickerActionItem.js';
import { ChatInputPart, getToolbarPickerResponsiveItems } from '../../../../browser/widget/input/chatInputPart.js';
import { ChatInputPickerResponsiveLayout } from '../../../../browser/widget/input/chatInputPickerResponsiveLayout.js';
import { OpenModePickerAction } from '../../../../browser/actions/chatExecuteActions.js';
import { IChatWidget } from '../../../../browser/chat.js';
import { ChatMode, CustomChatMode, IChatMode, IChatModes } from '../../../../common/chatModes.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../../common/constants.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IWorkbenchEnvironmentService } from '../../../../../../services/environment/common/environmentService.js';
import { IChatAgentService } from '../../../../common/participants/chatAgents.js';
import { Target } from '../../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';

suite('ModePickerActionItem Add Context', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const custom: IChatMode = { ...ChatMode.Agent, id: 'custom-host:/agent', isBuiltin: false, name: constObservable('Custom'), label: constObservable('Custom') };

	function createPicker(enabled: boolean, supportsAttachContext = true) {
		const configuration = new TestConfigurationService({ [ChatConfiguration.AgentsPickerInAttachContextMenu]: enabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IConfigurationService, configuration);
		const context = store.add(instantiation.createInstance(ContextKeyService));
		instantiation.stub(IContextKeyService, context);
		const menus = store.add(instantiation.createInstance(MenuService));
		instantiation.stub(IMenuService, menus);
		const command = upcastPartial<ICommandService>({});
		instantiation.stub(ICommandService, command);
		const mode = observableValue<IChatMode>('mode', ChatMode.Agent);
		const modes = constObservable(upcastPartial<IChatModes>({ builtin: [ChatMode.Agent, ChatMode.Ask], custom: [custom] }));
		const telemetry = new TestExperimentTriggerTelemetryService();
		instantiation.stub(ITelemetryService, telemetry);
		instantiation.stub(IChatAgentService, upcastPartial<IChatAgentService>({ getDefaultAgent: () => undefined }));
		instantiation.stub(IProductService, { ...TestProductService });
		instantiation.stub(IOpenerService, { ...NullOpenerService });
		instantiation.stub(IWorkbenchAssignmentService, upcastPartial<IWorkbenchAssignmentService>({ getTreatment: async () => undefined, onDidRefetchAssignments: Event.None }));
		const root = append(document.body, $('.agent-picker-toolbar-test'));
		root.style.width = '500px';
		store.add(toDisposable(() => root.remove()));
		const input = append(root, $('input'));
		const anchor = append(root, $('button'));
		let openedAtAnchor = false;
		let select: ((label: string) => void) | undefined;
		instantiation.stub(IActionWidgetService, upcastPartial<IActionWidgetService>({
			hide: () => { },
			show: (_id, _preview, items, delegate, element) => {
				openedAtAnchor = element === anchor;
				select = label => {
					const selected = items.find(item => item.label === label);
					assert.ok(selected?.item);
					delegate.onSelect(selected.item);
				};
			},
		}));
		const placement = createAgentPickerInAttachContext({ currentMode: mode, currentChatModes: modes, sessionResource: () => undefined, supportsAttachContext }, configuration, telemetry);
		const menuId = MenuId.for('chatInputPart.agentPicker.test');
		const descriptor = new OpenModePickerAction().desc;
		assert.ok(Array.isArray(descriptor.menu));
		store.add(MenuRegistry.appendMenuItem(menuId, { command: descriptor, when: descriptor.menu[0].when, group: 'navigation', order: 1 }));
		for (const [id, order] of [['before', 0], ['after', 2]] as const) {
			store.add(MenuRegistry.appendMenuItem(menuId, { command: { id, title: id }, group: 'navigation', order }));
		}
		ChatContextKeys.enabled.bindTo(context).set(true);
		ChatContextKeys.location.bindTo(context).set(ChatAgentLocation.Chat);
		const originalContext = context.createOverlay([[ChatContextKeys.agentPickerInAttachContext.key, false]]);
		const originalMenu = store.add(menus.createMenu(menuId, originalContext));
		const widget = upcastPartial<IChatWidget>({ focusInput: () => input.focus() });
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			_agentPickerInAttachContext: placement,
			_currentModeObservable: mode,
			_currentChatModesObservable: modes,
			_widget: widget,
			configurationService: configuration,
			contextKeyService: context,
			environmentService: upcastPartial<IWorkbenchEnvironmentService>({ isSessionsWindow: !supportsAttachContext }),
			options: {},
			location: ChatAgentLocation.Chat,
			inline: false,
			instantiationService: instantiation,
			modePickerMenu: originalMenu,
			chatPhoneInputPresenter: { enabled: constObservable(false) },
			overflowPickerWidget: store.add(new MutableDisposable()),
			attachContextActionViewItem: { element: anchor },
			focus: () => input.focus(),
			setChatMode2: (value: IChatMode) => mode.set(value, undefined),
		}) as ChatInputPart;
		store.add(Reflect.get(ChatInputPart.prototype, 'bindAgentPickerPlacement').call(inputPart));
		const compactStates = new Map([
			[OpenModePickerAction.ID, observableValue('modeCompact', false)],
			['before', observableValue('beforeCompact', false)],
			['after', observableValue('afterCompact', false)],
		]);
		const responsiveLayout = store.add(new MutableDisposable<ChatInputPickerResponsiveLayout>());
		let picker: ModePickerActionItem | undefined;
		const toolbar = store.add(instantiation.createInstance(MenuWorkbenchToolBar, root, menuId, {
			eventDebounceDelay: 0,
			responsiveBehavior: { enabled: true, kind: 'last', minItems: 1, actionMinWidth: 22, reserveMinWidth: false, allowOverflow: () => responsiveLayout.value?.areAllItemsCompact() === true },
			actionViewItemProvider: action => {
				if (action.id !== OpenModePickerAction.ID || !(action instanceof MenuItemAction)) {
					return undefined;
				}
				picker = instantiation.createInstance(ModePickerActionItem, action, { currentMode: mode, currentChatModes: modes, sessionResource: () => undefined }, { compact: compactStates.get(action.id)!, actionContext: { widget } });
				Object.assign(inputPart, { modeWidget: picker });
				return picker;
			},
		}));
		Object.assign(inputPart, { inputActionsToolbar: toolbar });
		toolbar.getElement().style.width = '100%';
		const style = append(root, $('style'));
		style.textContent = '.agent-picker-toolbar-test .monaco-action-bar .action-item { width:80px; flex:0 0 auto; } .agent-picker-toolbar-test .monaco-action-bar .action-item.compact-picker { width:22px; }';
		const layout = responsiveLayout.value = new ChatInputPickerResponsiveLayout('test.agentPickerPlacement', toolbar.getElement(), {
			getItems: () => getToolbarPickerResponsiveItems(toolbar, compactStates, undefined, placement.get() ? OpenModePickerAction.ID : undefined),
			hasOverflow: () => toolbar.hasOverflow(),
			relayout: () => toolbar.relayout(),
		});
		const actionIds = () => Array.from({ length: toolbar.getItemsLength() }, (_, index) => toolbar.getItemAction(index)?.id);
		const settle = () => retry(async () => assert.strictEqual(actionIds().includes(OpenModePickerAction.ID), !placement.get()), 1, 100);
		return {
			inputPart, input, anchor, mode, configuration, telemetry, placement, toolbar, layout, actionIds, settle,
			get picker() { return picker; },
			open: () => { inputPart.openModePicker(); return openedAtAnchor; },
			select: (label: string) => { assert.ok(select); select(label); },
			narrow: () => { root.style.width = '35px'; layout.layout(); },
		};
	}

	for (const enabled of [false, true]) {
		for (const supported of [false, true]) {
			test(`keeps non-default selections visible with setting ${enabled} and supported host ${supported}`, async () => {
				const { inputPart, mode, telemetry, actionIds, settle } = createPicker(enabled, supported);
				const snapshot = () => ({ inToolbar: actionIds().includes(OpenModePickerAction.ID), inAttachContext: inputPart.isAgentPickerInAttachContextMenu });
				const initial = snapshot();
				mode.set(custom, undefined);
				await settle();
				const customSelection = snapshot();
				mode.set(ChatMode.Ask, undefined);
				const ask = snapshot();
				mode.set(ChatMode.Agent, undefined);
				await settle();
				const defaultSelection = snapshot();
				const hidden = enabled && supported;
				assert.deepStrictEqual({ initial, customSelection, ask, defaultSelection, triggered: telemetry.triggers.includes(`config.${ChatConfiguration.AgentsPickerInAttachContextMenu}`) }, {
					initial: { inToolbar: !hidden, inAttachContext: hidden },
					customSelection: { inToolbar: true, inAttachContext: false },
					ask: { inToolbar: true, inAttachContext: false },
					defaultSelection: { inToolbar: !hidden, inAttachContext: hidden },
					triggered: supported,
				});
			});
		}
	}

	test('opens the relocated picker at Add Context and returns focus to the input when selecting default', async () => {
		const { inputPart, input, mode, open, toolbar, settle } = createPicker(true);
		const anchored = open();
		mode.set(custom, undefined);
		await settle();
		toolbar.focus(1);
		assert.deepStrictEqual({
			action: toolbar.getItemAction(1)?.id,
			focused: toolbar.getItemElement(1)?.contains(document.activeElement),
		}, { action: OpenModePickerAction.ID, focused: true });
		mode.set(ChatMode.Agent, undefined);
		await settle();
		assert.deepStrictEqual({ anchored, inAttachContext: inputPart.isAgentPickerInAttachContextMenu, focused: document.activeElement === input }, { anchored: true, inAttachContext: true, focused: true });
	});

	test('returns focus to the input when enabling relocation for the focused picker', async () => {
		const { inputPart, input, configuration, toolbar, settle } = createPicker(false);
		toolbar.focus(1);
		assert.deepStrictEqual({
			action: toolbar.getItemAction(1)?.id,
			focused: toolbar.getItemElement(1)?.contains(document.activeElement),
		}, { action: OpenModePickerAction.ID, focused: true });
		await configuration.setUserConfiguration(ChatConfiguration.AgentsPickerInAttachContextMenu, true);
		configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectedKeys: new Set([ChatConfiguration.AgentsPickerInAttachContextMenu]),
			affectsConfiguration: key => key === ChatConfiguration.AgentsPickerInAttachContextMenu,
		}));
		await settle();
		assert.deepStrictEqual({
			inAttachContext: inputPart.isAgentPickerInAttachContextMenu,
			focused: document.activeElement === input,
		}, { inAttachContext: true, focused: true });
	});

	test('does not steal focus when relocating an unfocused picker', async () => {
		const { anchor, mode, settle } = createPicker(true);
		mode.set(custom, undefined);
		await settle();
		anchor.focus();
		mode.set(ChatMode.Agent, undefined);
		await settle();
		assert.strictEqual(document.activeElement, anchor);
	});

	test('preserves focus moved elsewhere before the relocation menu rebuild', async () => {
		const { anchor, mode, toolbar, settle } = createPicker(true);
		mode.set(custom, undefined);
		await settle();
		toolbar.focus(1);
		assert.deepStrictEqual({
			action: toolbar.getItemAction(1)?.id,
			focused: toolbar.getItemElement(1)?.contains(document.activeElement),
		}, { action: OpenModePickerAction.ID, focused: true });
		mode.set(ChatMode.Agent, undefined);
		anchor.focus();
		await settle();
		assert.strictEqual(document.activeElement, anchor);
	});

	test('reacts to setting changes without recreating the input', async () => {
		const { placement, configuration, settle } = createPicker(false);
		const visibility = [placement.get()];
		for (const enabled of [true, false]) {
			await configuration.setUserConfiguration(ChatConfiguration.AgentsPickerInAttachContextMenu, enabled);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectedKeys: new Set([ChatConfiguration.AgentsPickerInAttachContextMenu]),
				affectsConfiguration: key => key === ChatConfiguration.AgentsPickerInAttachContextMenu,
			}));
			await settle();
			visibility.push(placement.get());
		}
		assert.deepStrictEqual(visibility, [false, true, false]);
	});

	test('arrows past the relocated picker in both directions', () => {
		const { toolbar } = createPicker(true);
		const before = toolbar.getItemElement(0)!.querySelector<HTMLElement>('.action-label')!;
		const after = toolbar.getItemElement(1)!.querySelector<HTMLElement>('.action-label')!;
		toolbar.focus();
		before.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', keyCode: 39, bubbles: true }));
		const forward = document.activeElement === after;
		after.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', keyCode: 37, bubbles: true }));
		assert.deepStrictEqual({ forward, backward: document.activeElement === before }, { forward: true, backward: true });
	});

	test('allows remaining toolbar actions to overflow when the default picker is relocated', () => {
		const { narrow, toolbar, layout } = createPicker(true);
		narrow();
		assert.deepStrictEqual({ compact: layout.areAllItemsCompact(), overflow: toolbar.hasOverflow() }, { compact: true, overflow: true });
	});

	test('opens Add Context after selecting default from an overflowed picker', async () => {
		const fixture = createPicker(true);
		fixture.mode.set(custom, undefined);
		await fixture.settle();
		fixture.narrow();
		assert.strictEqual(fixture.picker?.isConnected, false);
		fixture.inputPart.openModePicker();
		fixture.select('Agent');
		const relocated = fixture.inputPart.isAgentPickerInAttachContextMenu;
		const anchored = fixture.open();
		assert.deepStrictEqual({ relocated, anchored }, { relocated: true, anchored: true });
	});
});

suite('ModePickerActionItem host Ask', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const ask = new CustomChatMode({
		id: 'other-host:/opaque/ask',
		uri: URI.parse('other-host:/opaque/ask'),
		kind: ChatModeKind.Ask,
		name: 'Questions',
		source: { storage: PromptsStorage.builtIn },
		target: Target.Undefined,
		agentInstructions: { content: '', toolReferences: [] },
		visibility: { userInvocable: true, agentInvocable: false },
		enabled: true,
	});

	for (const target of [Target.Undefined, Target.GitHubCopilot]) {
		for (const policyDisabled of [false, true]) {
			test(`shows selectable built-in Ask with Agent disabled (target ${target}, policy ${policyDisabled})`, () => {
				class ConfigurationService extends TestConfigurationService {
					override inspect<T>(key: string): IConfigurationValue<T> {
						const value = super.inspect<T>(key);
						return key === ChatConfiguration.AgentEnabled && policyDisabled ? { ...value, policyValue: value.value } : value;
					}
				}
				const configurationService = new ConfigurationService({ [ChatConfiguration.AgentEnabled]: false });
				store.add(configurationService.onDidChangeConfigurationEmitter);
				const modes = upcastPartial<IChatModes>({ builtin: [ChatMode.Ask], custom: [ask] });
				const contextKeyService = store.add(new MockContextKeyService());
				const commandService = upcastPartial<ICommandService>({});
				const action = new MenuItemAction({ id: 'test.modePicker', title: 'Mode' }, undefined, undefined, undefined, undefined, contextKeyService, commandService);
				let shown = false;
				let selected: IChatMode | undefined;
				const picker = store.add(new ModePickerActionItem(
					action,
					{
						currentMode: constObservable(ask),
						currentChatModes: constObservable(modes),
						sessionResource: () => undefined,
						customAgentTarget: () => target,
						setMode: mode => { selected = mode; },
					},
					{ compact: constObservable(false) },
					upcastPartial<IActionWidgetService>({
						hide: () => { },
						show: (_id, _preview, items, delegate, _anchor, _container, _actions, accessibilityProvider) => {
							shown = true;
							const askItems = items.filter(item => item.label === 'Ask');
							assert.strictEqual(askItems.length, 1);
							delegate.onSelect(askItems[0].item!);
							assert.deepStrictEqual({
								ask: askItems.map(item => ({ disabled: item.disabled, icon: item.group?.icon, checked: accessibilityProvider?.isChecked?.(item), toolbar: item.toolbarActions?.length })),
								selected: selected?.id,
								label: container.querySelector('.action-label')?.ariaLabel,
								agent: items.find(item => item.label === 'Agent')?.disabled,
							}, {
								ask: [{ disabled: false, icon: ChatMode.Ask.icon.get(), checked: true, toolbar: 0 }],
								selected: ask.id,
								label: 'Ask',
								agent: target !== Target.Undefined && policyDisabled ? true : undefined,
							});
						},
					}),
					upcastPartial<IChatAgentService>({ getDefaultAgent: () => undefined }),
					new MockKeybindingService(),
					configurationService,
					contextKeyService,
					upcastPartial<IMenuService>({ createMenu: () => upcastPartial<IMenu>({ getActions: () => [], dispose: () => { } }) }),
					commandService,
					TestProductService,
					NullTelemetryService,
					NullOpenerService,
					upcastPartial<IWorkbenchAssignmentService>({ getTreatment: async () => undefined, onDidRefetchAssignments: Event.None }),
				));
				const container = append(document.body, $('div'));
				store.add(toDisposable(() => container.remove()));
				picker.render(container);
				picker.show();
				assert.strictEqual(shown, true);
			});
		}
	}
});
