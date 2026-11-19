/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Color } from '../../../../../base/common/color.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICustomViewDescriptor, ICustomViewService } from '../../../../../workbench/contrib/sessions/browser/customView.js';
import { IPinnedCanvas, IPinnedCanvasService, PINNED_CANVAS_PAGE_ID, PinnedCanvasState } from '../../../../../workbench/contrib/sessions/browser/pinnedCanvases.js';
import { ISessionGroup, ISessionGroupsService } from '../../../../../workbench/contrib/sessions/browser/sessionGroupsService.js';
import { SessionsGrouping, SessionsList, SessionsSorting } from '../../../../../workbench/contrib/sessions/browser/views/sessionsList.js';
import { createListHarness, createTestSession } from '../browser/sessionsListTestUtils.js';

/** Focus styles only match while the document has focus, so give the test's web contents real focus. */
async function setWebContentsFocus(focused: boolean): Promise<void> {
	const changed = mainWindow.document.hasFocus() === focused
		? undefined
		: new Promise<void>(resolve => mainWindow.addEventListener(focused ? dom.EventType.FOCUS : dom.EventType.BLUR, () => resolve(), { once: true }));
	await ipcRenderer.invoke('vscode:test-set-web-contents-focus', focused);
	await changed;
}

suite('SessionsList - focused row styles', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => setWebContentsFocus(true));

	for (const { compact, customGroup } of [false, true].flatMap(compact => [false, true].map(customGroup => ({ compact, customGroup })))) {
		test(`group label contrast follows rendered focus and selection surfaces (${compact ? 'compact' : 'default'}, ${customGroup ? 'custom group' : 'workspace'})`, () => {
			const session = createTestSession('Session').session;
			const group: ISessionGroup = { id: 'group', name: 'Custom Group', createdAt: 1 };
			const harness = createListHarness(disposables, [session], customGroup ? {
				groups: [group],
				memberships: new Map([[session.sessionId, group.id]]),
			} : {});
			const themeService = new TestThemeService();
			harness.instantiationService.stub(IThemeService, themeService);
			const container = harness.createContainer();
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, container, {
				grouping: () => SessionsGrouping.Workspace,
				sorting: () => SessionsSorting.Created,
				compact: () => compact,
				onSessionOpen: () => { },
			}));
			list.layout(700, 400);
			const groupsService = harness.instantiationService.get(ISessionGroupsService);
			if (customGroup) {
				groupsService.setGroupColor(group.id, 'terminal.ansiBlue');
			} else {
				groupsService.setSectionColor('workspace:Workspace', 'terminal.ansiBlue');
			}
			const label = [...container.querySelectorAll<HTMLElement>('.session-section-label')]
				.find(label => label.textContent === (customGroup ? group.name : 'Workspace'))!;
			const row = label.closest<HTMLElement>('.monaco-list-row')!;
			const listElement = row.closest<HTMLElement>('.monaco-list')!;
			const results = [];
			const expected = [];
			for (const background of ['#ffffff', '#181818']) {
				const colors: Record<string, string> = {
					'agents.background': background,
					'terminal.ansiBlue': '#0060c0',
					'list.hoverBackground': '#88888822',
					'list.focusBackground': '#e5e510',
					'list.activeSelectionBackground': '#0060c0',
					'list.inactiveFocusBackground': '#ffffff80',
					'list.inactiveSelectionBackground': '#101010cc',
				};
				themeService.setTheme(new TestColorTheme(colors));
				for (const [id, value] of Object.entries(colors)) {
					container.style.setProperty(`--vscode-${id.replaceAll('.', '-')}`, value);
				}
				for (const active of [false, true]) {
					if (active) {
						listElement.focus();
					} else {
						listElement.blur();
					}
					for (const classes of [[], ['hovered'], ['focused'], ['selected'], ['focused', 'hovered'], ['selected', 'hovered'], ['focused', 'selected'], ['focused', 'selected', 'hovered']]) {
						row.classList.remove('focused', 'selected', 'hovered');
						row.classList.add(...classes);
						const stateBackground = classes.includes('selected')
							? active ? 'list.activeSelectionBackground' : 'list.inactiveSelectionBackground'
							: classes.includes('focused')
								? active ? 'list.focusBackground' : 'list.inactiveFocusBackground'
								: classes.includes('hovered') ? 'list.hoverBackground' : 'agents.background';
						const base = Color.fromHex(background);
						const surface = Color.Format.CSS.parse(mainWindow.getComputedStyle(row).backgroundColor)!.flatten(base);
						const foreground = Color.Format.CSS.parse(mainWindow.getComputedStyle(label).color)!;
						results.push({
							active: listElement.matches(':focus'),
							surface: surface.toString(),
							readable: surface.getContrastRatio(foreground) >= 4.5,
						});
						expected.push({
							active,
							surface: Color.fromHex(colors[stateBackground]).flatten(base).toString(),
							readable: true,
						});
					}
				}
			}
			assert.deepStrictEqual(results, expected);
		});
	}

	test('a press does not ring the pinned canvas row the page shows, while keyboard focus does, in both sidebar layouts', async () => {
		const plan = upcastPartial<IPinnedCanvas>({
			id: 'plan',
			title: constObservable('Agent Plan'),
			chatTitle: constObservable('Fix login bug'),
			state: constObservable(PinnedCanvasState.Live),
			canvas: constObservable(undefined),
		});
		const results = [];
		for (const separateNavigation of [true, false]) {
			const activeCustomView = observableValue<ICustomViewDescriptor | undefined>(disposables, undefined);
			const harness = createListHarness(disposables, [], instantiationService => {
				ChatContextKeys.enabled.bindTo(instantiationService.get(IContextKeyService)).set(true);
				instantiationService.stub(ICustomViewService, new class extends mock<ICustomViewService>() {
					override readonly activeCustomView = activeCustomView;
				});
			});
			const container = harness.createContainer();
			// The list draws its focus ring with this theme color.
			container.style.setProperty('--vscode-list-focusOutline', 'rgb(0, 120, 212)');
			const navigationContainer = dom.$('.agent-sessions-navigation-container');
			const listContainer = dom.$('div');
			container.append(navigationContainer, listContainer);
			const list = harness.store.add(harness.instantiationService.createInstance(SessionsList, listContainer, {
				grouping: () => SessionsGrouping.Date,
				sorting: () => SessionsSorting.Created,
				showNavigationShortcuts: () => separateNavigation,
				navigationContainer,
				pinnedCanvases: upcastPartial<IPinnedCanvasService>({
					entries: constObservable([plan]),
					selected: constObservable(plan),
					show: async () => { },
				}),
				onSessionOpen: () => { },
			}));
			list.layout(300, 400);
			const pressTarget = separateNavigation ? navigationContainer : listContainer.querySelector<HTMLElement>('.sessions-list-control');
			const row = (separateNavigation ? navigationContainer : listContainer).querySelector('.session-section-pinned-canvas')?.closest<HTMLElement>('.monaco-list-row');
			const listElement = row?.closest<HTMLElement>('.monaco-list');
			assert.ok(pressTarget && row && listElement);
			// The user chose the pin, so its list focuses its row, and the page shows it.
			row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
			row.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
			await Promise.resolve();
			activeCustomView.set(upcastPartial<ICustomViewDescriptor>({ id: PINNED_CANVAS_PAGE_ID }), undefined);
			const ring = () => mainWindow.getComputedStyle(row).outlineStyle;
			// Pressing another row focuses the list before its focused row moves.
			pressTarget.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
			listElement.focus();
			const whilePressed = ring();
			mainWindow.document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			const withKeyboardFocus = ring();
			listElement.blur();
			results.push({ separateNavigation, focused: row.classList.contains('focused'), whilePressed, withKeyboardFocus });
		}

		assert.deepStrictEqual(results, [true, false].map(separateNavigation => ({
			separateNavigation,
			focused: true,
			whilePressed: 'none',
			withKeyboardFocus: 'solid',
		})));
	});
});
