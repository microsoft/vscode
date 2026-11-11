/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append } from '../../../../../base/browser/dom.js';
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
	 * does in a window; the others reserve their margins as their parts do in code, under the same floating panel styles.
	 */
	function measureCards(floating: boolean) {
		const store = disposables.add(new DisposableStore());
		const workbench = append(mainWindow.document.body, $('.monaco-workbench'));
		store.add(toDisposable(() => workbench.remove()));
		workbench.classList.toggle('floating-panels', floating);
		workbench.style.cssText = 'position: absolute; top: 0; left: 0; width: 1000px; height: 400px; --vscode-panels-spacing: 16px; --vscode-spacing-size40: 4px; --vscode-spacing-sizeNone: 0px;';
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
		const content = $('.part.editor');
		store.add(chatPart.setContent(upcastPartial<IContentPart>({
			element: content,
			minimumWidth: 0,
			onDidChange: Event.None,
			setVisible: () => { },
			layout: (width: number, height: number) => {
				content.style.width = `${width}px`;
				content.style.height = `${height}px`;
			},
		})));
		chatPart.layout(300, 400, 0, 200);

		const cards = [sideBar, content, editor, auxiliaryBar].map(card => card.getBoundingClientRect());
		const result = {
			gaps: cards.slice(1).map((card, index) => card.left - cards[index].right),
			tops: cards.map(card => card.top),
			bottoms: cards.map(card => card.bottom),
		};
		store.dispose();
		return result;
	}

	test('with floating panels, the chat part keeps the same gaps as the other cards, and their top and bottom edges', () => {
		assert.deepStrictEqual(measureCards(true), {
			gaps: [16, 16, 16],
			tops: [0, 0, 0, 0],
			bottoms: [396, 396, 396, 396],
		});
	});

	test('docked, the chat part fills its cell, as the other parts do', () => {
		assert.deepStrictEqual(measureCards(false), {
			gaps: [0, 0, 0],
			tops: [0, 0, 0, 0],
			bottoms: [400, 400, 400, 400],
		});
	});
});
