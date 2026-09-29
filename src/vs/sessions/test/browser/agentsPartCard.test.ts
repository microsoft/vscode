/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/workbench.css';
import '../../browser/parts/media/editorPart.css';
import '../../browser/parts/mobile/mobileChatShell.css';
import assert from 'assert';
import sinon from 'sinon';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { MainEditorPart as MainEditorPartBase } from '../../../workbench/browser/parts/editor/editorPart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { getAgentsPartCardContentSize } from '../../browser/parts/agentsPartCard.js';
import { CustomViewGridPart } from '../../browser/parts/customViewGridPart.js';
import { MainEditorPart } from '../../browser/parts/editorPart.js';
import { SessionsPart } from '../../browser/parts/sessionsPart.js';

suite('Sessions - Agents Part Card', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createCard(sidebarVisible: boolean, editorPaneVisible: boolean, phone: boolean = false) {
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '800px';
		container.style.setProperty('--vscode-agents-layout-floatingPanelGap', '4px');
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
			contentSize: getAgentsPartCardContentSize(800, 600, false, false, true),
		}, {
			leftGap: 0,
			rightGap: 0,
			contentWidth: 800,
			contentSize: { width: 800, height: 600 },
		});
	});

	for (const singlePane of [false, true]) {
		test(`keeps the expanded ${singlePane ? 'single-pane' : 'classic'} editor gutter and content size in sync`, () => {
			const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.noauxiliarybar'));
			store.add(toDisposable(() => workbench.remove()));
			workbench.classList.toggle('dock-detail-panel', singlePane);
			workbench.style.width = '800px';
			workbench.style.setProperty('--vscode-agents-layout-floatingPanelGap', '4px');
			workbench.style.setProperty('--vscode-strokeThickness', '1px');
			const grid = append(workbench, $('.monaco-grid-view'));
			grid.style.width = '796px';
			const editor = append(grid, $('.part.editor'));
			const content = append(editor, $('.content'));
			const baseLayout = sinon.stub(MainEditorPartBase.prototype, 'layout').callsFake((width, height) => {
				content.style.width = `${width}px`;
				content.style.height = `${height}px`;
			});
			const states = [
				{ name: 'split', sidebar: true, sessions: true, phone: false, leftGap: 0, contentWidth: 794 },
				{ name: 'sidebar hidden', sidebar: false, sessions: true, phone: false, leftGap: 0, contentWidth: 794 },
				{ name: 'expanded', sidebar: false, sessions: false, phone: false, leftGap: 4, contentWidth: 790 },
				{ name: 'restored', sidebar: false, sessions: true, phone: false, leftGap: 0, contentWidth: 794 },
				{ name: 'phone', sidebar: false, sessions: false, phone: true, leftGap: 0, contentWidth: 794 },
				{ name: 'desktop restored', sidebar: false, sessions: false, phone: false, leftGap: 4, contentWidth: 790 },
				{ name: 'sidebar restored', sidebar: true, sessions: false, phone: false, leftGap: 0, contentWidth: 794 },
			];
			const actual = states.map(state => {
				workbench.classList.toggle('nosidebar', !state.sidebar);
				workbench.classList.toggle('nosessionspart', !state.sessions);
				workbench.classList.toggle('phone-layout', state.phone);
				const part = {
					layoutService: {
						mainContainer: workbench,
						isSinglePaneLayoutEnabled: singlePane,
						isVisible: (partId: Parts) => partId === Parts.EDITOR_PART
							|| (partId === Parts.SIDEBAR_PART && state.sidebar)
							|| (partId === Parts.SESSIONS_PART && state.sessions),
					},
				};
				const layout = MainEditorPart.prototype.layout as (this: typeof part, width: number, height: number, top: number, left: number) => void;
				layout.call(part, 796, 600, 36, 0);

				return {
					name: state.name,
					leftGap: editor.getBoundingClientRect().left - grid.getBoundingClientRect().left,
					rightGap: workbench.getBoundingClientRect().right - editor.getBoundingClientRect().right,
					contentWidth: content.clientWidth,
					editorContentWidth: editor.clientWidth,
					layout: baseLayout.lastCall.args,
				};
			});

			assert.deepStrictEqual(actual, states.map(state => ({
				name: state.name,
				leftGap: state.leftGap,
				rightGap: 4,
				contentWidth: state.contentWidth,
				editorContentWidth: state.contentWidth,
				layout: [state.contentWidth, 598, 36, 0],
			})));
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
