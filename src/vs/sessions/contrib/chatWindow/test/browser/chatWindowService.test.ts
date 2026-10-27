/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { EditorCloseContext, GroupModelChangeKind, IEditorCloseEvent } from '../../../../../workbench/common/editor.js';
import { IGroupModelChangeEvent } from '../../../../../workbench/common/editor/editorGroupModel.js';
import { ICreateEditorPartOptions, IEditorGroup, IEditorGroupsService, IEmbeddedEditorPart } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { MainEditorAreaVisibleContext } from '../../../../../workbench/common/contextkeys.js';
import { IEditorGroupViewOptions } from '../../../../../workbench/browser/parts/editor/editor.js';
import { DesktopMainEditorPart } from '../../../../browser/parts/desktopEditorPart.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { SessionGridCell, SessionLayoutMode, SessionTerminalPosition } from '../../../../common/sessionGridLayout/sessionGridLayout.js';
import { ChatWindowContext, ChatWindowEditorGroupContext, ChatWindowIdContext, ChatWindowTerminalPositionContext, IChatWindowKind, SessionLayoutModeContext } from '../../../../services/chatWindow/browser/chatWindowService.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { bindChatWindowContext, bindEditorAreaVisible, chatWindowPartOptions, createChatWindowEditorArea, createChatWindowServices, createChatWindowSessionViewHost, showChatInsteadOfEmptyEditorArea, showChatBackgroundInChatWindow, trackEditorAreaEditors } from '../../browser/chatWindowService.js';
import { ChatWindowDefaults, ChatWindowState } from '../../browser/chatWindowState.js';
import { ChatWindowCellView } from '../../browser/chatWindowGridHost.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IAccessibilityService } from '../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ISessionsChatBackgroundService } from '../../../../services/chatBackground/browser/chatBackgroundService.js';
import { AGENTS_CARD_SURFACE_CLASS } from '../../../../browser/parts/agentsPartCard.js';

suite('Chat window', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('focusing its session focuses the window, and the chat only while it shows, so that a window showing only its editor area keeps it so', () => {
		const focused: string[] = [];
		let chatVisible = true;
		const host = createChatWindowSessionViewHost(() => focused.push('window'), () => focused.push('chat'), () => chatVisible);

		host.focus();
		chatVisible = false;
		host.focus();

		assert.deepStrictEqual(focused, ['window', 'chat', 'window']);
	});

	test('binds its context on its own context key service, which follows its state, and not on the main window\'s', () => {
		const mainContextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const windowContextKeyService = disposables.add(mainContextKeyService.createScoped($('div')));
		const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide };
		const state = new ChatWindowState(kind, true, new ChatWindowDefaults(kind, disposables.add(new InMemoryStorageService())));
		const editorGroup = observableValue<IEditorGroup | undefined>('group', { id: 7 } as IEditorGroup);
		disposables.add(bindChatWindowContext(windowContextKeyService, {
			kind, windowId: 42, hasEditorArea: true, state,
			session: observableValue<IActiveSession | undefined>('session', undefined),
			editorGroup,
			editorAreaEditor: observableValue('editor', ''),
		}));
		const read = (service: ContextKeyService | typeof windowContextKeyService) => [ChatWindowContext, ChatWindowIdContext, SessionLayoutModeContext, ChatWindowTerminalPositionContext, ChatWindowEditorGroupContext].map(key => service.getContextKeyValue(key.key));
		const before = read(windowContextKeyService);
		state.setLayout(SessionLayoutMode.Stacked);
		state.setTerminalPosition(SessionTerminalPosition.UnderChat);
		editorGroup.set({ id: 8 } as IEditorGroup, undefined);
		assert.deepStrictEqual({ before, after: read(windowContextKeyService), main: read(mainContextKeyService) }, {
			before: ['test', 42, SessionLayoutMode.SideBySide, SessionTerminalPosition.FullWidth, 7],
			after: ['test', 42, SessionLayoutMode.Stacked, SessionTerminalPosition.UnderChat, 8],
			main: [undefined, undefined, undefined, undefined, undefined],
		});
	});

	test('its editor area shows when an editor opens in it, and closes when its last editor closes, but not for a move or while the window closes', () => {
		const onDidModelChange = disposables.add(new Emitter<IGroupModelChangeEvent>());
		const onDidCloseEditor = disposables.add(new Emitter<IEditorCloseEvent>());
		const onDidAddGroup = disposables.add(new Emitter<IEditorGroup>());
		const onDidRemoveGroup = disposables.add(new Emitter<IEditorGroup>());
		let isEmpty = false;
		let closing = false;
		const group = new class extends mock<IEditorGroup>() {
			override onDidModelChange = onDidModelChange.event;
			override onDidCloseEditor = onDidCloseEditor.event;
			override get isEmpty() { return isEmpty; }
		}();
		const part = new class extends mock<IEmbeddedEditorPart>() {
			override groups = [group];
			override onDidAddGroup = onDidAddGroup.event;
			override onDidRemoveGroup = onDidRemoveGroup.event;
		}();
		const events: string[] = [];
		disposables.add(trackEditorAreaEditors(part, {
			onDidOpenEditor: () => events.push('open'),
			onDidCloseLastEditor: () => events.push('closeLast'),
			isClosing: () => closing,
		}));

		onDidModelChange.fire({ kind: GroupModelChangeKind.EDITOR_OPEN });
		onDidCloseEditor.fire({ context: EditorCloseContext.UNKNOWN } as IEditorCloseEvent);
		isEmpty = true;
		onDidCloseEditor.fire({ context: EditorCloseContext.MOVE } as IEditorCloseEvent);
		onDidCloseEditor.fire({ context: EditorCloseContext.UNKNOWN } as IEditorCloseEvent);
		closing = true;
		onDidCloseEditor.fire({ context: EditorCloseContext.UNKNOWN } as IEditorCloseEvent);

		assert.deepStrictEqual(events, ['open', 'closeLast']);
	});

	test('its editor area follows the tabs setting, showing one tab for none so that its actions stay', () => {
		assert.deepStrictEqual([chatWindowPartOptions('multiple'), chatWindowPartOptions('none')], [
			{ doubleClickTabToToggleEditorGroupSizes: 'off' },
			{ doubleClickTabToToggleEditorGroupSizes: 'off', showTabs: 'single' },
		]);
	});
	test('its editor area is created in its window, which it belongs to, and it and the editors and actions in it act on the window\'s session, not on the main window\'s', () => {
		const session = observableValue<IActiveSession | undefined>('session', undefined);
		const scope: ISessionScope = { _serviceBrand: undefined, session };
		let services: ServiceCollection | undefined;
		let inWindow = false;
		const windowContainer = $('div');
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override createEditorPart(options: ICreateEditorPartOptions) {
				services = options.services;
				inWindow = (options.container as HTMLElement).parentElement === windowContainer;
				return new class extends mock<IEmbeddedEditorPart>() { }();
			}
		}();
		createChatWindowEditorArea(editorGroupsService, windowContainer, createChatWindowServices(scope));
		assert.deepStrictEqual({ scope: (services?.get(ISessionScope) as ISessionScope | undefined)?.session === session, inWindow }, { scope: true, inWindow: true });
	});

	test('its editor area tells its editors whether it is visible as the main window tells its own: not while the window shows only its chat', () => {
		const contextKeyService = disposables.add(new ContextKeyService(new TestConfigurationService()));
		const state = new ChatWindowState({ id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide }, true, new ChatWindowDefaults({ id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide }, disposables.add(new InMemoryStorageService())));
		disposables.add(bindEditorAreaVisible(contextKeyService, state));
		const visible = Object.fromEntries([SessionLayoutMode.SideBySide, SessionLayoutMode.Stacked, SessionLayoutMode.EditorOnly, SessionLayoutMode.ChatOnly].map(mode => {
			state.setLayout(mode);
			return [mode, contextKeyService.getContextKeyValue(MainEditorAreaVisibleContext.key)];
		}));
		assert.deepStrictEqual(visible, { [SessionLayoutMode.SideBySide]: true, [SessionLayoutMode.Stacked]: true, [SessionLayoutMode.EditorOnly]: true, [SessionLayoutMode.ChatOnly]: false });
	});

	test('its editor area shows the same header, tab row and menus as the main window\'s editor area, so that editors show and contribute their actions alike', () => {
		let options: IEditorGroupViewOptions | undefined;
		const editorGroupsService = new class extends mock<IEditorGroupsService>() {
			override createEditorPart(createOptions: ICreateEditorPartOptions) {
				options = createOptions.groupViewOptions as IEditorGroupViewOptions | undefined;
				return new class extends mock<IEmbeddedEditorPart>() { }();
			}
		}();
		createChatWindowEditorArea(editorGroupsService, $('div'), new ServiceCollection());
		const main = (Reflect.get(DesktopMainEditorPart.prototype, 'getGroupViewOptions') as () => IEditorGroupViewOptions).call({ agentWorkbenchLayoutService: { isVisible: () => true } });
		const read = (value: IEditorGroupViewOptions | undefined) => ({ menuIds: value?.menuIds, showHeader: value?.showHeader, useModernUITabs: value?.useModernUITabs });
		assert.deepStrictEqual(read(options), read(main));
	});

	test('a chat window shows the chat background behind its chat only, in the chat\'s card, and every card but the Session Activity Bar\'s column looks as the main window\'s cards do', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(ISessionsChatBackgroundService, new class extends mock<ISessionsChatBackgroundService>() {
			override readonly onDidChangeBackground = new Emitter<void>().event;
			override getBackground() { return { kind: 'codicons' as const }; }
		}());
		instantiationService.stub(IAccessibilityService, new TestAccessibilityService());
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		const constraints = { minimumWidth: 0, maximumWidth: Number.POSITIVE_INFINITY, minimumHeight: 0, maximumHeight: Number.POSITIVE_INFINITY };
		const cells = new Map([SessionGridCell.Chat, SessionGridCell.SidePane, SessionGridCell.Terminals, SessionGridCell.Column].map(cell => [cell, disposables.add(new ChatWindowCellView(cell, constraints))] as const));
		for (const view of cells.values()) {
			view.setContent({ element: $('.cell-content'), layout: () => { } });
		}

		disposables.add(showChatBackgroundInChatWindow(instantiationService, cells));

		// The children of each card, in order: the background first, below the content, as in the Sessions part.
		const read = (view: ChatWindowCellView) => ({
			surface: view.card.classList.contains(AGENTS_CARD_SURFACE_CLASS),
			hasBackground: view.card.classList.contains('has-chat-background'),
			children: Array.from(view.card.children, child => child.className.split(' ')[0]),
			contentIn: view.card.querySelector('.cell-content')?.parentElement?.className,
		});
		assert.deepStrictEqual(Object.fromEntries(Array.from(cells, ([cell, view]) => [cell, read(view)])), {
			[SessionGridCell.Chat]: { surface: true, hasBackground: true, children: ['monaco-button', 'sessions-chat-background', 'content'], contentIn: 'content' },
			[SessionGridCell.SidePane]: { surface: true, hasBackground: false, children: ['content'], contentIn: 'content' },
			[SessionGridCell.Terminals]: { surface: true, hasBackground: false, children: ['content'], contentIn: 'content' },
			[SessionGridCell.Column]: { surface: false, hasBackground: false, children: ['content'], contentIn: 'content' },
		});
	});

	test('a chat window restored to show only its editor area, of which no editor came back, shows its chat and keeps the remembered layout', () => {
		const kind: IChatWindowKind = { id: 'test', title: 'Test', defaultLayout: SessionLayoutMode.SideBySide };
		const storage = disposables.add(new InMemoryStorageService());
		const part = (editorCounts: number[]) => ({ groups: editorCounts.map(count => new class extends mock<IEditorGroup>() { override readonly isEmpty = count === 0; }()) });
		const restore = (mode: SessionLayoutMode, editorCounts: number[]) => {
			const remembered: SessionLayoutMode[] = [];
			const state = new ChatWindowState(kind, true, new ChatWindowDefaults(kind, storage), {
				initial: { mode, splitLayout: SessionLayoutMode.SideBySide, inputOnly: false },
				set: layout => remembered.push(layout.mode),
			});
			const showedChat = showChatInsteadOfEmptyEditorArea(part(editorCounts), state);
			return { showedChat, layout: state.layout.get(), remembered, kindLayout: new ChatWindowDefaults(kind, storage).getLayout() };
		};
		assert.deepStrictEqual({
			noEditorCameBack: restore(SessionLayoutMode.EditorOnly, [0]),
			emptyGroups: restore(SessionLayoutMode.EditorOnly, [0, 0]),
			anEditorCameBack: restore(SessionLayoutMode.EditorOnly, [0, 1]),
			sideBySide: restore(SessionLayoutMode.SideBySide, [0]),
		}, {
			noEditorCameBack: { showedChat: true, layout: SessionLayoutMode.ChatOnly, remembered: [], kindLayout: undefined },
			emptyGroups: { showedChat: true, layout: SessionLayoutMode.ChatOnly, remembered: [], kindLayout: undefined },
			anEditorCameBack: { showedChat: false, layout: SessionLayoutMode.EditorOnly, remembered: [], kindLayout: undefined },
			sideBySide: { showedChat: false, layout: SessionLayoutMode.SideBySide, remembered: [], kindLayout: undefined },
		});
	});
});
