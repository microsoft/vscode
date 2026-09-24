/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionViewItemService } from '../../../../../../platform/actions/browser/actionViewItemService.js';
import { HiddenItemStrategy, MenuWorkbenchToolBar } from '../../../../../../platform/actions/browser/toolbar.js';
import { IMenuService, isIMenuItem, MenuId, MenuItemAction, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../platform/actions/common/menuService.js';
import { CommandsRegistry, ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IsSessionsWindowContext } from '../../../../../common/contextkeys.js';
import { IChatWidget, IChatWidgetService } from '../../../browser/chat.js';
import { CloudSandboxCheckbox } from '../../../browser/remoteAgentHost/cloudSandboxCheckbox.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { IChatSessionsService, SessionType } from '../../../common/chatSessionsService.js';
import { ChatAgentLocation } from '../../../common/constants.js';
import { ChatViewModel } from '../../../common/model/chatViewModel.js';
import { MockChatSessionsService } from '../../common/mockChatSessionsService.js';

suite('Cloud sandbox composer checkbox', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createCheckbox(hasRepository = true) {
		const instantiationService = store.add(new TestInstantiationService());
		const contextKeyService = store.add(new ContextKeyService(new TestConfigurationService()));
		const sessionsService = new MockChatSessionsService();
		const repositoryChanged = store.add(new Emitter<void>());
		const state = { hasRepository };
		const draft = URI.from({ scheme: SessionType.CopilotCloud, path: '/untitled-sandbox' });
		const resource = observableValue<URI | undefined>('sessionResource', draft);
		const aiEnabled = ChatContextKeys.enabled.bindTo(contextKeyService);
		aiEnabled.set(true);
		const empty = ChatContextKeys.chatSessionIsEmpty.bindTo(contextKeyService);
		empty.set(true);
		ChatContextKeys.location.bindTo(contextKeyService).set(ChatAgentLocation.Chat);
		const sessionsWindow = IsSessionsWindowContext.bindTo(contextKeyService);
		const quickChat = ChatContextKeys.inQuickChat.bindTo(contextKeyService);
		const widget = new class extends mock<IChatWidget>() {
			override get viewModel() {
				const sessionResource = resource.get();
				return sessionResource ? upcastPartial<ChatViewModel>({ sessionResource }) : undefined;
			}
		}();
		instantiationService.stub(IChatSessionsService, sessionsService);
		instantiationService.stub(IContextKeyService, contextKeyService);
		instantiationService.stub(IChatWidgetService, new class extends mock<IChatWidgetService>() {
			override readonly lastFocusedWidget = upcastPartial<IChatWidget>({
				viewModel: upcastPartial<ChatViewModel>({ sessionResource: draft.with({ path: '/untitled-another-widget' }) }),
			});
		}());
		instantiationService.stub(ICommandService, new class extends mock<ICommandService>() {
			override async executeCommand<T>(id: string, ...args: unknown[]): Promise<T | undefined> {
				const command = CommandsRegistry.getCommand(id);
				assert.ok(command);
				await instantiationService.invokeFunction(accessor => command.handler(accessor, ...args));
				return undefined;
			}
		}());
		const checkbox = store.add(instantiationService.createInstance(CloudSandboxCheckbox, resource));
		const registration = store.add(sessionsService.registerChatSessionCreationHandler(SessionType.CopilotCloud, {
			when: 'true',
			onDidChangeOption: repositoryChanged.event,
			getOption: sessionResource => ({
				label: 'Sandbox',
				description: state.hasRepository ? 'Run in a GitHub-managed sandbox' : 'A GitHub repository is required',
				checked: sessionsService.getSessionOption(sessionResource, 'githubSandbox') === 'true',
				enabled: state.hasRepository,
				setChecked: checked => sessionsService.setSessionOption(sessionResource, 'githubSandbox', String(checked)),
			}),
			createSession: async () => undefined,
		}));
		const item = MenuRegistry.getMenuItems(MenuId.ChatInputSecondary).filter(isIMenuItem).find(item => item.command.id === CloudSandboxCheckbox.ID);
		assert.ok(item);
		const action = () => instantiationService.createInstance(MenuItemAction, item.command, undefined, { shouldForwardArgs: true }, undefined, undefined);
		const render = () => {
			const viewItem = store.add(checkbox.createActionViewItem(action(), {}));
			viewItem.setActionContext({ widget });
			const container = document.createElement('div');
			viewItem.render(container);
			const input = container.querySelector<HTMLElement>('[role="checkbox"]');
			assert.ok(input);
			return { viewItem, container, input };
		};
		const renderToolbar = () => {
			instantiationService.stub(IKeybindingService, new MockKeybindingService());
			instantiationService.stub(IStorageService, store.add(new InMemoryStorageService()));
			instantiationService.stub(IMenuService, store.add(instantiationService.createInstance(MenuService)));
			instantiationService.stub(ITelemetryService, NullTelemetryService);
			instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({}));
			instantiationService.stub(IActionViewItemService, upcastPartial<IActionViewItemService>({
				onDidChange: Event.None,
				lookUp: () => undefined,
			}));
			const menuId = MenuId.for('test.cloudSandboxCheckbox');
			store.add(MenuRegistry.appendMenuItem(menuId, item));
			const container = document.body.appendChild(document.createElement('div'));
			store.add({ dispose: () => container.remove() });
			const toolbar = store.add(instantiationService.createInstance(MenuWorkbenchToolBar, container, menuId, {
				eventDebounceDelay: 0,
				menuOptions: { shouldForwardArgs: true },
				hiddenItemStrategy: HiddenItemStrategy.NoHide,
				actionViewItemProvider: (action, options) => checkbox.createActionViewItem(action, options),
			}));
			toolbar.context = { widget };
			const input = () => {
				const element = container.querySelector<HTMLElement>('[role="checkbox"]');
				assert.ok(element);
				return element;
			};
			return { toolbar, input };
		};
		return {
			draft, resource, widget, registration, sessionsService, state, repositoryChanged,
			aiEnabled, empty, sessionsWindow, quickChat, action, render, renderToolbar,
			visible: () => contextKeyService.contextMatchesRules(item.when),
		};
	}

	test('keeps keyboard focus when the toolbar refreshes the checked state', async () => {
		const h = createCheckbox();
		const { toolbar, input } = h.renderToolbar();
		toolbar.focus(0);
		const states: { checked: string | null; focused: boolean }[] = [];
		for (let index = 0; index < 2; index++) {
			const refreshed = Event.toPromise(toolbar.onDidChangeMenuItems, store.add(new DisposableStore()));
			input().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
			await refreshed;
			states.push({ checked: input().getAttribute('aria-checked'), focused: document.activeElement === input() });
		}
		assert.deepStrictEqual(states, [{ checked: 'true', focused: true }, { checked: 'false', focused: true }]);
	});

	test('enables the visible toolbar checkbox after repository discovery', async () => {
		const h = createCheckbox(false);
		const { toolbar, input } = h.renderToolbar();
		const before = input().getAttribute('aria-disabled');
		const refreshed = Event.toPromise(toolbar.onDidChangeMenuItems, store.add(new DisposableStore()));
		h.state.hasRepository = true;
		h.repositoryChanged.fire();
		await refreshed;
		assert.deepStrictEqual({ before, after: input().getAttribute('aria-disabled') }, { before: 'true', after: 'false' });
	});

	test('shows a labeled checkbox in the composer rather than a switch in the harness menu', () => {
		const h = createCheckbox();
		const { container, input } = h.render();
		assert.deepStrictEqual({
			visible: h.visible(),
			label: container.querySelector('.checkbox-label')?.textContent,
			checked: input.getAttribute('aria-checked'),
			disabled: input.getAttribute('aria-disabled'),
			switches: container.querySelectorAll('[role="switch"]').length,
		}, { visible: true, label: 'Sandbox', checked: 'false', disabled: 'false', switches: 0 });
	});

	test('updates a disabled checkbox when a repository becomes available', () => {
		const h = createCheckbox(false);
		const before = h.render();
		const initial = { disabled: before.input.getAttribute('aria-disabled'), tooltip: before.viewItem.action.tooltip, visible: h.visible() };
		before.input.click();
		h.state.hasRepository = true;
		h.repositoryChanged.fire();
		const after = h.render();
		assert.deepStrictEqual({
			initial,
			enabledAfterRepository: after.input.getAttribute('aria-disabled'),
			checked: h.sessionsService.getSessionOption(h.draft, 'githubSandbox'),
		}, {
			initial: { disabled: 'true', tooltip: 'A GitHub repository is required', visible: true },
			enabledAfterRepository: 'false',
			checked: undefined,
		});
	});

	for (const interaction of ['checkbox', 'label', 'keyboard'] as const) {
		test(`${interaction} toggles only the originating draft`, async () => {
			const h = createCheckbox();
			const { viewItem, container, input } = h.render();
			const ran = Event.toPromise(viewItem.actionRunner.onDidRun, store.add(new DisposableStore()));
			if (interaction === 'checkbox') {
				input.click();
			} else if (interaction === 'label') {
				container.querySelector<HTMLElement>('.checkbox-label')!.click();
			} else {
				input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', keyCode: 32, bubbles: true }));
			}
			const result = await ran;
			assert.deepStrictEqual({
				error: result.error,
				checked: h.action().checked,
				draft: h.sessionsService.getSessionOption(h.draft, 'githubSandbox'),
				otherDraft: h.sessionsService.getSessionOption(h.draft.with({ path: '/untitled-another-widget' }), 'githubSandbox'),
			}, { error: undefined, checked: true, draft: 'true', otherDraft: undefined });
		});
	}

	test('the ordinary overflow action carries checked state and toggles the same draft', async () => {
		const h = createCheckbox();
		h.sessionsService.setSessionOption(h.draft, 'githubSandbox', 'true');
		const overflowAction = h.action();
		await overflowAction.run({ widget: h.widget });
		assert.deepStrictEqual({ before: overflowAction.checked, after: h.action().checked }, { before: true, after: false });
	});

	test('keeps checkbox state separate when changing drafts', () => {
		const h = createCheckbox();
		h.sessionsService.setSessionOption(h.draft, 'githubSandbox', 'true');
		h.resource.set(h.draft.with({ path: '/untitled-other' }), undefined);
		const anotherDraft = h.action().checked;
		h.resource.set(h.draft, undefined);
		assert.deepStrictEqual({ anotherDraft, originalDraft: h.action().checked }, { anotherDraft: false, originalDraft: true });
	});

	test('hides the checkbox outside new Cloud drafts', () => {
		const h = createCheckbox();
		const visibility: boolean[] = [];
		for (const resource of [
			h.draft.with({ scheme: SessionType.AgentHostCopilot }),
			h.draft.with({ path: '/existing' }),
			undefined,
			h.draft,
		]) {
			h.resource.set(resource, undefined);
			visibility.push(h.visible());
		}
		h.empty.set(false);
		visibility.push(h.visible());
		h.empty.set(true);
		h.aiEnabled.set(false);
		visibility.push(h.visible());
		h.aiEnabled.set(true);
		h.sessionsWindow.set(true);
		visibility.push(h.visible());
		h.sessionsWindow.set(false);
		h.quickChat.set(true);
		visibility.push(h.visible());
		h.quickChat.set(false);
		h.registration.dispose();
		visibility.push(h.visible());

		assert.deepStrictEqual(visibility, [false, false, false, true, false, false, false, false, false]);
	});
});
