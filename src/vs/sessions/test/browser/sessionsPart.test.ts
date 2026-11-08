/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventType } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { timeout } from '../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { SessionHarnessPickerVisibleContext, SessionIsolationPickerVisibleContext, SessionWorkspacePickerVisibleContext } from '../../../workbench/contrib/sessions/common/contextkeys.js';
import { noSessionPickerVisibility } from '../../../workbench/contrib/sessions/common/sessionPickerVisibility.js';
import { createSessionsPartTestHarness, createTestActiveSession, getSessionPickerVisibility, renderTestPanes } from './sessionViewTestUtils.js';
import { Direction } from '../../../base/browser/ui/grid/grid.js';
import { contrastBorder } from '../../../platform/theme/common/colorRegistry.js';
import { ColorScheme } from '../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../platform/theme/test/common/testThemeService.js';
import { workbenchInstantiationService } from '../../../workbench/test/browser/workbenchTestServices.js';
import { agentsCardBorder, agentsPanelBorder } from '../../../workbench/contrib/sessions/common/theme.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { mock } from '../../../base/test/common/mock.js';
import { IUriIdentityService } from '../../../platform/uriIdentity/common/uriIdentity.js';
import { VisibleSessions } from '../../../workbench/services/sessions/browser/visibleSessions.js';

suite('Sessions - Sessions Part', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const pickerKeys = new Set([SessionWorkspacePickerVisibleContext.key, SessionHarnessPickerVisibleContext.key, SessionIsolationPickerVisibleContext.key]);

	test('positional pane lookup distinguishes the empty composer from an absent pane', () => {
		const { content } = createSessionsPartTestHarness(store);
		const session = createTestActiveSession('session');
		renderTestPanes(content, [undefined, session], session);
		const describe = (index: number) => {
			const pane = content.getPaneAtPosition(index);
			return pane && (pane.session.get()?.sessionId ?? 'new session');
		};
		assert.deepStrictEqual([describe(0), describe(-1), describe(2)], ['new session', session.sessionId, undefined]);
	});

	test('focusing the view of a pane the grid clips reveals it and moves focus into it', () => {
		const { part, content, container } = createSessionsPartTestHarness(store);
		const sessions = ['first', 'second', 'third', 'fourth'].map(id => createTestActiveSession(id));
		const panes = renderTestPanes(content, sessions, sessions[0]);
		part.layout(500, 600, 0, 0);
		const grid = container.querySelector<HTMLElement>('.session-grid')!;
		const target = content.getSessionView(sessions[3].sessionId)!;
		const isFullyVisible = () => {
			const gridRect = grid.getBoundingClientRect();
			const viewRect = target.element.getBoundingClientRect();
			return viewRect.left >= gridRect.left - 1 && viewRect.right <= gridRect.right + 1;
		};
		const before = isFullyVisible();

		content.focusPane(panes[3].id);

		assert.deepStrictEqual({ before, after: isFullyVisible(), focused: target.element.contains(mainWindow.document.activeElement) }, { before: false, after: true, focused: true });
	});

	test('focusing the view of a detached pane reveals and focuses that pane, not the slot of its session', () => {
		const { part, content, container } = createSessionsPartTestHarness(store);
		const uriIdentityService = new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		};
		const grid = store.add(new VisibleSessions(session => session.mainChat.get(), () => [], () => [], () => { }, uriIdentityService));
		const session = createTestActiveSession('session', true, { chatCount: 2 });
		const others = ['first', 'second', 'third'].map(id => createTestActiveSession(id));
		grid.restoreGrid([session, ...others].map(candidate => ({ session: candidate, sticky: false })), 0);
		grid.moveChatToGrid(session, session.chats.get()[1], grid.getGridSlots()[3].id, Direction.Right);
		grid.setActive(grid.panes.get()[0]);
		const [slot, detached] = [grid.panes.get()[0], grid.panes.get().at(-1)!];
		content.updatePanes(grid.panes.get(), grid.activePane.get(), grid.getRenderedGridSlots());
		part.layout(500, 600, 0, 0);
		const gridElement = container.querySelector<HTMLElement>('.session-grid')!;
		const isFullyVisible = (element: HTMLElement) => {
			const gridRect = gridElement.getBoundingClientRect();
			const viewRect = element.getBoundingClientRect();
			return viewRect.left >= gridRect.left - 1 && viewRect.right <= gridRect.right + 1;
		};
		const target = content.getViewOfPane(detached)!;
		const before = isFullyVisible(target.element);

		content.focusPane(detached.id);

		assert.deepStrictEqual({
			before,
			after: isFullyVisible(target.element),
			focused: target.element.contains(mainWindow.document.activeElement),
			slotFocused: content.getViewOfPane(slot)!.element.contains(mainWindow.document.activeElement),
		}, { before: false, after: true, focused: true, slotFocused: false });
	});

	test('a replacement of a session by the identical object leaves its view bound, which shows the tabs and the chat the pane seeds again from the persisted state', () => {
		const { part, content: sessionsGrid } = createSessionsPartTestHarness(store);
		const session = createTestActiveSession('session', true, { chatCount: 3 });
		const [main, peer, child] = session.chats.get();
		// The persisted state of the session, which the pane seeds its tabs and chat from.
		let initialChat = main;
		let persistedClosed: string[] = [];
		const grid = store.add(new VisibleSessions(() => initialChat, () => persistedClosed, () => [], () => { }, new class extends mock<IUriIdentityService>() {
			override readonly extUri = extUriBiasedIgnorePathCase;
		}));
		grid.restoreGrid([{ session, sticky: false }], 0);
		const render = () => sessionsGrid.updatePanes(grid.panes.get(), grid.activePane.get(), grid.getRenderedGridSlots());
		render();
		part.layout(800, 600, 0, 0);
		const [pane] = grid.panes.get();
		const view = sessionsGrid.getViewOfPane(pane)!;
		const shown = () => ({
			tabs: Array.from(view.element.querySelectorAll<HTMLElement>('.chat-composite-bar-tab')).map(tab => tab.dataset.chatResource),
			activeTab: view.element.querySelector<HTMLElement>('.chat-composite-bar-tab.active')?.dataset.chatResource,
			chat: view.host.chat.get()?.resource.toString(),
		});
		const content = () => Reflect.get(view, '_contentObs').get();
		const before = { shown: shown(), content: content() };

		initialChat = child;
		persistedClosed = [peer.resource.toString()];
		grid.updateSession(session, session);
		render();

		assert.deepStrictEqual({
			before: before.shown,
			after: shown(),
			samePane: grid.panes.get()[0] === pane,
			sameView: sessionsGrid.getViewOfPane(pane) === view,
			rebound: content() !== before.content,
		}, {
			before: { tabs: [main, peer, child].map(chat => chat.resource.toString()), activeTab: main.resource.toString(), chat: main.resource.toString() },
			after: { tabs: [main, child].map(chat => chat.resource.toString()), activeTab: child.resource.toString(), chat: child.resource.toString() },
			samePane: true,
			sameView: true,
			rebound: false,
		});
	});

	test('session gaps omit separators while compact density preserves themed separators', () => {
		const colors = { [agentsPanelBorder]: '#ff0000', [agentsCardBorder]: '#00ff00', [contrastBorder]: '#00000000' };
		const themes = [
			new TestColorTheme(colors, ColorScheme.DARK),
			new TestColorTheme({ ...colors, [contrastBorder]: '#ffffff' }, ColorScheme.HIGH_CONTRAST_DARK),
			new TestColorTheme({ ...colors, [contrastBorder]: '#000000' }, ColorScheme.HIGH_CONTRAST_LIGHT),
			new TestColorTheme(colors, ColorScheme.LIGHT),
			new TestColorTheme({ ...colors, [contrastBorder]: '#0000ff' }, ColorScheme.DARK),
			new TestColorTheme({ ...colors, [agentsPanelBorder]: '#ff000080' }, ColorScheme.LIGHT),
			new TestColorTheme({ [agentsCardBorder]: '#00ff00' }, ColorScheme.DARK),
		];
		const themeService = new TestThemeService(themes[0]);
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IThemeService, themeService);
		let compact = false;
		const { part, content, container } = createSessionsPartTestHarness(store, false, { instantiationService, compactLayout: () => compact });
		const first = createTestActiveSession('first');
		const second = createTestActiveSession('second');
		renderTestPanes(content, [first, second], first);
		part.layout(1202, 802, 0, 0);
		const splitView = container.querySelector<HTMLElement>('.session-grid .monaco-split-view2');
		assert.ok(splitView);
		const getStyles = () => ({
			separator: splitView.classList.contains('separator-border'),
			separatorColor: splitView.style.getPropertyValue('--separator-border'),
			cardBorder: container.style.getPropertyValue('--part-border-color'),
		});
		const gapped = [getStyles()];
		for (const theme of themes.slice(1)) {
			themeService.setTheme(theme);
			gapped.push(getStyles());
		}
		themeService.setTheme(themes[0]);
		compact = true;
		part.layout(1202, 802, 0, 0);
		const compactStyles = getStyles();
		assert.deepStrictEqual({ gapped, compact: compactStyles }, {
			gapped: themes.map(() => ({ separator: false, separatorColor: '', cardBorder: '#00ff00' })),
			compact: { separator: true, separatorColor: 'rgba(255, 0, 0, 0.5)', cardBorder: '#00ff00' },
		});
	});

	test('compact session separators preserve contrast borders across theme changes', () => {
		const colors = { [agentsPanelBorder]: '#ff0000', [agentsCardBorder]: '#00ff00', [contrastBorder]: '#00000000' };
		const themes = [
			new TestColorTheme(colors, ColorScheme.DARK),
			new TestColorTheme({ ...colors, [contrastBorder]: '#ffffff' }, ColorScheme.HIGH_CONTRAST_DARK),
			new TestColorTheme({ ...colors, [contrastBorder]: '#000000' }, ColorScheme.HIGH_CONTRAST_LIGHT),
			new TestColorTheme(colors, ColorScheme.LIGHT),
			new TestColorTheme({ ...colors, [contrastBorder]: '#0000ff' }, ColorScheme.DARK),
			new TestColorTheme({ ...colors, [agentsPanelBorder]: '#ff000080' }, ColorScheme.LIGHT),
			new TestColorTheme({ [agentsCardBorder]: '#00ff00' }, ColorScheme.DARK),
		];
		const themeService = new TestThemeService(themes[0]);
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IThemeService, themeService);
		const { part, content, container } = createSessionsPartTestHarness(store, false, { instantiationService, compactLayout: () => true });
		const first = createTestActiveSession('first');
		const second = createTestActiveSession('second');
		renderTestPanes(content, [first, second], first);
		part.layout(1202, 802, 0, 0);
		const splitView = container.querySelector<HTMLElement>('.session-grid .monaco-split-view2');
		assert.ok(splitView);
		const getStyles = () => ({
			separator: splitView.classList.contains('separator-border'),
			separatorColor: splitView.style.getPropertyValue('--separator-border'),
			cardBorder: container.style.getPropertyValue('--part-border-color'),
		});
		const styles = [getStyles()];
		for (const theme of themes.slice(1)) {
			themeService.setTheme(theme);
			styles.push(getStyles());
		}
		assert.deepStrictEqual(styles, [
			{ separator: true, separatorColor: 'rgba(255, 0, 0, 0.5)', cardBorder: '#00ff00' },
			{ separator: true, separatorColor: '#ffffff', cardBorder: '#00ff00' },
			{ separator: true, separatorColor: '#000000', cardBorder: '#00ff00' },
			{ separator: true, separatorColor: 'rgba(255, 0, 0, 0.5)', cardBorder: '#00ff00' },
			{ separator: true, separatorColor: '#0000ff', cardBorder: '#00ff00' },
			{ separator: true, separatorColor: 'rgba(255, 0, 0, 0.25)', cardBorder: '#00ff00' },
			{ separator: false, separatorColor: '', cardBorder: '#00ff00' },
		]);
	});

	test('uses floating-panel gaps only in default desktop density', () => {
		let compact = false;
		const { part, content, container } = createSessionsPartTestHarness(store, false, { compactLayout: () => compact });
		const first = createTestActiveSession('first');
		const second = createTestActiveSession('second');
		renderTestPanes(content, [first, second], first);
		const snapshot = () => ({
			hasGaps: container.querySelector('.session-grid')?.classList.contains('session-grid-has-gaps'),
			insets: [...container.querySelectorAll<HTMLElement>('.session-grid-leaf')].map(leaf => [
				leaf.style.borderTopWidth,
				leaf.style.borderRightWidth,
				leaf.style.borderBottomWidth,
				leaf.style.borderLeftWidth,
			]),
		});

		part.layout(1202, 802, 0, 0);
		const defaultDensity = snapshot();
		compact = true;
		part.layout(1202, 802, 0, 0);
		const compactDensity = snapshot();

		assert.deepStrictEqual({ defaultDensity, compactDensity }, {
			defaultDensity: {
				hasGaps: true,
				insets: [
					['0px', '2px', '0px', '0px'],
					['0px', '0px', '0px', '2px'],
				],
			},
			compactDensity: {
				hasGaps: false,
				insets: [
					['0px', '0px', '0px', '0px'],
					['0px', '0px', '0px', '0px'],
				],
			},
		});
	});

	test('keeps custom backgrounds visible within gapped session panels', () => {
		const { part, content, container } = createSessionsPartTestHarness(store, false, { chatBackground: { kind: 'codicons' } });
		container.style.setProperty('--vscode-agents-background', '#123456');
		const first = createTestActiveSession('first');
		const second = createTestActiveSession('second');
		renderTestPanes(content, [first, second], first);

		part.layout(1202, 802, 0, 0);

		const leaves = [...container.querySelectorAll<HTMLElement>('.session-grid-leaf')];
		const sessionView = container.querySelector<HTMLElement>('.session-view');
		const background = container.querySelector<HTMLElement>('.sessions-chat-background');
		assert.ok(sessionView);
		assert.ok(background);
		assert.deepStrictEqual({
			hasBackground: container.classList.contains('has-chat-background'),
			backgroundHidden: background.hidden,
			leafBackgrounds: leaves.map(leaf => mainWindow.getComputedStyle(leaf).backgroundColor),
			gutters: leaves.map(leaf => {
				const style = mainWindow.getComputedStyle(leaf);
				return `${style.borderLeftWidth} ${style.borderRightWidth} ${style.borderStyle} ${style.borderColor}`;
			}),
			sessionBackground: mainWindow.getComputedStyle(sessionView).backgroundColor,
		}, {
			hasBackground: true,
			backgroundHidden: false,
			leafBackgrounds: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)'],
			gutters: ['0px 2px solid rgb(18, 52, 86)', '2px 0px solid rgb(18, 52, 86)'],
			sessionBackground: 'rgba(0, 0, 0, 0)',
		});
	});

	function assertActivation(eventFactory: () => Event): void {
		const { part, content } = createSessionsPartTestHarness(store);
		const first = createTestActiveSession('minimized');
		const second = createTestActiveSession('wider');
		renderTestPanes(content, [first, second, undefined], first);
		part.layout(1202, 802, 0, 0);
		content.resizeSession('minimized', Direction.Left, 1000);
		const minimizedView = content.getSessionView('minimized')!;
		const widerView = content.getSessionView('wider')!;
		const emptyView = content.getSessionView(undefined)!;
		const focused: string[] = [];
		store.add(content.onDidFocusPane(id => focused.push(id)));
		const minimum = minimizedView.element.style.width;
		minimizedView.element.dispatchEvent(eventFactory());
		const expanded = Number.parseFloat(minimizedView.element.style.width) > Number.parseFloat(minimum);
		widerView.element.dispatchEvent(eventFactory());
		emptyView.element.dispatchEvent(eventFactory());

		assert.deepStrictEqual({ expanded, focused }, {
			expanded: true,
			focused: ['minimized', 'wider', 'initial'],
		});
	}

	test('focus activation expands only a minimum-width session', () => {
		assertActivation(() => new FocusEvent(EventType.FOCUS_IN, { bubbles: true }));
	});

	test('pointer activation expands only a minimum-width session', () => {
		assertActivation(() => new MouseEvent(EventType.MOUSE_DOWN, { bubbles: true, button: 0 }));
	});

	test('reorders and removes created sessions without rebinding surviving chat views', () => {
		const { part, content, chatViews } = createSessionsPartTestHarness(store);
		const [a, b, c] = ['a', 'b', 'c'].map(id => createTestActiveSession(id));
		renderTestPanes(content, [a, b, c], b);
		part.layout(1202, 802, 0, 0);
		const views = [a, b, c].map(session => content.getSessionView(session.sessionId));
		const chats = chatViews.filter(view => view.kind === 'chat');
		chats[1].input.value = 'Keep this draft';
		renderTestPanes(content, [c, a, b], b);
		const reordered = [a, b, c].map((session, index) => content.getSessionView(session.sessionId) === views[index]);
		renderTestPanes(content, [c, b], b);
		renderTestPanes(content, [c, b], b, undefined, { type: 'arrange' });
		assert.deepStrictEqual({
			reordered,
			retained: [content.getSessionView('c') === views[2], content.getSessionView('b') === views[1]],
			kinds: chats.map(chat => chat.kind),
			resources: chats.map(chat => chat.chat?.resource.toString()),
			disposals: chats.map(chat => chat.disposeCount),
			created: chatViews.filter(view => view.kind === 'chat').length,
			draft: chats[1].input.value,
		}, {
			reordered: [true, true, true], retained: [true, true], kinds: ['chat', 'chat', 'chat'],
			resources: [a, b, c].map(session => session.mainChat.get().resource.toString()),
			disposals: [1, 0, 0], created: 3, draft: 'Keep this draft',
		});
	});

	test('all session geometry is current when a hosted chat lays out', () => {
		const { part, content, chatViews } = createSessionsPartTestHarness(store);
		const sessions = [createTestActiveSession('a'), createTestActiveSession('b')];
		renderTestPanes(content, sessions, sessions[0]);
		part.layout(1202, 802, 0, 0);
		const observations: string[][] = [];
		for (const chat of chatViews.filter(view => view.kind === 'chat')) {
			chat.onLayout = () => observations.push(sessions.map(session => content.getSessionView(session.sessionId)!.element.style.width));
		}
		part.layout(1402, 902, 0, 0);
		part.layout(1402, 902, 0, 0);
		assert.deepStrictEqual(observations, [['698px', '698px'], ['698px', '698px']]);
	});

	test('aggregates chats actually shown across splits, maximization, and part visibility', async () => {
		const { part, content } = createSessionsPartTestHarness(store);
		const splitSession = createTestActiveSession('split', true, { chatCount: 2 });
		const singleSession = createTestActiveSession('single');
		const [, singlePane] = renderTestPanes(content, [splitSession, singleSession], splitSession);
		part.layout(1202, 802, 0, 0);
		const initial = content.shownChatCount.get();

		content.getSessionView('split')!.splitActiveChat('right');
		await timeout(0);
		const split = content.shownChatCount.get();

		content.toggleMaximizePane(singlePane);
		const maximized = content.shownChatCount.get();
		content.toggleMaximizePane(singlePane);
		const restored = content.shownChatCount.get();

		part.setVisible(false);
		const partHidden = content.shownChatCount.get();
		part.setVisible(true);
		const partShown = content.shownChatCount.get();

		assert.deepStrictEqual({ initial, split, maximized, restored, partHidden, partShown }, {
			initial: 2,
			split: 3,
			maximized: 1,
			restored: 3,
			partHidden: 0,
			partShown: 3,
		});
	});

	for (const maximized of [false, true]) {
		test(`removing and disposing a ${maximized ? 'maximized' : 'phone'} projection detaches its outgoing views`, () => {
			const { part, content, container, chatViews } = createSessionsPartTestHarness(store);
			const [a, b] = ['a', 'b'].map(id => createTestActiveSession(id));
			const [, paneB] = renderTestPanes(content, [a, b], b);
			part.layout(1202, 802, 0, 0);
			if (maximized) {
				content.toggleMaximizePane(paneB);
			} else {
				container.classList.add('phone-layout');
				part.layout(390, 780, 0, 0);
			}
			const outgoing = content.getSessionView('b')!.element;
			const surviving = content.getSessionView('a')!.element;
			renderTestPanes(content, [a], a);
			const afterRemoval = {
				outgoingConnected: outgoing.isConnected,
				visibleSessions: container.querySelectorAll('.session-view').length,
				height: surviving.getBoundingClientRect().height,
				disposed: chatViews.filter(view => view.kind === 'chat').map(view => view.disposed),
			};
			part.dispose();
			assert.deepStrictEqual({ afterRemoval, connectedAfterDispose: [outgoing, surviving].map(element => element.isConnected) }, {
				afterRemoval: { outgoingConnected: false, visibleSessions: 1, height: maximized ? 800 : 780, disposed: [false, true] },
				connectedAfterDispose: [false, false],
			});
		});
	}

	for (const mobile of [false, true]) {
		test(`${mobile ? 'phone' : 'desktop'}-born part restores its desktop arrangement across viewport changes`, () => {
			const { part, content, container, chatViews } = createSessionsPartTestHarness(store, mobile);
			const a = createTestActiveSession('a');
			const b = createTestActiveSession('b');
			const slots = [{ id: 'a' }, { id: 'b', placement: { reference: 'a', direction: Direction.Down } }];
			renderTestPanes(content, [a, b], a, slots);
			container.classList.remove('phone-layout');
			part.layout(1202, 802, 0, 0);
			content.resizeSession('a', Direction.Down, 40);
			const desktop = content.getGridLayout();
			container.classList.add('phone-layout');
			part.layout(390, 780, 0, 0);
			const phone = content.getGridLayout();
			renderTestPanes(content, [a, b], b, slots);
			const phoneSize = content.getSessionView('b')!.element.style.width;
			container.classList.remove('phone-layout');
			part.layout(1202, 802, 0, 0);
			assert.deepStrictEqual({
				phone, restored: content.getGridLayout(), phoneSize, created: chatViews.filter(view => view.kind === 'chat').length, disposed: chatViews.filter(view => view.kind === 'chat').map(view => view.disposed),
			}, { phone: desktop, restored: desktop, phoneSize: '390px', created: 2, disposed: [false, false] });
		});
	}

	test('projects only the active view while retaining explicit, independent scoped picker values', () => {
		const { content, chatViews, contextKeyService } = createSessionsPartTestHarness(store);
		const first = createTestActiveSession('first', false);
		const second = createTestActiveSession('second', false);
		renderTestPanes(content, [first, second], first);
		const firstView = content.getSessionView(first.sessionId)!;
		const secondView = content.getSessionView(second.sessionId)!;
		const [firstChat, secondChat] = chatViews;
		const initial = [getSessionPickerVisibility(contextKeyService), getSessionPickerVisibility(contextKeyService, secondView.element)];

		secondChat.inputPickerVisibility.setVisible('harness', true);
		secondChat.inputPickerVisibility.setVisible('isolation', true);
		const afterInactiveRender = getSessionPickerVisibility(contextKeyService);
		firstChat.inputPickerVisibility.setVisible('workspace', true);
		const afterActiveRender = {
			global: getSessionPickerVisibility(contextKeyService),
			first: getSessionPickerVisibility(contextKeyService, firstView.element),
			second: getSessionPickerVisibility(contextKeyService, secondView.element),
		};

		const changes: ReturnType<typeof getSessionPickerVisibility>[] = [];
		store.add(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(pickerKeys)) {
				changes.push(getSessionPickerVisibility(contextKeyService));
			}
		}));
		renderTestPanes(content, [first, second], second);
		firstChat.inputPickerVisibility.setVisible('harness', true);
		const afterSwitch = getSessionPickerVisibility(contextKeyService);
		renderTestPanes(content, [first, second], first);

		assert.deepStrictEqual({
			initial, afterInactiveRender, afterActiveRender, afterSwitch,
			afterSwitchBack: getSessionPickerVisibility(contextKeyService),
			changes,
		}, {
			initial: [noSessionPickerVisibility, noSessionPickerVisibility],
			afterInactiveRender: noSessionPickerVisibility,
			afterActiveRender: {
				global: { ...noSessionPickerVisibility, workspace: true },
				first: { ...noSessionPickerVisibility, workspace: true },
				second: { ...noSessionPickerVisibility, harness: true, isolation: true },
			},
			afterSwitch: { ...noSessionPickerVisibility, harness: true, isolation: true },
			afterSwitchBack: { ...noSessionPickerVisibility, workspace: true, harness: true },
			changes: [
				{ ...noSessionPickerVisibility, harness: true, isolation: true },
				{ ...noSessionPickerVisibility, workspace: true, harness: true },
			],
		});
	});

	for (const picker of ['environment', 'branch', 'worktree', 'sync'] as const) {
		test(`projects ${picker} availability only from the active composer`, () => {
			const { content, chatViews, contextKeyService } = createSessionsPartTestHarness(store);
			const first = createTestActiveSession('first', false);
			const second = createTestActiveSession('second', false);
			renderTestPanes(content, [first, second], first);
			chatViews[1].inputPickerVisibility.setVisible(picker, true);
			const inactive = getSessionPickerVisibility(contextKeyService);
			const secondScope = getSessionPickerVisibility(contextKeyService, content.getSessionView(second.sessionId)!.element);
			renderTestPanes(content, [first, second], second);
			const active = getSessionPickerVisibility(contextKeyService);
			renderTestPanes(content, [first, second], first);
			assert.deepStrictEqual({ inactive, secondScope, active, switchedBack: getSessionPickerVisibility(contextKeyService) }, {
				inactive: noSessionPickerVisibility,
				secondScope: { ...noSessionPickerVisibility, [picker]: true },
				active: { ...noSessionPickerVisibility, [picker]: true },
				switchedBack: noSessionPickerVisibility,
			});
		});
	}

	test('inactive picker updates and disposal never reset the active view globally', () => {
		const { content, chatViews, contextKeyService } = createSessionsPartTestHarness(store);
		const first = createTestActiveSession('first', false);
		const second = createTestActiveSession('second', false);
		renderTestPanes(content, [first, second], first);
		const [firstChat, secondChat] = chatViews;
		firstChat.inputPickerVisibility.setVisible('workspace', true);
		firstChat.inputPickerVisibility.setVisible('harness', true);
		const changes: ReturnType<typeof getSessionPickerVisibility>[] = [];
		store.add(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(pickerKeys)) {
				changes.push(getSessionPickerVisibility(contextKeyService));
			}
		}));

		secondChat.inputPickerVisibility.setVisible('isolation', true);
		secondChat.inputPickerVisibility.setVisible('isolation', false);
		renderTestPanes(content, [first], first);

		assert.deepStrictEqual({
			disposed: secondChat.disposed,
			global: getSessionPickerVisibility(contextKeyService),
			pickerSnapshots: changes,
		}, {
			disposed: true,
			global: { ...noSessionPickerVisibility, workspace: true, harness: true },
			pickerSnapshots: [],
		});
	});

	for (const emptyFirst of [true, false]) {
		test(`the active empty composer owns visibility beside an existing session (empty ${emptyFirst ? 'first' : 'last'})`, () => {
			const { part, content, chatViews, contextKeyService } = createSessionsPartTestHarness(store);
			const existing = createTestActiveSession('existing');
			const visible = emptyFirst ? [undefined, existing] : [existing, undefined];
			renderTestPanes(content, visible, existing);
			const emptyView = content.getSessionView(undefined)!;
			const existingView = content.getSessionView(existing.sessionId)!;
			const composer = chatViews.find(view => view.kind === 'newSession')!;
			composer.inputPickerVisibility.setVisible('workspace', true);
			const beforeActivation = getSessionPickerVisibility(contextKeyService);

			renderTestPanes(content, visible, undefined);
			const active = {
				global: getSessionPickerVisibility(contextKeyService),
				empty: emptyView.element.classList.contains('is-active'),
				existing: existingView.element.classList.contains('is-active'),
				existingScope: getSessionPickerVisibility(contextKeyService, existingView.element),
			};
			part.setContentVisible(false);
			composer.inputPickerVisibility.setVisible('harness', true);
			composer.inputPickerVisibility.setVisible('isolation', true);
			const hidden = [getSessionPickerVisibility(contextKeyService), getSessionPickerVisibility(contextKeyService, emptyView.element)];
			part.setContentVisible(true);
			const shown = getSessionPickerVisibility(contextKeyService);
			emptyView.setVisible(false);
			const hiddenLeaf = getSessionPickerVisibility(contextKeyService);
			emptyView.setVisible(true);
			emptyView.dispose();

			assert.deepStrictEqual({
				beforeActivation, active, hidden, shown, hiddenLeaf,
				disposed: getSessionPickerVisibility(contextKeyService),
			}, {
				beforeActivation: noSessionPickerVisibility,
				active: {
					global: { ...noSessionPickerVisibility, workspace: true },
					empty: true,
					existing: false,
					existingScope: noSessionPickerVisibility,
				},
				hidden: [noSessionPickerVisibility, noSessionPickerVisibility],
				shown: { ...noSessionPickerVisibility, workspace: true, harness: true, isolation: true },
				hiddenLeaf: noSessionPickerVisibility,
				disposed: noSessionPickerVisibility,
			});
		});
	}

	test('resets picker scopes when a draft is sent or its active slot is rebound', () => {
		const { part, content, chatViews, contextKeyService } = createSessionsPartTestHarness(store);
		const draft = createTestActiveSession('draft', false);
		renderTestPanes(content, [draft], draft);
		const sessionView = content.getSessionView(draft.sessionId)!;
		chatViews[0].inputPickerVisibility.setVisible('workspace', true);
		chatViews[0].inputPickerVisibility.setVisible('harness', true);
		chatViews[0].inputPickerVisibility.setVisible('isolation', true);

		draft.isCreated.set(true, undefined);
		const sent = [getSessionPickerVisibility(contextKeyService), getSessionPickerVisibility(contextKeyService, sessionView.element)];
		renderTestPanes(content, [undefined], undefined);
		const rebound = getSessionPickerVisibility(contextKeyService);
		chatViews.at(-1)!.inputPickerVisibility.setVisible('workspace', true);
		const rendered = getSessionPickerVisibility(contextKeyService);
		part.dispose();

		assert.deepStrictEqual({
			sent, rebound, rendered,
			disposed: getSessionPickerVisibility(contextKeyService),
		}, {
			sent: [noSessionPickerVisibility, noSessionPickerVisibility],
			rebound: noSessionPickerVisibility,
			rendered: { ...noSessionPickerVisibility, workspace: true },
			disposed: noSessionPickerVisibility,
		});
	});

	test('combines content and grid visibility for mounted session views', () => {
		const { part, content, chatViews } = createSessionsPartTestHarness(store);
		const session = createTestActiveSession('visible');
		renderTestPanes(content, [session], session);
		const chat = chatViews.find(view => view.kind === 'chat')!;
		const partVisibilityEvents: boolean[] = [];
		store.add(part.onDidVisibilityChange(visible => partVisibilityEvents.push(visible)));
		const visibility: boolean[] = [];

		part.setVisible(false);
		visibility.push(chat.visible);
		part.setContentVisible(false);
		visibility.push(chat.visible);
		part.setContentVisible(true);
		visibility.push(chat.visible);
		part.setVisible(true);
		visibility.push(chat.visible);

		assert.deepStrictEqual({
			sessionView: visibility,
			part: partVisibilityEvents,
		}, {
			sessionView: [false, false, false, true],
			part: [false, true],
		});
	});
});
