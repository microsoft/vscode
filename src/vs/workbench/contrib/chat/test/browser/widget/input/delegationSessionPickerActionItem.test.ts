/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../../../platform/actionWidget/browser/actionWidget.js';
import { MenuItemAction, registerAction2 } from '../../../../../../../platform/actions/common/actions.js';
import { IAgentHostEnablementService } from '../../../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IOpenerService } from '../../../../../../../platform/opener/common/opener.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IWorkspaceContextService } from '../../../../../../../platform/workspace/common/workspace.js';
import { IsSessionsWindowContext } from '../../../../../../common/contextkeys.js';
import { IGitService } from '../../../../../git/common/gitService.js';
import { IChatEntitlementService } from '../../../../../../services/chat/common/chatEntitlementService.js';
import { TestChatEntitlementService, TestContextService } from '../../../../../../test/common/workbenchTestServices.js';
import { OpenDelegationPickerAction } from '../../../../browser/actions/chatExecuteActions.js';
import { AgentSessionProviders, AgentSessionTarget } from '../../../../browser/agentSessions/agentSessions.js';
import { IChatWidget, IChatWidgetService } from '../../../../browser/chat.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import { IChatInputNotificationService } from '../../../../browser/widget/input/chatInputNotificationService.js';
import { DelegationSessionPickerActionItem } from '../../../../browser/widget/input/delegationSessionPickerActionItem.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { IChatSessionsService, ResolvedChatSessionsExtensionPoint } from '../../../../common/chatSessionsService.js';
import { ILanguageModelsService } from '../../../../common/languageModels.js';

class TestDelegationSessionPickerActionItem extends DelegationSessionPickerActionItem {
	override getTooltip(): string {
		return super.getTooltip();
	}
}

suite('DelegationSessionPickerActionItem', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const harnesses = [
		{ type: AgentSessionProviders.AgentHostCopilot, label: 'Copilot', icon: Codicon.copilot },
		{ type: AgentSessionProviders.AgentHostClaude, label: 'Claude', icon: Codicon.claude },
		{ type: AgentSessionProviders.AgentHostCodex, label: 'Codex', icon: Codicon.openai },
		{ type: 'remote-test-host-copilot', label: 'Copilot (Test Host)', icon: Codicon.copilot },
	];
	const contributions: ResolvedChatSessionsExtensionPoint[] = harnesses.map(harness => ({
		type: harness.type,
		name: harness.type,
		displayName: harness.label,
		description: '',
		icon: harness.icon,
		canDelegate: true,
		supportsDelegation: false,
	}));

	function createPicker(sessionType: AgentSessionTarget, isSessionsWindow = false, initialContributions = contributions) {
		const instantiationService = store.add(new TestInstantiationService());
		const configurationService = new TestConfigurationService();
		const contextKeyService = store.add(new ContextKeyService(configurationService));
		const availabilityChanged = store.add(new Emitter<void>());
		const activeProviderChanged = store.add(new Emitter<AgentSessionTarget>());
		const registeredContributions = [...initialContributions];
		let activeProvider = sessionType;
		let pendingTarget: AgentSessionTarget | undefined;
		let showCount = 0;
		let selectItem: (label: string) => void = () => assert.fail('Picker has not opened');

		const chatSessionsService = new class extends mock<IChatSessionsService>() {
			override readonly onDidChangeAvailability = availabilityChanged.event;
			override getAllChatSessionContributions() { return registeredContributions; }
			override getChatSessionContribution(type: string) { return registeredContributions.find(contribution => contribution.type === type); }
			override supportsDelegationForSessionType(type: string) { return this.getChatSessionContribution(type)?.supportsDelegation !== false; }
			override requiresCopilotSignInForSessionType() { return false; }
			override supportsAutoModelForSessionType() { return true; }
			override requiresCustomModelsForSessionType() { return false; }
		}();
		const actionWidgetService = new class extends mock<IActionWidgetService>() {
			override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
				showCount++;
				selectItem = label => {
					const item = items.find(item => item.label === label);
					assert.ok(item?.item);
					assert.strictEqual(item.disabled, false);
					delegate.onSelect(item.item);
				};
			}
			override hide(): void { }
		}();

		ChatContextKeys.enabled.bindTo(contextKeyService).set(true);
		ChatContextKeys.chatSessionIsEmpty.bindTo(contextKeyService).set(false);
		ChatContextKeys.agentSessionType.bindTo(contextKeyService).set(sessionType);
		ChatContextKeys.chatSessionSupportsDelegation.bindTo(contextKeyService).set(chatSessionsService.supportsDelegationForSessionType(sessionType));
		IsSessionsWindowContext.bindTo(contextKeyService).set(isSessionsWindow);

		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IChatSessionsService, chatSessionsService);
		instantiationService.stub(IActionWidgetService, actionWidgetService);
		instantiationService.stub(IKeybindingService, new MockKeybindingService());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() { }());
		instantiationService.stub(IOpenerService, new class extends mock<IOpenerService>() { }());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
		instantiationService.stub(IWorkspaceContextService, new TestContextService());
		instantiationService.stub(IChatEntitlementService, new TestChatEntitlementService());
		instantiationService.stub(IAgentHostEnablementService, {
			_serviceBrand: undefined,
			enabled: constObservable(true),
			managedSandboxEnforced: constObservable(false),
			managedSandboxAllowsBypass: constObservable(false),
		});
		instantiationService.stub(ILanguageModelsService, new class extends mock<ILanguageModelsService>() {
			override getLanguageModelIds() { return []; }
		}());
		instantiationService.stub(IChatInputNotificationService, new class extends mock<IChatInputNotificationService>() {
			override getActiveNotification() { return undefined; }
		}());
		instantiationService.stub(IGitService, new class extends mock<IGitService>() { }());

		const action = instantiationService.createInstance(MenuItemAction, new OpenDelegationPickerAction().desc, undefined, undefined, undefined, undefined);
		const compact = observableValue('compact', false);
		const picker = store.add(instantiationService.createInstance(TestDelegationSessionPickerActionItem, action, 'editor', {
			getActiveSessionProvider: () => activeProvider,
			getPendingDelegationTarget: () => pendingTarget,
			setPendingDelegationTarget: target => { pendingTarget = target; },
			onDidChangeActiveSessionProvider: activeProviderChanged.event,
		}, { compact }));
		const container = dom.append(document.body, dom.$('.action-item'));
		store.add(toDisposable(() => container.remove()));
		picker.render(container);
		const element = container.querySelector<HTMLElement>('.action-label');
		assert.ok(element);

		return {
			picker, element, container, compact, instantiationService,
			getShowCount: () => showCount,
			getPendingTarget: () => pendingTarget,
			selectItem: (label: string) => selectItem(label),
			setActiveProvider: (provider: AgentSessionTarget) => {
				activeProvider = provider;
				activeProviderChanged.fire(provider);
			},
			registerContribution: (contribution: ResolvedChatSessionsExtensionPoint) => {
				registeredContributions.push(contribution);
				availabilityChanged.fire();
			},
		};
	}

	for (const isSessionsWindow of [false, true]) {
		for (const harness of harnesses) {
			test(`shows ${harness.label} disabled without a tooltip in the ${isSessionsWindow ? 'Agents' : 'editor'} window`, () => {
				const { picker, element, container, getShowCount, getPendingTarget } = createPicker(harness.type, isSessionsWindow);
				element.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
				element.click();
				for (const [key, keyCode] of [['Enter', 13], [' ', 32]] as const) {
					element.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
				}
				picker.show();
				picker.setFocusable(true);

				assert.deepStrictEqual({
					label: element.textContent,
					ariaLabel: element.ariaLabel,
					ariaDisabled: element.getAttribute('aria-disabled'),
					expanded: element.getAttribute('aria-expanded'),
					tabIndex: element.tabIndex,
					disabledStyle: container.classList.contains('disabled'),
					enabled: picker.isEnabled(),
					tooltip: picker.getTooltip(),
					showCount: getShowCount(),
					pendingTarget: getPendingTarget(),
				}, {
					label: harness.label,
					ariaLabel: harness.label,
					ariaDisabled: 'true',
					expanded: 'false',
					tabIndex: -1,
					disabledStyle: true,
					enabled: false,
					tooltip: '',
					showCount: 0,
					pendingTarget: undefined,
				});
			});
		}
	}

	test('stays disabled before registration and refreshes the remote harness label when metadata arrives', () => {
		const remote = contributions[3];
		const { picker, element, registerContribution } = createPicker(remote.type, false, []);
		const before = { label: element.textContent, enabled: picker.isEnabled() };
		registerContribution(remote);

		assert.deepStrictEqual({
			before,
			after: { label: element.textContent, ariaLabel: element.ariaLabel, enabled: picker.isEnabled(), tooltip: picker.getTooltip() },
		}, {
			before: { label: remote.type, enabled: false },
			after: { label: remote.displayName, ariaLabel: remote.displayName, enabled: false, tooltip: '' },
		});
	});

	test('keeps the current harness identifiable when compact or when the active session changes', () => {
		const { picker, element, compact, setActiveProvider } = createPicker(AgentSessionProviders.AgentHostCopilot);
		setActiveProvider(AgentSessionProviders.AgentHostClaude);
		compact.set(true, undefined);
		assert.deepStrictEqual({
			text: element.textContent,
			ariaLabel: element.ariaLabel,
			ariaDisabled: element.getAttribute('aria-disabled'),
			tooltip: picker.getTooltip(),
		}, {
			text: '',
			ariaLabel: 'Claude',
			ariaDisabled: 'true',
			tooltip: '',
		});
	});

	test('blocks the registered command and overflow opening for Agent Host sessions', async () => {
		const { picker, container, instantiationService, getShowCount } = createPicker(AgentSessionProviders.AgentHostCopilot);
		store.add(registerAction2(OpenDelegationPickerAction));
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override readonly lastFocusedWidget = new class extends mock<IChatWidget>() {
				override readonly input = new class extends mock<ChatInputPart>() {
					override openDelegationPicker() { picker.show(); }
				}();
			}();
		}());
		const command = CommandsRegistry.getCommand(OpenDelegationPickerAction.ID);
		assert.ok(command);
		await instantiationService.invokeFunction(accessor => command.handler(accessor));
		picker.show(container);
		assert.strictEqual(getShowCount(), 0);
	});

	test('preserves delegation from Local to an Agent Host harness', () => {
		const { picker, element, selectItem, getPendingTarget } = createPicker(AgentSessionProviders.Local);
		picker.show();
		selectItem('Claude');
		assert.deepStrictEqual({
			enabled: picker.isEnabled(),
			label: element.textContent,
			ariaDisabled: element.getAttribute('aria-disabled'),
			tooltip: picker.getTooltip(),
			pendingTarget: getPendingTarget(),
		}, {
			enabled: true,
			label: 'Claude',
			ariaDisabled: 'false',
			tooltip: 'Delegate Session',
			pendingTarget: AgentSessionProviders.AgentHostClaude,
		});
	});
});
