/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Action } from '../../../../../base/common/actions.js';
import { timeout } from '../../../../../base/common/async.js';
import { EventType as TouchEventType } from '../../../../../base/browser/touch.js';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { isIMenuItem, MenuId, MenuRegistry, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IKeybindingService } from '../../../../../platform/keybinding/common/keybinding.js';
import { MockKeybindingService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAgentsModeService } from '../../../../services/agentsMode/common/agentsMode.js';
import { AGENTS_MODE_ENABLED_SETTING } from '../../../../services/configuration/browser/agents/agentsModeWorkspaceService.js';
import { IEditorIdentifier } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService, IEditorPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService, IVisibleEditorsChangeEvent } from '../../../../services/editor/common/editorService.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { gettingStartedInputTypeId } from '../../../welcomeGettingStarted/browser/gettingStartedInput.js';
import { AgentsModeActive, CanEnterAgentsMode, ToggleAgentsModeAction } from '../../browser/agentSessions/agentsModeActions.js';
import { AgentsModeAuxiliaryBar } from '../../browser/agentSessions/agentsModeAuxiliaryBar.js';
import { AgentsModeEditorArea } from '../../browser/agentSessions/agentsModeEditorArea.js';
import { AgentsModeButtonActionViewItem } from '../../browser/agentSessions/agentsModeButton.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

suite('Agents mode actions', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('exit remains available when AI and entry are disabled', async () => {
		const configuration = new TestConfigurationService();
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		const chatEnabled = ChatContextKeys.enabled.bindTo(context);
		const modeActive = AgentsModeActive.bindTo(context);
		const canEnter = CanEnterAgentsMode.bindTo(context);
		const settingsDisabled = context.createOverlay([[`config.${AGENTS_MODE_ENABLED_SETTING}`, false]]);
		const settingsEnabled = context.createOverlay([[`config.${AGENTS_MODE_ENABLED_SETTING}`, true]]);
		const commandId = 'workbench.action.chat.toggleAgentsMode';
		if (!CommandsRegistry.getCommand(commandId)) {
			disposables.add(registerAction2(ToggleAgentsModeAction));
		}
		const item = MenuRegistry.getMenuItems(MenuId.TitleBarAdjacentCenter).filter(isIMenuItem).find(item => item.command.id === commandId);
		const command = CommandsRegistry.getCommand(commandId);
		assert.ok(item && command);

		chatEnabled.set(true);
		canEnter.set(true);
		const enter = settingsEnabled.contextMatchesRules(item.when);
		const entryDisabledBySetting = !settingsDisabled.contextMatchesRules(item.when);
		chatEnabled.set(false);
		const entryDisabledByAI = !settingsEnabled.contextMatchesRules(item.when);

		canEnter.set(false);
		modeActive.set(true);
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IContextKeyService, settingsDisabled);
		instantiation.stub(IStorageService, disposables.add(new InMemoryStorageService()));
		let toggles = 0;
		instantiation.stub(IAgentsModeService, { isSupported: true, isActive: true, setActive: async () => { toggles++; } });
		instantiation.stub(IWorkbenchLayoutService, { isVisible: () => false });
		await command.handler(instantiation);

		assert.deepStrictEqual({
			enter,
			entryDisabledByAI,
			entryDisabledBySetting,
			exit: settingsDisabled.contextMatchesRules(item.when),
			toggles,
		}, { enter: true, entryDisabledByAI: true, entryDisabledBySetting: true, exit: true, toggles: 1 });
	});

	test('toggling stores the secondary side bar width before the switch, which the mode gives it back once switched', async () => {
		const configuration = new TestConfigurationService();
		disposables.add(configuration.onDidChangeConfigurationEmitter);
		const context = disposables.add(new ContextKeyService(configuration));
		AgentsModeActive.bindTo(context).set(true);
		const commandId = 'workbench.action.chat.toggleAgentsMode';
		if (!CommandsRegistry.getCommand(commandId)) {
			disposables.add(registerAction2(ToggleAgentsModeAction));
		}
		const command = CommandsRegistry.getCommand(commandId)!;

		const run = async (auxiliaryBarVisible: boolean, { active = true, maximized = false, width = 292, storage = disposables.add(new InMemoryStorageService()) }: { active?: boolean; maximized?: boolean; width?: number; storage?: IStorageService } = {}) => {
			const sizes: number[] = [];
			const instantiation = disposables.add(new TestInstantiationService());
			instantiation.stub(IContextKeyService, context);
			instantiation.stub(IStorageService, storage);
			// The switch moves the side bars and hides the editor area, which squeezes the secondary side bar
			instantiation.stub(IAgentsModeService, { isSupported: true, isActive: active, setActive: async () => { width = maximized ? 573 : 162; maximized = false; } });
			instantiation.stub(IWorkbenchLayoutService, {
				isVisible: (part: Parts) => part === Parts.AUXILIARYBAR_PART && auxiliaryBarVisible,
				isAuxiliaryBarMaximized: () => maximized,
				mainContainerDimension: { width: 1184, height: 800 },
				getSize: () => ({ width, height: 800 }),
				setSize: (_part: Parts, size: { width: number }) => { width = size.width; sizes.push(size.width); },
			});
			const auxiliaryBar = instantiation.createInstance(AgentsModeAuxiliaryBar);
			await command.handler(instantiation);
			auxiliaryBar.applyWidth();
			auxiliaryBar.dispose();
			return { width, sizes };
		};

		const storage = disposables.add(new InMemoryStorageService());
		assert.deepStrictEqual({
			visible: await run(true),
			hidden: await run(false),
			maximizedFirstEntry: await run(true, { active: false, maximized: true }),
			leave: await run(true, { storage }),
			maximizedEnter: await run(true, { active: false, maximized: true, storage }),
			narrowerEnter: await run(true, { active: false, width: 281, storage }),
			visibleFirstEntry: await run(true, { active: false, width: 281 }),
		}, {
			visible: { width: 292, sizes: [292] },
			hidden: { width: 162, sizes: [] },
			maximizedFirstEntry: { width: 296, sizes: [296] },
			leave: { width: 292, sizes: [292] },
			maximizedEnter: { width: 292, sizes: [292] },
			narrowerEnter: { width: 292, sizes: [292] },
			visibleFirstEntry: { width: 281, sizes: [281] },
		});
	});

	test('title bar button shows the agent icon and label and follows the toggled state', async () => {
		const action: Action = disposables.add(new Action(ToggleAgentsModeAction.ID, undefined, undefined, true, async () => { action.checked = !action.checked; }));
		action.checked = false;
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IKeybindingService, new class extends MockKeybindingService {
			override appendKeybinding(label: string): string { return `${label} (Ctrl+Alt+A)`; }
		});
		const item = disposables.add(instantiation.createInstance(AgentsModeButtonActionViewItem, action, {}));
		const container = document.createElement('div');
		item.render(container);
		const state = () => ({ pressed: container.getAttribute('aria-pressed'), checked: container.classList.contains('checked'), ariaLabel: container.getAttribute('aria-label') });

		const content = Array.from(container.children).map(child => child.classList.contains('codicon-agent') ? `icon:${child.getAttribute('aria-hidden')}` : child.textContent);
		const initial = state();
		container.click();
		await timeout(0);
		const afterClick = state();
		action.checked = false;
		const afterExternalChange = state();

		assert.deepStrictEqual({ content, role: container.getAttribute('role'), initial, afterClick, afterExternalChange }, {
			content: ['icon:true', 'Agents'],
			role: 'button',
			initial: { pressed: null, checked: false, ariaLabel: 'Agents: Turn On Agents Mode (Ctrl+Alt+A)' },
			afterClick: { pressed: null, checked: true, ariaLabel: 'Agents: Turn Off Agents Mode (Ctrl+Alt+A)' },
			afterExternalChange: { pressed: null, checked: false, ariaLabel: 'Agents: Turn On Agents Mode (Ctrl+Alt+A)' },
		});
	});

	test('title bar button toggles once on a double tap', async () => {
		let runs = 0;
		const action = disposables.add(new Action(ToggleAgentsModeAction.ID, undefined, undefined, true, async () => { runs++; }));
		const instantiation = disposables.add(new TestInstantiationService());
		instantiation.stub(IKeybindingService, new MockKeybindingService());
		const item = disposables.add(instantiation.createInstance(AgentsModeButtonActionViewItem, action, {}));
		const container = document.createElement('div');
		item.render(container);

		for (const tapCount of [1, 2]) {
			container.dispatchEvent(Object.assign(new Event(TouchEventType.Tap), { tapCount }));
		}
		await timeout(0);

		assert.strictEqual(runs, 1);
	});

	suite('editor area', () => {

		interface IScenario {
			readonly editors?: number;
			readonly welcome?: boolean;
			readonly chatPartVisible?: boolean;
			readonly panelVisible?: boolean;
			/** What happens in the mode before leaving it */
			readonly inMode?: 'openEditor' | 'restart' | 'restartWithoutMode' | 'showChatPart' | 'reopenChatPart';
		}

		async function run(scenario: IScenario) {
			const instantiation = disposables.add(new TestInstantiationService());
			const storage = disposables.add(new InMemoryStorageService());
			const visibleEditorsChange = disposables.add(new Emitter<IVisibleEditorsChangeEvent>());
			const partVisibilityChange = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
			const agentsMode = { isSupported: true, isActive: false };
			const calls: string[] = [];
			let welcome = !!scenario.welcome;
			let editors = scenario.editors ?? 0;
			let editorVisible = true;
			let chatPartVisible = !!scenario.chatPartVisible;
			let panelVisible = !!scenario.panelVisible;
			instantiation.stub(IStorageService, storage);
			instantiation.stub(IAgentsModeService, agentsMode);
			const editorInputs = (): EditorInput[] => [
				...(welcome ? [gettingStartedInputTypeId] : []),
				...Array.from({ length: editors }, () => 'workbench.editors.files.fileEditorInput'),
			].map(typeId => ({ typeId }) as EditorInput);
			instantiation.stub(IEditorService, {
				onDidVisibleEditorsChange: visibleEditorsChange.event,
				getEditors: () => editorInputs().map(editor => ({ editor, groupId: 1 })),
				closeEditors: async (toClose: readonly IEditorIdentifier[]) => {
					calls.push(`close ${toClose.map(({ editor }) => editor.typeId).join()}`);
					welcome = welcome && !toClose.some(({ editor }) => editor.typeId === gettingStartedInputTypeId);
				},
			});
			const mainPart: Partial<IEditorPart> = { get groups() { return [{ get isEmpty() { return editorInputs().length === 0; } } as Partial<IEditorGroup> as IEditorGroup]; } };
			instantiation.stub(IEditorGroupsService, { mainPart: mainPart as IEditorPart });
			instantiation.stub(IWorkbenchLayoutService, {
				onDidChangePartVisibility: partVisibilityChange.event,
				isAuxiliaryBarMaximized: () => false,
				isVisible: (part: Parts) => part === Parts.EDITOR_PART ? editorVisible : part === Parts.CHAT_PART ? chatPartVisible : part === Parts.PANEL_PART && panelVisible,
				setPartHidden: (hidden: boolean, part: Parts) => {
					calls.push(`${hidden ? 'hide' : 'show'} ${part}`);
					editorVisible = !hidden;
					// Like the layout: the editor and panel cannot be hidden at the same time unless a chat part shows
					if (hidden && !panelVisible && !chatPartVisible) {
						panelVisible = true;
					}
				},
				setEditorHiddenByChat: (hidden: boolean) => { calls.push(`hiddenByChat ${hidden}`); editorVisible = !hidden; },
			});
			const state = () => ({ editorVisible, panelVisible, calls: calls.splice(0) });

			let editorArea = instantiation.createInstance(AgentsModeEditorArea);
			agentsMode.isActive = true;
			await editorArea.enter();
			const afterEnter = state();

			let inMode: { editorVisible: boolean; panelVisible: boolean; calls: string[] } | undefined;
			if (scenario.inMode === 'openEditor') {
				editors++;
				visibleEditorsChange.fire({ isExplicit: true });
				inMode = state();
			} else if (scenario.inMode === 'showChatPart') {
				chatPartVisible = true;
				partVisibilityChange.fire({ partId: Parts.CHAT_PART, visible: true });
				inMode = state();
			} else if (scenario.inMode === 'reopenChatPart') {
				// Like the layout: closing the chat part shows the editor area it had hidden
				chatPartVisible = false;
				editorVisible = true;
				partVisibilityChange.fire({ partId: Parts.CHAT_PART, visible: false });
				chatPartVisible = true;
				partVisibilityChange.fire({ partId: Parts.CHAT_PART, visible: true });
				inMode = state();
			} else if (scenario.inMode === 'restart') {
				editorArea.dispose();
				editorArea = instantiation.createInstance(AgentsModeEditorArea);
			} else if (scenario.inMode === 'restartWithoutMode') {
				// The window restarts with the mode turned off, so it is no longer in the mode, without having left it
				editorArea.dispose();
				agentsMode.isSupported = false;
				agentsMode.isActive = false;
				editorArea = instantiation.createInstance(AgentsModeEditorArea);
				inMode = state();
			}

			agentsMode.isActive = false;
			editorArea.leave();
			editorArea.dispose();
			return { afterEnter, ...(inMode ? { inMode } : {}), afterLeave: state() };
		}

		test('hides an empty editor area on entering only when another part takes its place, shows it on leaving, and leaves editors and the panel alone', async () => {
			const hiddenByChat = { editorVisible: false, panelVisible: false, calls: ['hiddenByChat true'] };
			const shownOnLeave = { editorVisible: true, panelVisible: false, calls: [`show ${Parts.EDITOR_PART}`] };
			const untouched = { editorVisible: true, panelVisible: false, calls: [] };
			assert.deepStrictEqual({
				emptyWithChatPart: await run({ chatPartVisible: true }),
				onlyWelcomeWithChatPart: await run({ welcome: true, chatPartVisible: true }),
				welcomeAndEditorWithChatPart: await run({ welcome: true, editors: 1, chatPartVisible: true }),
				emptyWithPanel: await run({ panelVisible: true }),
				emptyNothingElseVisible: await run({}),
				emptyChatPartShownInMode: await run({ inMode: 'showChatPart' }),
				emptyRestartedInMode: await run({ chatPartVisible: true, inMode: 'restart' }),
				emptyRestartedWithoutMode: await run({ chatPartVisible: true, inMode: 'restartWithoutMode' }),
				emptyChatPartReopenedInMode: await run({ chatPartVisible: true, inMode: 'reopenChatPart' }),
				withEditors: await run({ editors: 1, chatPartVisible: true }),
				editorOpenedInMode: await run({ chatPartVisible: true, inMode: 'openEditor' }),
			}, {
				emptyWithChatPart: { afterEnter: hiddenByChat, afterLeave: shownOnLeave },
				// The Welcome page closes before the editor area is looked at
				onlyWelcomeWithChatPart: { afterEnter: { ...hiddenByChat, calls: [`close ${gettingStartedInputTypeId}`, 'hiddenByChat true'] }, afterLeave: shownOnLeave },
				welcomeAndEditorWithChatPart: { afterEnter: { ...untouched, calls: [`close ${gettingStartedInputTypeId}`] }, afterLeave: untouched },
				emptyWithPanel: { afterEnter: { editorVisible: false, panelVisible: true, calls: [`hide ${Parts.EDITOR_PART}`] }, afterLeave: { ...shownOnLeave, panelVisible: true } },
				emptyNothingElseVisible: { afterEnter: untouched, afterLeave: untouched },
				// Hidden as the chat part shows, so the layout doesn't squeeze the side bars to keep room for the editor area
				emptyChatPartShownInMode: { afterEnter: untouched, inMode: hiddenByChat, afterLeave: shownOnLeave },
				emptyRestartedInMode: { afterEnter: hiddenByChat, afterLeave: shownOnLeave },
				emptyRestartedWithoutMode: { afterEnter: hiddenByChat, inMode: shownOnLeave, afterLeave: untouched },
				emptyChatPartReopenedInMode: { afterEnter: hiddenByChat, inMode: hiddenByChat, afterLeave: shownOnLeave },
				withEditors: { afterEnter: untouched, afterLeave: untouched },
				editorOpenedInMode: { afterEnter: hiddenByChat, inMode: { editorVisible: true, panelVisible: false, calls: [`show ${Parts.EDITOR_PART}`] }, afterLeave: untouched },
			});
		});
	});

	suite('auxiliary bar', () => {

		interface IScenario {
			readonly visibleBefore?: boolean;
			/** What happens in the mode before leaving it */
			readonly inMode?: 'restart' | 'restartWithoutMode';
		}

		function run(scenario: IScenario) {
			const instantiation = disposables.add(new TestInstantiationService());
			const storage = disposables.add(new InMemoryStorageService());
			const agentsMode = { isSupported: true, isActive: false };
			let visible = !!scenario.visibleBefore;
			const calls: string[] = [];
			instantiation.stub(IStorageService, storage);
			instantiation.stub(IAgentsModeService, agentsMode);
			instantiation.stub(IWorkbenchLayoutService, {
				isVisible: (part: Parts) => part === Parts.AUXILIARYBAR_PART && visible,
				setPartHidden: (hidden: boolean, part: Parts) => {
					calls.push(`${hidden ? 'hide' : 'show'} ${part}`);
					visible = !hidden;
				},
			});
			const state = () => ({ visible, calls: calls.splice(0) });

			let auxiliaryBar = instantiation.createInstance(AgentsModeAuxiliaryBar);
			agentsMode.isActive = true;
			auxiliaryBar.enter();
			const afterEnter = state();

			let inMode: { visible: boolean; calls: string[] } | undefined;
			if (scenario.inMode === 'restart') {
				auxiliaryBar.dispose();
				auxiliaryBar = instantiation.createInstance(AgentsModeAuxiliaryBar);
			} else if (scenario.inMode === 'restartWithoutMode') {
				// The window restarts with the mode turned off, so it is no longer in the mode, without having left it
				auxiliaryBar.dispose();
				agentsMode.isSupported = false;
				agentsMode.isActive = false;
				auxiliaryBar = instantiation.createInstance(AgentsModeAuxiliaryBar);
				inMode = state();
			}

			agentsMode.isActive = false;
			auxiliaryBar.leave();
			const afterLeave = state();
			auxiliaryBar.dispose();
			return { afterEnter, ...(inMode ? { inMode } : {}), afterLeave };
		}

		test('shows a hidden secondary side bar on entering and hides it again on leaving', () => {
			const shownOnEnter = { visible: true, calls: [`show ${Parts.AUXILIARYBAR_PART}`] };
			const hiddenOnLeave = { visible: false, calls: [`hide ${Parts.AUXILIARYBAR_PART}`] };
			const untouched = { visible: true, calls: [] };
			assert.deepStrictEqual({
				hiddenBefore: run({}),
				hiddenBeforeRestartedInMode: run({ inMode: 'restart' }),
				hiddenBeforeRestartedWithoutMode: run({ inMode: 'restartWithoutMode' }),
				visibleBefore: run({ visibleBefore: true }),
			}, {
				hiddenBefore: { afterEnter: shownOnEnter, afterLeave: hiddenOnLeave },
				hiddenBeforeRestartedInMode: { afterEnter: shownOnEnter, afterLeave: hiddenOnLeave },
				hiddenBeforeRestartedWithoutMode: { afterEnter: shownOnEnter, inMode: hiddenOnLeave, afterLeave: { visible: false, calls: [] } },
				visibleBefore: { afterEnter: untouched, afterLeave: untouched },
			});
		});
	});
});
