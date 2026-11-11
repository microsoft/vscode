/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
import { Direction, Grid } from '../../../../../base/browser/ui/grid/grid.js';
import { IView } from '../../../../../base/browser/ui/grid/gridview.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ChatHostPart } from '../../../../browser/parts/chat/chatHostPart.js';
import { IContentPart } from '../../../../services/editor/common/editorGroupsService.js';
import { IWorkbenchLayoutService, PanelAlignment, Parts, Position } from '../../../../services/layout/browser/layoutService.js';
import { TestStorageService } from '../../../common/workbenchTestServices.js';
import '../../../../browser/media/floatingPanels.css';
import '../../../../browser/parts/chat/media/chatHostPart.css';
import '../../../../contrib/modernUI/browser/media/editorBorder.css';

suite('ChatHostPart', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('draws no frame of its own, so that its chats look as in a chat window', () => {
		const frameOf = (workbenchClasses: string[]) => {
			const workbench = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			workbench.classList.add('monaco-workbench', ...workbenchClasses);
			const part = workbench.appendChild(mainWindow.document.createElement('div'));
			part.classList.add('part', 'chat');
			const style = mainWindow.getComputedStyle(part);
			const frame = [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
			workbench.remove();
			return frame;
		};

		assert.deepStrictEqual({ docked: frameOf([]), floating: frameOf(['floating-panels']) }, {
			docked: ['0px', '0px', '0px', '0px'],
			floating: ['0px', '0px', '0px', '0px'],
		});
	});

	/**
	 * Lays out, from left to right, the primary side bar, the chat part, the editor and the secondary side bar, each in a cell
	 * of the workbench grid, and measures the cards they show: the chat part is the real part, showing an editor part, as it
	 * does in a window; the others reserve their margins and edges as their parts do in code, under the same styles.
	 */
	function measureCards(floating: boolean, modernUI = false) {
		const store = disposables.add(new DisposableStore());
		const workbench = append(mainWindow.document.body, $('.monaco-workbench'));
		store.add(toDisposable(() => workbench.remove()));
		workbench.classList.toggle('floating-panels', floating);
		workbench.classList.toggle('modern-ui', modernUI);
		workbench.style.cssText = 'position: absolute; top: 0; left: 0; width: 1000px; height: 400px; --vscode-panels-spacing: 16px; --vscode-spacing-size40: 4px; --vscode-spacing-sizeNone: 0px; --vscode-strokeThickness: 1px; --vscode-foreground: rgb(255, 255, 255);';
		const grid = append(workbench, $('.monaco-grid-view'));
		grid.style.cssText = 'display: flex; width: 100%; height: 100%;';
		const cell = (width: number) => {
			const element = append(grid, $('.split-view-view'));
			element.style.cssText = `position: relative; flex: none; width: ${width}px; height: 100%;`;
			return element;
		};
		const reservingCard = (parent: HTMLElement, classes: string) => {
			const card = append(parent, $(classes));
			card.style.boxSizing = 'border-box';
			card.style.width = 'calc(100% - var(--modern-ui-floating-card-margin, 0px) - var(--modern-ui-floating-card-inner-margin, 0px))';
			card.style.height = 'calc(100% - var(--modern-ui-floating-card-inner-margin, 0px) - var(--modern-ui-floating-card-statusbar-margin, 0px))';
			return card;
		};

		const sideBar = reservingCard(cell(200), '.part.sidebar');
		const chatCell = cell(300);
		const editor = reservingCard(cell(300), '.part.editor');
		const auxiliaryBar = reservingCard(cell(200), '.part.auxiliarybar');

		const visible = new Set<Parts>([Parts.TITLEBAR_PART, Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.CHAT_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]);
		const layoutService = upcastPartial<IWorkbenchLayoutService>({
			registerPart: () => toDisposable(() => { }),
			mainContainer: workbench,
			isFloatingPanelsEnabled: () => floating,
			isModernUICompact: () => false,
			getPanelSpacing: () => 16,
			getSideBarPosition: () => Position.LEFT,
			getPanelPosition: () => Position.BOTTOM,
			getPanelAlignment: (): PanelAlignment => 'center',
			isVisible: (part: Parts) => visible.has(part),
		});
		const chatPart = store.add(new ChatHostPart(new TestThemeService(), store.add(new TestStorageService()), layoutService));
		const chatElement = append(chatCell, $('.part.chat'));
		chatPart.create(chatElement);
		// As an editor part, it sizes what it shows, and its box takes that and its own edge
		const content = $('.part.editor');
		const contentArea = append(content, $('.content'));
		store.add(chatPart.setContent(upcastPartial<IContentPart>({
			element: content,
			minimumWidth: 0,
			onDidChange: Event.None,
			setVisible: () => { },
			layout: (width: number, height: number) => {
				contentArea.style.width = `${width}px`;
				contentArea.style.height = `${height}px`;
			},
		})));
		chatPart.layout(300, 400, 0, 200);

		const cards = [sideBar, content, editor, auxiliaryBar].map(card => card.getBoundingClientRect());
		const edgeOf = (element: HTMLElement) => {
			const style = mainWindow.getComputedStyle(element);
			return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth, style.borderTopStyle, style.borderTopColor, style.borderTopLeftRadius].join(' ');
		};
		const result = {
			gaps: cards.slice(1).map((card, index) => card.left - cards[index].right),
			tops: cards.map(card => card.top),
			bottoms: cards.map(card => card.bottom),
			edges: { part: edgeOf(chatElement), chat: edgeOf(content), editor: edgeOf(editor) },
		};
		store.dispose();
		return result;
	}

	test('with floating panels, the chat part keeps the same gaps as the other cards, and their top and bottom edges', () => {
		const { gaps, tops, bottoms } = measureCards(true);
		assert.deepStrictEqual({ gaps, tops, bottoms }, {
			gaps: [16, 16, 16],
			tops: [0, 0, 0, 0],
			bottoms: [396, 396, 396, 396],
		});
	});

	test('docked, the chat part fills its cell, as the other parts do', () => {
		const { gaps, tops, bottoms } = measureCards(false);
		assert.deepStrictEqual({ gaps, tops, bottoms }, {
			gaps: [0, 0, 0],
			tops: [0, 0, 0, 0],
			bottoms: [400, 400, 400, 400],
		});
	});

	test('reads the edge of what it shows once, and again only as the window\'s classes change', async () => {
		const store = disposables.add(new DisposableStore());
		const workbench = append(mainWindow.document.body, $('.monaco-workbench.modern-ui'));
		store.add(toDisposable(() => workbench.remove()));
		workbench.style.cssText = 'position: absolute; width: 400px; height: 400px; --vscode-strokeThickness: 1px; --vscode-foreground: rgb(255, 255, 255);';
		const grid = append(workbench, $('.monaco-grid-view'));
		const layoutService = upcastPartial<IWorkbenchLayoutService>({
			registerPart: () => toDisposable(() => { }),
			mainContainer: workbench,
			isFloatingPanelsEnabled: () => false,
		});
		const chatPart = store.add(new ChatHostPart(new TestThemeService(), store.add(new TestStorageService()), layoutService));
		chatPart.create(append(grid, $('.part.chat')));
		const content = $('.part.editor');
		const widths: number[] = [];
		store.add(chatPart.setContent(upcastPartial<IContentPart>({
			element: content,
			minimumWidth: 0,
			onDidChange: Event.None,
			setVisible: () => { },
			layout: (width: number) => widths.push(width),
		})));

		chatPart.layout(300, 400, 0, 0);
		content.style.borderLeftWidth = '5px';
		chatPart.layout(300, 400, 0, 0);
		workbench.classList.add('modern-ui-compact');
		await Promise.resolve();
		chatPart.layout(300, 400, 0, 0);

		// The first layout as the content is set, then those of the test
		assert.deepStrictEqual(widths.slice(-3), [298, 298, 294]);
		store.dispose();
	});

	/**
	 * Lays out the primary side bar, the chat part when `withChat`, the editor and the secondary side bar in a grid of the
	 * workbench, under the floating panel styles, and measures how far each sash between them is from the middle of the
	 * gap between their cards.
	 */
	function measureSashOffsets(withChat: boolean): number[] {
		const store = disposables.add(new DisposableStore());
		const workbench = append(mainWindow.document.body, $('.monaco-workbench.floating-panels'));
		store.add(toDisposable(() => workbench.remove()));
		workbench.style.cssText = 'position: absolute; top: 0; left: 0; width: 1000px; height: 400px; --vscode-panels-spacing: 16px; --vscode-spacing-size40: 4px; --vscode-spacing-sizeNone: 0px; --vscode-sash-size: 4px; --vscode-sash-hover-size: 4px; --vscode-strokeThickness: 1px; --vscode-foreground: rgb(255, 255, 255);';
		const cardView = (classes: string): IView => {
			const element = $(classes);
			element.style.boxSizing = 'border-box';
			element.style.width = 'calc(100% - var(--modern-ui-floating-card-margin) - var(--modern-ui-floating-card-inner-margin))';
			element.style.height = 'calc(100% - var(--modern-ui-floating-card-inner-margin) - var(--modern-ui-floating-card-statusbar-margin))';
			return { element, minimumWidth: 0, maximumWidth: Number.POSITIVE_INFINITY, minimumHeight: 0, maximumHeight: Number.POSITIVE_INFINITY, onDidChange: Event.None, layout: () => { } };
		};
		const sideBar = cardView('.part.sidebar');
		const editor = cardView('.part.editor');
		const auxiliaryBar = cardView('.part.auxiliarybar');
		const grid = store.add(new Grid<IView>(sideBar));
		append(workbench, grid.element);
		grid.layout(1000, 400);
		const cards = [sideBar.element];
		let reference: IView = sideBar;
		if (withChat) {
			const visible = new Set<Parts>([Parts.TITLEBAR_PART, Parts.ACTIVITYBAR_PART, Parts.SIDEBAR_PART, Parts.CHAT_PART, Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART]);
			const layoutService = upcastPartial<IWorkbenchLayoutService>({
				registerPart: () => toDisposable(() => { }),
				mainContainer: workbench,
				isFloatingPanelsEnabled: () => true,
				isModernUICompact: () => false,
				getPanelSpacing: () => 16,
				getSideBarPosition: () => Position.LEFT,
				getPanelPosition: () => Position.BOTTOM,
				getPanelAlignment: (): PanelAlignment => 'center',
				isVisible: (part: Parts) => visible.has(part),
			});
			const chatPart = store.add(new ChatHostPart(new TestThemeService(), store.add(new TestStorageService()), layoutService));
			chatPart.create($('.part.chat'));
			const content = $('.part.editor');
			append(content, $('.content'));
			store.add(chatPart.setContent(upcastPartial<IContentPart>({ element: content, minimumWidth: 0, onDidChange: Event.None, setVisible: () => { }, layout: () => { } })));
			grid.addView(chatPart, 300, sideBar, Direction.Right);
			cards.push(content);
			reference = chatPart;
		}
		grid.addView(editor, withChat ? 300 : 600, reference, Direction.Right);
		grid.addView(auxiliaryBar, 200, editor, Direction.Right);
		cards.push(editor.element, auxiliaryBar.element);

		const rects = cards.map(card => card.getBoundingClientRect());
		const sashes = Array.from(grid.element.querySelectorAll<HTMLElement>('.monaco-sash.vertical')).map(sash => sash.getBoundingClientRect()).sort((a, b) => a.left - b.left);
		const offsets = sashes.map((sash, index) => Math.round(((sash.left + sash.right) / 2) - ((rects[index].right + rects[index + 1].left) / 2)));
		store.dispose();
		return offsets;
	}

	test('with floating panels, the sashes beside the chat part sit in the middle of their gaps, as without it', () => {
		assert.deepStrictEqual({ withoutChat: measureSashOffsets(false), withChat: measureSashOffsets(true) }, { withoutChat: [0, 0], withChat: [0, 0, 0] });
	});

	test('with floating panels and Modern UI, the chat card has one edge, the editor card\'s, all of it inside the part', () => {
		const { gaps, tops, bottoms, edges } = measureCards(true, true);
		assert.deepStrictEqual({ gaps, tops, bottoms, partDrawsNoEdge: edges.part.startsWith('0px 0px 0px 0px'), chatEdgeIsEditorEdge: edges.chat === edges.editor, chatEdgeIsDrawn: edges.chat.startsWith('1px 1px 1px 1px solid') }, {
			gaps: [16, 16, 16],
			tops: [0, 0, 0, 0],
			bottoms: [396, 396, 396, 396],
			partDrawsNoEdge: true,
			chatEdgeIsEditorEdge: true,
			chatEdgeIsDrawn: true,
		});
	});
});
