/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextKeyService } from '../../../../../platform/contextkey/browser/contextKeyService.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../../workbench/common/editor.js';
import { IAuxiliaryWindowService } from '../../../../../workbench/services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { GroupDirection } from '../../../../../workbench/services/editor/common/editorGroupsService.js';
import { LayoutSettings, ModernUIDensity, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { createEditorParts, registerTestEditor, TestFileEditorInput, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionScope } from '../../../../services/sessions/browser/sessionScope.js';
import { alignChatWindowHeaderActions, alignChatWindowTitleRow, createChatWindowEditorArea, createChatWindowServices, relayoutWhenStylesHaveLoaded, reserveChatWindowControls } from '../../browser/chatWindowService.js';
import { isChatWindowTitleRowOverChat } from '../../browser/chatWindowGridHost.js';
import { TitlebarPart } from '../../../../browser/parts/titlebarPart.js';
import { SESSION_ACTIVITY_BAR_COLUMN_WIDTH } from '../../../../browser/parts/sessionActivityBar.js';
import '../../browser/media/chatWindow.css';
import '../../../../browser/parts/media/chatCompositeBar.css';
import { computeSessionGridLayout, SessionLayoutMode, SessionTerminalPosition } from '../../../../common/sessionGridLayout/sessionGridLayout.js';

suite('Chat window title row', () => {

	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const showTabs of ['multiple', 'single'] as const) {
		test(`the top row of the editor area leaves room at the top right for the window controls where they are there (Windows, Linux), its toolbar left of them, and none where they are not (macOS) (tabs: ${showTabs})`, async () => {
			const configurationService = new TestConfigurationService({ 'workbench.editor.showTabs': showTabs });
			const instantiationService = workbenchInstantiationService({ contextKeyService: () => disposables.add(new ContextKeyService(configurationService)) }, disposables);
			instantiationService.stub(IConfigurationService, configurationService);
			disposables.add(registerTestEditor('chatWindowTitleRowEditor', [new SyncDescriptor(TestFileEditorInput)], 'chatWindowTitleRowInput'));
			instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
			instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
			const parts = await createEditorParts(instantiationService, disposables);
			// The grid's host while the header is above the chat's column only.
			const root = append(mainWindow.document.body, $('.monaco-workbench'));
			disposables.add({ dispose: () => root.remove() });
			const host = append(root, $('.chat-window-host.chat-window-header-chat-column'));
			const container = append(host, $('div'));
			container.style.cssText = 'position: absolute; top: 0; left: 0; width: 720px; height: 400px;';
			const scope: ISessionScope = { _serviceBrand: undefined, session: constObservable(undefined) };
			const editorArea = createChatWindowEditorArea(parts, container, createChatWindowServices(scope));
			disposables.add({ dispose: () => editorArea.close() });
			editorArea.layout(720, 400, 0, 0);
			await editorArea.activeGroup.openEditor(disposables.add(new TestFileEditorInput(URI.file('/left'), 'chatWindowTitleRowInput')), { pinned: true });
			const element = editorArea.element as HTMLElement;
			const read = () => Array.from(element.querySelectorAll<HTMLElement>('.editor-group-container')).map(group => {
				const title = Array.from(group.children).find(child => child.classList.contains('title') && child.getBoundingClientRect().height > 0) as HTMLElement | undefined;
				// The row of the tabs, first in the title.
				const row = title?.firstElementChild as HTMLElement | undefined;
				return { reserves: group.classList.contains('chat-window-reserves-controls'), padding: row ? mainWindow.getComputedStyle(row).paddingRight : 'none', drag: title ? mainWindow.getComputedStyle(title).getPropertyValue('-webkit-app-region') : 'none' };
			});

			const windows = { rowHeight: reserveChatWindowControls(element, 138) > 0, groups: read() };
			// Split to the right: the group at the top right leaves the room.
			const right = editorArea.addGroup(editorArea.activeGroup, GroupDirection.RIGHT);
			await right.openEditor(disposables.add(new TestFileEditorInput(URI.file('/right'), 'chatWindowTitleRowInput')), { pinned: true });
			editorArea.layout(720, 400, 0, 0);
			reserveChatWindowControls(element, 138);
			const split = read();
			reserveChatWindowControls(element, 0);
			const macOS = read();

			assert.deepStrictEqual({ windows, split, macOS }, {
				windows: { rowHeight: true, groups: [{ reserves: true, padding: '138px', drag: 'drag' }] },
				split: [{ reserves: false, padding: '0px', drag: 'drag' }, { reserves: true, padding: '138px', drag: 'drag' }],
				macOS: [{ reserves: false, padding: '0px', drag: 'drag' }, { reserves: false, padding: '0px', drag: 'drag' }],
			});
		});
	}

	test('right above the chat (Side by Side, Chat Only), the title row is the header of the chat\'s card, which runs from the top of the window with its top edge and corners and its sides past the header, with no edge between the header and the chat, as in the main window; above the editor area\'s card (Stacked, Editor Only), the title row stays the title bar', () => {
		const overChat = Object.fromEntries([SessionLayoutMode.SideBySide, SessionLayoutMode.ChatOnly, SessionLayoutMode.Stacked, SessionLayoutMode.EditorOnly].map(mode =>
			[mode, isChatWindowTitleRowOverChat(computeSessionGridLayout({ mode, terminalPosition: SessionTerminalPosition.FullWidth, terminalsVisible: false, activityBar: true, inputOnly: false }))]));
		const header = 40;
		/** The title row and the chat's card below it as a chat window places them (default density, whose cards have a border). */
		const render = (titleOverChat: boolean) => {
			const root = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.modern-ui-tabs'));
			disposables.add({ dispose: () => root.remove() });
			root.style.cssText = 'position: fixed; top: 0; left: 0; width: 400px; height: 300px; --vscode-strokeThickness: 1px; --agents-part-corner-radius: 8px; --part-border-color: rgb(255, 0, 0);';
			const titlebar = append(root, $(`.part.titlebar.hosts-session-header${titleOverChat ? '.title-over-chat' : ''}`));
			// The title bar's own background, the window's, as the title bar sets it.
			titlebar.style.cssText = `position: relative; z-index: 1; height: ${header}px; background-color: rgb(1, 2, 3);`;
			const titleRow = append(titlebar, $('.titlebar-container'));
			const host = append(root, $(`.chat-window-host${titleOverChat ? '.chat-window-title-over-chat' : ''}`));
			host.style.cssText = 'top: 0; width: 400px; height: 300px;';
			const card = append(append(host, $('.chat-window-cell.chat-window-cell-chat')), $('.chat-window-cell-card'));
			// Where the grid host places it: below the title row, or from the top of the window with room for the header in it.
			card.style.cssText = titleOverChat ? `inset: 0; padding-top: ${header}px;` : `inset: ${header}px 0 0 0;`;
			const sessionView = append(card, $('.session-view'));
			sessionView.style.cssText = 'position: relative; height: 100px;';
			const frame = mainWindow.getComputedStyle(sessionView, '::after');
			const cardStyle = mainWindow.getComputedStyle(card);
			const titleBounds = titlebar.getBoundingClientRect();
			const cardBounds = card.getBoundingClientRect();
			const transparent = (color: string) => color === 'rgba(0, 0, 0, 0)' || color === 'transparent';
			return {
				titleBackground: transparent(mainWindow.getComputedStyle(titlebar).backgroundColor) && transparent(mainWindow.getComputedStyle(titleRow).backgroundColor) ? 'the card\'s' : 'its own',
				cardTop: cardBounds.top === titleBounds.top ? 'at the top of the title row' : cardBounds.top === titleBounds.bottom ? 'below the title row' : cardBounds.top,
				cardTopEdge: !transparent(cardStyle.borderTopColor) && cardStyle.borderTopWidth === '1px' ? 'edge' : 'none',
				cardCorners: [cardStyle.borderTopLeftRadius, cardStyle.borderTopRightRadius],
				cardSides: [cardStyle.borderLeftWidth, cardStyle.borderRightWidth],
				contentTop: Math.round(sessionView.getBoundingClientRect().top - cardBounds.top),
				frameTop: frame.borderTopWidth === '0px' ? 'none' : 'edge',
				frameSides: frame.borderLeftWidth,
			};
		};

		assert.deepStrictEqual({ overChat, overTheChat: render(true), aboveACard: render(false) }, {
			overChat: { [SessionLayoutMode.SideBySide]: true, [SessionLayoutMode.ChatOnly]: true, [SessionLayoutMode.Stacked]: false, [SessionLayoutMode.EditorOnly]: false },
			overTheChat: { titleBackground: 'the card\'s', cardTop: 'at the top of the title row', cardTopEdge: 'edge', cardCorners: ['8px', '8px'], cardSides: ['1px', '1px'], contentTop: header + 1, frameTop: 'none', frameSides: '1px' },
			aboveACard: { titleBackground: 'its own', cardTop: 'below the title row', cardTopEdge: 'edge', cardCorners: ['8px', '8px'], cardSides: ['1px', '1px'], contentTop: 1, frameTop: 'edge', frameSides: '1px' },
		});
	});

	test('the window lays out again once its styles have loaded, which its cards\' borders and the row of tabs its title row lines up with take from, unless it closed first', async () => {
		const relayouts: string[] = [];
		const open = (name: string) => {
			let loaded!: () => void;
			const whenStylesHaveLoaded = new Promise<void>(resolve => loaded = resolve);
			return { loaded, relayout: relayoutWhenStylesHaveLoaded({ whenStylesHaveLoaded }, () => relayouts.push(name)) };
		};
		const shown = open('shown');
		const closed = open('closed');
		await Promise.resolve();
		const before = [...relayouts];
		closed.relayout.dispose();
		shown.loaded();
		closed.loaded();
		await Promise.resolve();
		shown.relayout.dispose();
		assert.deepStrictEqual({ before, after: relayouts }, { before: [], after: ['shown'] });
	});

	test('the header\'s actions, last at the right of the title bar, are centered above the Session Activity Bar\'s column below, whatever their width', () => {
		const titlebar = $('div');
		const host = append(titlebar, $('div'));
		mainWindow.document.body.appendChild(titlebar);
		disposables.add({ dispose: () => titlebar.remove() });
		const insets: string[] = [];
		for (const width of [20, 22, 0]) {
			host.replaceChildren();
			if (width) {
				append(host, $('div')).style.cssText = `display: inline-block; width: ${width}px; height: 16px;`;
			}
			alignChatWindowHeaderActions(titlebar, host);
			insets.push(`${width}: ${titlebar.style.getPropertyValue('--session-header-actions-inset') || 'none'}`);
		}
		// The column is SESSION_ACTIVITY_BAR_COLUMN_WIDTH (34px) wide: an action that wide is centered with half the rest after it.
		assert.deepStrictEqual({ column: SESSION_ACTIVITY_BAR_COLUMN_WIDTH, insets }, { column: 34, insets: ['20: 7px', '22: 6px', '0: none'] });
	});

	test('the title row ends where the row of tabs of the editor area does, its card\'s border included, whatever the height of the tabs, the density and whether tabs show, and keeps that height while the editor area is hidden', async () => {
		const rows: string[] = [];
		for (const tabHeight of ['default', 'compact'] as const) {
			for (const density of [ModernUIDensity.Default, ModernUIDensity.Compact]) {
				for (const showTabs of ['multiple', 'single'] as const) {
					const store = disposables.add(new DisposableStore());
					const configurationService = new TestConfigurationService({ workbench: { editor: { showTabs, tabHeight } }, [LayoutSettings.MODERN_UI_DENSITY]: density, window: { titleBarStyle: 'custom' } });
					const instantiationService = workbenchInstantiationService({ contextKeyService: () => store.add(new ContextKeyService(configurationService)), configurationService: () => configurationService }, store);
					store.add(registerTestEditor('chatWindowTitleRowHeightEditor', [new SyncDescriptor(TestFileEditorInput)], 'chatWindowTitleRowHeightInput'));
					instantiationService.invokeFunction(accessor => Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).start(accessor));
					instantiationService.stub(IAuxiliaryWindowService, new class extends mock<IAuxiliaryWindowService>() { override getWindow() { return undefined; } }());
					const parts = await createEditorParts(instantiationService, store);
					const root = append(mainWindow.document.body, $(`.monaco-workbench.agent-sessions-workbench${density === ModernUIDensity.Compact ? '.modern-ui-compact' : ''}`));
					store.add({ dispose: () => root.remove() });
					// The cell of the side pane, a card with a border unless compact, as the window's grid shows it.
					const cell = append(append(root, $('.chat-window-host')), $('.chat-window-cell.chat-window-cell-sidePane'));
					cell.style.cssText = 'position: absolute; top: 0; left: 0; width: 720px; height: 400px;';
					const container = append(cell, $('.chat-window-cell-card'));
					const editorArea = createChatWindowEditorArea(parts, container, createChatWindowServices({ _serviceBrand: undefined, session: constObservable(undefined) }));
					store.add({ dispose: () => editorArea.close() });
					// Inside the card's border, as the grid lays it out.
					editorArea.layout(container.clientWidth, container.clientHeight, 0, 0);
					await editorArea.activeGroup.openEditor(store.add(new TestFileEditorInput(URI.file('/file'), 'chatWindowTitleRowHeightInput')), { pinned: true });
					const titlebar = store.add(instantiationService.createInstance(TitlebarPart, Parts.TITLEBAR_PART, mainWindow));
					titlebar.element = $('div');
					let changed = 0;
					store.add(titlebar.onDidChange(() => changed++));
					const element = editorArea.element as HTMLElement;
					// Where the row of tabs ends, from the top of the card.
					const tabsRow = Math.round((element.querySelector('.editor-group-container > .title')!.firstElementChild as HTMLElement).getBoundingClientRect().bottom - container.getBoundingClientRect().top);
					const shown = alignChatWindowTitleRow(titlebar, element, 0, 0);
					// Hidden, as while the window shows only its chat: the row keeps the height it last had.
					container.style.display = 'none';
					const hidden = alignChatWindowTitleRow(titlebar, element, 0, shown);
					const matches = shown === tabsRow && titlebar.minimumHeight === tabsRow && titlebar.maximumHeight === tabsRow && hidden === tabsRow && changed === 1;
					rows.push(`${tabHeight}/${density}/${showTabs}: ${matches ? `title row ends with the tabs row at ${tabsRow}px` : `title row ${titlebar.minimumHeight}, tabs row ${tabsRow} (shown ${shown}, hidden ${hidden}, changes ${changed})`}`);
					store.dispose();
				}
			}
		}
		assert.deepStrictEqual(rows, [
			'default/default/multiple: title row ends with the tabs row at 33px',
			'default/default/single: title row ends with the tabs row at 33px',
			'default/compact/multiple: title row ends with the tabs row at 32px',
			'default/compact/single: title row ends with the tabs row at 32px',
			'compact/default/multiple: title row ends with the tabs row at 29px',
			'compact/default/single: title row ends with the tabs row at 29px',
			'compact/compact/multiple: title row ends with the tabs row at 28px',
			'compact/compact/single: title row ends with the tabs row at 28px',
		]);
	});
});
