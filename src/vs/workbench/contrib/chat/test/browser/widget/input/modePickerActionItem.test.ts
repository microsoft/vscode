/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../base/browser/dom.js';
import { Event } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IMenu, IMenuService, MenuItemAction } from '../../../../../../../platform/actions/common/actions.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationChangeEvent, IConfigurationValue } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockContextKeyService, MockKeybindingService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { NullOpenerService } from '../../../../../../../platform/opener/test/common/nullOpenerService.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { IWorkbenchAssignmentService } from '../../../../../../services/assignment/common/assignmentService.js';
import { TestProductService } from '../../../../../../test/common/workbenchTestServices.js';
import { ModePickerActionItem } from '../../../../browser/widget/input/modePickerActionItem.js';
import { IChatWidget } from '../../../../browser/chat.js';
import { ChatMode, CustomChatMode, IChatMode, IChatModes } from '../../../../common/chatModes.js';
import { ChatConfiguration, ChatModeKind } from '../../../../common/constants.js';
import { IChatAgentService } from '../../../../common/participants/chatAgents.js';
import { Target } from '../../../../common/promptSyntax/promptTypes.js';
import { PromptsStorage } from '../../../../common/promptSyntax/service/promptsService.js';

suite('ModePickerActionItem Add Context', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const custom: IChatMode = { ...ChatMode.Agent, id: 'custom-host:/agent', isBuiltin: false };

	function createPicker(enabled: boolean, supportsAttachContext = true) {
		const configuration = new TestConfigurationService({ [ChatConfiguration.AgentsPickerInAttachContextMenu]: enabled });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const context = store.add(new MockContextKeyService());
		const command = upcastPartial<ICommandService>({});
		const action = new MenuItemAction({ id: 'test.modePicker', title: 'Agent' }, undefined, undefined, undefined, undefined, context, command);
		const mode = observableValue<IChatMode>('mode', ChatMode.Agent);
		const telemetry = new TestExperimentTriggerTelemetryService();
		const root = append(document.body, $('div'));
		store.add(toDisposable(() => root.remove()));
		const container = append(root, $('div'));
		const input = append(root, $('input'));
		const anchor = append(root, $('button'));
		let openedAtAnchor = false;
		const picker = store.add(new ModePickerActionItem(
			action,
			{ currentMode: mode, currentChatModes: constObservable(upcastPartial<IChatModes>({ builtin: [ChatMode.Agent, ChatMode.Ask], custom: [custom] })), sessionResource: () => undefined, supportsAttachContext },
			{ compact: constObservable(false), actionContext: { widget: upcastPartial<IChatWidget>({ focusInput: () => input.focus() }) } },
			upcastPartial<IActionWidgetService>({ hide: () => { }, show: (_id, _preview, _items, _delegate, element) => { openedAtAnchor = element === anchor; } }),
			upcastPartial<IChatAgentService>({ getDefaultAgent: () => undefined }),
			new MockKeybindingService(),
			configuration,
			context,
			upcastPartial<IMenuService>({ createMenu: () => upcastPartial<IMenu>({ getActions: () => [], dispose: () => { } }) }),
			command,
			TestProductService,
			telemetry,
			NullOpenerService,
			upcastPartial<IWorkbenchAssignmentService>({ getTreatment: async () => undefined, onDidRefetchAssignments: Event.None }),
		));
		picker.render(container);
		return { picker, container, input, mode, configuration, telemetry, open: () => { picker.show(anchor); return openedAtAnchor; } };
	}

	for (const enabled of [false, true]) {
		for (const supported of [false, true]) {
			test(`keeps non-default selections visible with setting ${enabled} and supported host ${supported}`, () => {
				const { picker, container, mode, telemetry } = createPicker(enabled, supported);
				const snapshot = () => ({ hidden: container.hidden, inert: container.inert, inAttachContext: picker.isInAttachContext });
				const initial = snapshot();
				mode.set(custom, undefined);
				const customSelection = snapshot();
				mode.set(ChatMode.Ask, undefined);
				const ask = snapshot();
				mode.set(ChatMode.Agent, undefined);
				const defaultSelection = snapshot();
				const hidden = enabled && supported;
				assert.deepStrictEqual({ initial, customSelection, ask, defaultSelection, triggered: telemetry.triggers.includes(`config.${ChatConfiguration.AgentsPickerInAttachContextMenu}`) }, {
					initial: { hidden, inert: hidden, inAttachContext: hidden },
					customSelection: { hidden: false, inert: false, inAttachContext: false },
					ask: { hidden: false, inert: false, inAttachContext: false },
					defaultSelection: { hidden, inert: hidden, inAttachContext: hidden },
					triggered: supported,
				});
			});
		}
	}

	test('opens the hidden picker at Add Context and returns focus to the input when selecting default', () => {
		const { container, input, mode, open } = createPicker(true);
		const anchored = open();
		mode.set(custom, undefined);
		container.querySelector<HTMLElement>('.action-label')!.focus();
		mode.set(ChatMode.Agent, undefined);
		assert.deepStrictEqual({ anchored, hidden: container.hidden, focused: document.activeElement === input }, { anchored: true, hidden: true, focused: true });
	});

	test('reacts to setting changes without recreating the picker', async () => {
		const { container, configuration } = createPicker(false);
		const visibility: boolean[] = [container.hidden === true];
		for (const enabled of [true, false]) {
			await configuration.setUserConfiguration(ChatConfiguration.AgentsPickerInAttachContextMenu, enabled);
			configuration.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
				affectsConfiguration: key => key === ChatConfiguration.AgentsPickerInAttachContextMenu,
			}));
			visibility.push(container.hidden === true);
		}
		assert.deepStrictEqual(visibility, [false, true, false]);
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
