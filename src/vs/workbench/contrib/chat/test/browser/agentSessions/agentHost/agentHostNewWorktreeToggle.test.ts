/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { MenuWorkbenchToolBar } from '../../../../../../../platform/actions/browser/toolbar.js';
import { IMenuService, MenuId } from '../../../../../../../platform/actions/common/actions.js';
import { MenuService } from '../../../../../../../platform/actions/common/menuService.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../../../platform/contextkey/common/contextkey.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatAgentHostNewWorktreeSelected, ChatAgentHostNewWorktreeToggleVisible, createNewWorktreeCheckboxViewItem, ToggleAgentHostNewWorktreeAction } from '../../../../browser/agentSessions/agentHost/agentHostNewWorktreeToggle.js';
import { AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID, IAgentHostWorktreeSendChoiceService } from '../../../../browser/agentSessions/agentHost/agentHostWorktreeSendChoice.js';
import { resolveOnboardingTarget } from '../../../../../onboarding/browser/spotlight/onboardingTarget.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../../base/common/observable.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ChatContextKeys } from '../../../../common/actions/chatContextKeys.js';
import { SessionType } from '../../../../common/chatSessionsService.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { asCssVariableName, getSizeRegistry, sizeValueToCss } from '../../../../../../../platform/theme/common/sizeUtils.js';
import '../../../../../../../platform/theme/common/sizes/baseSizes.js';
import { TestColorTheme } from '../../../../../../../platform/theme/test/common/testThemeService.js';
import '../../../../browser/widget/media/chat.css';

suite('Agent host New Worktree checkbox', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders in the chat input toolbar as a checkbox with its name, checked as the session is to work in a new worktree, toggled by click and keyboard, disabled once the session started', async () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		const configuration = new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true });
		instantiation.stub(IConfigurationService, configuration);
		const context = store.add(instantiation.createInstance(ContextKeyService));
		instantiation.stub(IContextKeyService, context);
		const runs: unknown[] = [];
		instantiation.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async (id: string, ...args: unknown[]) => { runs.push([id, ...args]); return undefined; } }));
		instantiation.stub(IMenuService, store.add(instantiation.createInstance(MenuService)));
		// The chat whose send the Work in Parallel callout asks about, which the checkbox of that chat anchors
		const pendingSendChoice = observableValue<URI | undefined>('pendingSendChoice', undefined);
		const cancelled: string[] = [];
		const onDidShowSendChoice = store.add(new Emitter<URI>());
		instantiation.stub(IAgentHostWorktreeSendChoiceService, upcastPartial<IAgentHostWorktreeSendChoiceService>({ pendingSendChoice, onDidShowSendChoice: onDidShowSendChoice.event, cancelSendChoice: (resource: URI) => { cancelled.push(resource.path); } }));
		// A local agent host's new chat in a window with a single local folder, which has no worktrees
		context.createKey(ChatContextKeys.enabled.key, true);
		context.createKey(ChatContextKeys.chatIsAgentHostSession.key, true);
		context.createKey(ChatContextKeys.chatSessionType.key, SessionType.AgentHostCopilot);
		const sessionIsEmpty = context.createKey<boolean>(ChatContextKeys.chatSessionIsEmpty.key, true);
		context.createKey('workbenchState', 'folder');
		context.createKey('remoteName', '');
		context.createKey(ChatAgentHostNewWorktreeToggleVisible.key, true);
		const selected = context.createKey<boolean>(ChatAgentHostNewWorktreeSelected.key, false);
		const root = append(mainWindow.document.body, $('div'));
		store.add({ dispose: () => root.remove() });
		const toolbar = store.add(instantiation.createInstance(MenuWorkbenchToolBar, root, MenuId.ChatInputSecondary, {
			eventDebounceDelay: 0,
			menuOptions: { shouldForwardArgs: true },
			actionViewItemProvider: (action, options) => createNewWorktreeCheckboxViewItem(action, options, instantiation),
		}));
		const chat = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-1' });
		const onDidChangeViewModel = store.add(new Emitter<void>());
		const widget = { name: 'the chat widget', viewModel: { sessionResource: chat }, onDidChangeViewModel: onDidChangeViewModel.event };
		toolbar.context = { widget };
		const item = () => root.querySelector<HTMLElement>('.checkbox-action-item');
		const checkbox = () => item()?.querySelector<HTMLElement>('.monaco-custom-toggle');
		const state = () => ({ glyph: checkbox()?.classList.contains('codicon-worktree'), label: item()?.querySelector('.checkbox-label')?.textContent, role: checkbox()?.getAttribute('role'), checked: checkbox()?.getAttribute('aria-checked'), disabled: item()?.classList.contains('disabled') });
		const settle = () => new Promise<void>(resolve => setTimeout(resolve, 0));

		const unchecked = state();
		// The callout's target, as the onboarding engine resolves it for a run: the checkbox only while it asks about its chat
		const anchor = (pending: URI | undefined) => {
			pendingSendChoice.set(pending, undefined);
			return resolveOnboardingTarget(mainWindow, AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID)?.element === item();
		};
		const anchored = { ownChat: anchor(chat), otherChat: anchor(URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-2' })), none: anchor(undefined) };
		checkbox()!.click();
		await settle();
		selected.set(true);
		await settle();
		const checked = state();
		checkbox()!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', keyCode: 32, bubbles: true }));
		await settle();
		// While its callout shows on it about its chat, the chat input shows another: that question ends; and the one about the
		// other chat, once the checkbox it shows on goes
		pendingSendChoice.set(chat, undefined);
		onDidShowSendChoice.fire(chat);
		const other = URI.from({ scheme: SessionType.AgentHostCopilot, path: '/untitled-3' });
		widget.viewModel = { sessionResource: other };
		onDidChangeViewModel.fire();
		const cancelledOnOtherChat = [...cancelled];
		pendingSendChoice.set(other, undefined);
		onDidShowSendChoice.fire(other);
		sessionIsEmpty.set(false);
		await settle();
		const started = state();
		toolbar.dispose();
		const afterDisposed = !!resolveOnboardingTarget(mainWindow, AGENT_HOST_WORKTREE_SEND_CHOICE_TARGET_ID);
		await settle();

		assert.deepStrictEqual({ unchecked, checked, started, anchored, cancelledOnOtherChat, cancelled, afterDisposed, runs: runs.map(run => (run as unknown[])[0]), context: (runs[0] as unknown[])[1] }, {
			unchecked: { glyph: false, label: 'New Worktree', role: 'checkbox', checked: 'false', disabled: false },
			checked: { glyph: false, label: 'New Worktree', role: 'checkbox', checked: 'true', disabled: false },
			started: { glyph: false, label: 'New Worktree', role: 'checkbox', checked: 'true', disabled: true },
			anchored: { ownChat: true, otherChat: false, none: false },
			cancelledOnOtherChat: ['/untitled-1'],
			cancelled: ['/untitled-1', '/untitled-3'],
			afterDisposed: false,
			runs: [ToggleAgentHostNewWorktreeAction.ID, ToggleAgentHostNewWorktreeAction.ID],
			context: { widget },
		});
	});

	test('sizes the checkbox as the chips beside it in the chat input toolbar: the compact checkbox, its check as their icons, its name as their names, its row as theirs', async () => {
		const instantiation = workbenchInstantiationService(undefined, store);
		instantiation.stub(IConfigurationService, new TestConfigurationService({ [ChatConfiguration.EditorWindowEnableWorktree]: true }));
		const context = store.add(instantiation.createInstance(ContextKeyService));
		instantiation.stub(IContextKeyService, context);
		instantiation.stub(ICommandService, upcastPartial<ICommandService>({ executeCommand: async () => undefined }));
		instantiation.stub(IMenuService, store.add(instantiation.createInstance(MenuService)));
		// The chat whose send the Work in Parallel callout asks about, which the checkbox of that chat anchors
		const pendingSendChoice = observableValue<URI | undefined>('pendingSendChoice', undefined);
		instantiation.stub(IAgentHostWorktreeSendChoiceService, upcastPartial<IAgentHostWorktreeSendChoiceService>({ pendingSendChoice, onDidShowSendChoice: Event.None }));
		context.createKey(ChatContextKeys.enabled.key, true);
		context.createKey(ChatContextKeys.chatIsAgentHostSession.key, true);
		context.createKey(ChatContextKeys.chatSessionType.key, SessionType.AgentHostCopilot);
		context.createKey(ChatContextKeys.chatSessionIsEmpty.key, true);
		context.createKey('workbenchState', 'folder');
		context.createKey('remoteName', '');
		context.createKey(ChatAgentHostNewWorktreeToggleVisible.key, true);
		// The chat input's secondary toolbar in the workbench, with the design tokens the theme provides
		const workbench = append(mainWindow.document.body, $('.monaco-workbench'));
		store.add({ dispose: () => workbench.remove() });
		const theme = new TestColorTheme();
		for (const contribution of getSizeRegistry().getSizes()) {
			const value = getSizeRegistry().resolveDefaultSize(contribution.id, theme);
			if (value) {
				workbench.style.setProperty(asCssVariableName(contribution.id), sizeValueToCss(value));
			}
		}
		const row = append(append(workbench, $('.interactive-session')), $('.chat-secondary-toolbar'));
		const chips = append(row, $('.chat-secondary-input-toolbar'));
		// A chip as the toolbar renders the others, such as Manual permissions: its icon and its name
		const chip = append(append(append(append(chips, $('.monaco-action-bar')), $('.actions-container')), $('.action-item.chat-input-picker-item')), $('a.action-label'));
		const chipIcon = append(chip, $('span.codicon.codicon-shield'));
		const chipName = append(chip, $('span.chat-input-picker-label', undefined, 'Manual permissions'));
		store.add(instantiation.createInstance(MenuWorkbenchToolBar, append(chips, $('div')), MenuId.ChatInputSecondary, {
			eventDebounceDelay: 0,
			actionViewItemProvider: (action, options) => createNewWorktreeCheckboxViewItem(action, options, instantiation),
		}));
		const item = row.querySelector<HTMLElement>('.checkbox-action-item')!;
		const size = (element: Element) => {
			const { width, height } = element.getBoundingClientRect();
			return `${width}x${height}`;
		};
		const middle = (element: Element) => {
			const { top, height } = element.getBoundingClientRect();
			return top + height / 2;
		};
		// Centered on the same device pixel: layout snaps to fractions of a pixel, which at a device pixel ratio of 1 leave
		// a line box of 18.2px a fraction of a pixel off the row's middle, which no screen can show
		const centeredIn = (element: Element, container: Element) => Math.abs(middle(element) - middle(container)) < 0.5 / mainWindow.devicePixelRatio;
		const box = item.querySelector('.monaco-custom-toggle')!;
		const name = item.querySelector('.checkbox-label')!;
		const font = (element: Element) => mainWindow.getComputedStyle(element).fontSize;

		assert.deepStrictEqual({
			box: size(box),
			glyph: font(box),
			name: font(name),
			rowHeight: item.getBoundingClientRect().height,
			centered: centeredIn(box, item) && centeredIn(name, item),
		}, {
			// The workbench's compact checkbox, as in other toolbars and chip rows
			box: '14x14',
			glyph: font(chipIcon),
			name: font(chipName),
			rowHeight: chip.getBoundingClientRect().height,
			centered: true,
		});
	});
});
