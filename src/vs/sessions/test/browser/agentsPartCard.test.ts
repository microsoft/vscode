/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/workbench.css';
import '../../browser/parts/media/editorPart.css';
import '../../browser/parts/mobile/mobileChatShell.css';
import assert from 'assert';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { getAgentsPartCardContentSize } from '../../browser/parts/agentsPartCard.js';
import { CustomViewGridPart } from '../../browser/parts/customViewGridPart.js';
import { SessionsPart } from '../../browser/parts/sessionsPart.js';

suite('Sessions - Agents Part Card', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createCard(sidebarVisible: boolean, editorPaneVisible: boolean, phone: boolean = false) {
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '800px';
		container.style.setProperty('--vscode-agents-layout-floatingPanelGap', '4px');
		container.style.setProperty('--vscode-cornerRadius-large', '8px');
		container.classList.toggle('nosidebar', !sidebarVisible);
		container.classList.toggle('noeditorpane', !editorPaneVisible);
		container.classList.toggle('phone-layout', phone);

		const card = append(container, $('.agents-part-card'));
		card.style.transition = 'none';

		return { container, card };
	}

	for (const { sidebarVisible, editorPaneVisible, contentWidth } of [
		{ sidebarVisible: true, editorPaneVisible: true, contentWidth: 794 },
		{ sidebarVisible: true, editorPaneVisible: false, contentWidth: 798 },
		{ sidebarVisible: false, editorPaneVisible: true, contentWidth: 790 },
		{ sidebarVisible: false, editorPaneVisible: false, contentWidth: 794 },
	]) {
		test(`matches card margins with sidebar ${sidebarVisible ? 'visible' : 'hidden'} and editor pane ${editorPaneVisible ? 'visible' : 'hidden'}`, () => {
			const { container, card } = createCard(sidebarVisible, editorPaneVisible);
			const containerBounds = container.getBoundingClientRect();
			const cardBounds = card.getBoundingClientRect();

			assert.deepStrictEqual({
				leftGap: cardBounds.left - containerBounds.left,
				rightGap: containerBounds.right - cardBounds.right,
				renderedContentWidth: card.clientWidth,
				contentSize: getAgentsPartCardContentSize(800, 600, editorPaneVisible, sidebarVisible, false),
			}, {
				leftGap: sidebarVisible ? 0 : 4,
				rightGap: editorPaneVisible ? 4 : 0,
				renderedContentWidth: contentWidth,
				contentSize: { width: contentWidth, height: 598 },
			});
		});
	}

	test('keeps phone cards edge-to-edge when the sidebar is hidden', () => {
		const { container, card } = createCard(false, false, true);
		const containerBounds = container.getBoundingClientRect();
		const cardBounds = card.getBoundingClientRect();

		assert.deepStrictEqual({
			leftGap: cardBounds.left - containerBounds.left,
			rightGap: containerBounds.right - cardBounds.right,
			contentWidth: card.clientWidth,
			cornerRadius: mainWindow.getComputedStyle(card).borderRadius,
			contentSize: getAgentsPartCardContentSize(800, 600, false, false, true),
		}, {
			leftGap: 0,
			rightGap: 0,
			contentWidth: 800,
			cornerRadius: '0px',
			contentSize: { width: 800, height: 600 },
		});
	});

	(mainWindow.CSS.supports('-electron-corner-smoothing', 'system-ui') ? test : test.skip)('smooths desktop content cards without changing web, controls or modal editors', () => {
		const { container, card } = createCard(true, true);
		const grid = append(container, $('.monaco-grid-view'));
		const surfaces = {
			card,
			editor: append(grid, $('.part.editor')),
			auxiliaryBar: append(grid, $('.part.auxiliarybar')),
			panel: append(grid, $('.part.panel')),
			button: append(card, $('button')),
			modalEditor: append(grid, $('.part.editor.modal-editor-part')),
		};
		const readSmoothing = () => Object.fromEntries(Object.entries(surfaces).map(([name, element]) => [name, mainWindow.getComputedStyle(element).getPropertyValue('-electron-corner-smoothing')]));
		const desktop = readSmoothing();
		container.classList.add('web');
		const web = readSmoothing();
		container.classList.remove('web', 'agent-sessions-workbench');
		const workbench = readSmoothing();
		const unsmoothed = { card: 'none', editor: 'none', auxiliaryBar: 'none', panel: 'none', button: 'none', modalEditor: 'none' };

		assert.deepStrictEqual({ desktop, web, workbench }, {
			desktop: { card: 'system-ui', editor: 'system-ui', auxiliaryBar: 'system-ui', panel: 'system-ui', button: 'none', modalEditor: 'none' },
			web: unsmoothed,
			workbench: unsmoothed,
		});
	});

	for (const { classes, zoom, radius } of [
		{ classes: 'mac macos-tahoe', zoom: 1, radius: '12px' },
		{ classes: 'mac macos-tahoe', zoom: 2, radius: '4px' },
		{ classes: 'mac macos-tahoe', zoom: 0.5, radius: '28px' },
		{ classes: 'mac macos-tahoe', zoom: 5, radius: '0px' },
		{ classes: 'mac', zoom: 1, radius: '6px' },
		{ classes: 'mac macos-tahoe web', zoom: 1, radius: '8px' },
		{ classes: 'mac macos-tahoe fullscreen', zoom: 1, radius: '8px' },
		{ classes: 'windows', zoom: 1, radius: '8px' },
		{ classes: 'linux', zoom: 1, radius: '8px' },
	]) {
		test(`matches the inset card radius to the window for ${classes} at zoom ${zoom}`, () => {
			const { container, card } = createCard(true, true);
			container.classList.add(...classes.split(' '));
			container.style.setProperty('--zoom-factor', String(zoom));
			const grid = append(container, $('.monaco-grid-view'));
			const editor = append(grid, $('.part.editor'));
			const auxiliaryBar = append(grid, $('.part.auxiliarybar'));
			const panel = append(grid, $('.part.panel'));
			const editorSharedCorner = mainWindow.getComputedStyle(editor).borderBottomRightRadius;
			const auxiliaryBarSharedCorner = mainWindow.getComputedStyle(auxiliaryBar).borderBottomLeftRadius;
			const auxiliaryBarOuterCorner = mainWindow.getComputedStyle(auxiliaryBar).borderBottomRightRadius;
			container.classList.add('noauxiliarybar');
			const editorOuterCorner = mainWindow.getComputedStyle(editor).borderBottomRightRadius;
			container.classList.remove('noauxiliarybar');
			container.classList.add('dock-detail-panel');

			assert.deepStrictEqual({
				card: mainWindow.getComputedStyle(card).borderBottomRightRadius,
				editor: editorOuterCorner,
				dockedEditor: mainWindow.getComputedStyle(editor).borderBottomRightRadius,
				auxiliaryBar: auxiliaryBarOuterCorner,
				panel: mainWindow.getComputedStyle(panel).borderBottomRightRadius,
				editorSharedCorner,
				auxiliaryBarSharedCorner,
			}, {
				card: radius,
				editor: radius,
				dockedEditor: radius,
				auxiliaryBar: radius,
				panel: radius,
				editorSharedCorner: '0px',
				auxiliaryBarSharedCorner: '0px',
			});
		});
	}

	for (const partConstructor of [SessionsPart, CustomViewGridPart]) {
		test(`${partConstructor.name} uses full phone content dimensions after a desktop-to-phone transition`, () => {
			const { container } = createCard(false, false);
			const contentLayouts: { width: number; height: number }[] = [];
			const gridLayouts: { width: number; height: number }[] = [];
			const layoutGrid = (width: number, height: number) => {
				gridLayouts.push({ width, height });
			};
			const part = {
				layoutService: {
					mainContainer: container,
					isVisible: (partId: Parts) => partId !== Parts.SIDEBAR_PART,
				},
				agentWorkbenchLayoutService: {
					isEditorPaneVisible: () => false,
				},
				layoutContents: (width: number, height: number) => {
					contentLayouts.push({ width, height });
					return { contentSize: { width, height } };
				},
				_gridWidget: { layout: layoutGrid },
				_layoutNode: layoutGrid,
				layoutSessionGrid: layoutGrid,
			};
			const layout = Reflect.get(partConstructor.prototype, 'layout') as (this: typeof part, width: number, height: number, top: number, left: number) => void;

			layout.call(part, 800, 600, 36, 0);
			container.classList.add('phone-layout');
			layout.call(part, 390, 796, 48, 0);
			container.classList.remove('phone-layout');
			layout.call(part, 800, 600, 36, 0);

			const expectedLayouts = [
				{ width: 794, height: 598 },
				{ width: 390, height: 796 },
				{ width: 794, height: 598 },
			];
			assert.deepStrictEqual({ contentLayouts, gridLayouts }, {
				contentLayouts: expectedLayouts,
				gridLayouts: expectedLayouts,
			});
		});
	}
});
