/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import '../../browser/media/workbench.css';
import '../../browser/parts/media/editorPart.css';
import '../../browser/parts/media/chatCompositeBar.css';
import '../../browser/parts/mobile/mobileChatShell.css';
import assert from 'assert';
import sinon from 'sinon';
import { $, append } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { MainEditorPart as MainEditorPartBase } from '../../../workbench/browser/parts/editor/editorPart.js';
import { AbstractPaneCompositePart } from '../../../workbench/browser/parts/paneCompositePart.js';
import { Parts } from '../../../workbench/services/layout/browser/layoutService.js';
import { AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS, getAgentsPartCardContentSize, getSessionsPartCardMarginRight, getSessionsPartFrameInset, getSidePaneBottomFrameInset, getSidePaneFrameInset } from '../../browser/parts/agentsPartCard.js';
import { CustomViewGridPart } from '../../browser/parts/customViewGridPart.js';
import { AgentWorkbenchLayout } from '../../browser/workbench.js';
import { MainEditorPart } from '../../browser/parts/editorPart.js';
import { SessionsPart } from '../../browser/parts/sessionsPart.js';
import { PanelPart } from '../../browser/parts/panelPart.js';
import { AuxiliaryBarPart } from '../../browser/parts/auxiliaryBarPart.js';

suite('Sessions - Agents Part Card', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	teardown(() => sinon.restore());

	function createCard(sidebarVisible: boolean, editorPaneVisible: boolean, phone = false, compact = false) {
		const container = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench'));
		store.add(toDisposable(() => container.remove()));
		container.style.width = '800px';
		container.style.setProperty('--vscode-agents-layout-floatingPanelGap', '4px');
		container.style.setProperty('--vscode-cornerRadius-large', '8px');
		container.style.setProperty('--vscode-sash-size', '4px');
		container.style.setProperty('--vscode-strokeThickness', '1px');
		container.style.setProperty('--vscode-spacing-size20', '2px');
		container.style.setProperty('--vscode-spacing-size40', '4px');
		container.style.setProperty('--vscode-spacing-size60', '6px');
		container.classList.toggle('nosidebar', !sidebarVisible);
		container.classList.toggle('noeditorpane', !editorPaneVisible);
		container.classList.toggle('phone-layout', phone);
		container.classList.toggle('modern-ui-compact', compact && !phone);

		const card = append(container, $('.agents-part-card'));
		card.style.transition = 'none';

		return { container, card };
	}

	for (const compact of [false, true]) {
		for (const { sidebarVisible, editorPaneVisible, contentWidth } of [
			{ sidebarVisible: true, editorPaneVisible: true, contentWidth: 794 },
			{ sidebarVisible: true, editorPaneVisible: false, contentWidth: 798 },
			{ sidebarVisible: false, editorPaneVisible: true, contentWidth: 790 },
			{ sidebarVisible: false, editorPaneVisible: false, contentWidth: 794 },
		]) {
			test(`matches ${compact ? 'compact' : 'default'} card margins with sidebar ${sidebarVisible ? 'visible' : 'hidden'} and editor pane ${editorPaneVisible ? 'visible' : 'hidden'}`, () => {
				const { container, card } = createCard(sidebarVisible, editorPaneVisible, false, compact);
				const containerBounds = container.getBoundingClientRect();
				const cardBounds = card.getBoundingClientRect();

				assert.deepStrictEqual({
					leftGap: cardBounds.left - containerBounds.left,
					rightGap: containerBounds.right - cardBounds.right,
					renderedContentWidth: card.clientWidth,
					contentSize: getAgentsPartCardContentSize(800, 600, editorPaneVisible, sidebarVisible, false, compact),
					cornerRadius: mainWindow.getComputedStyle(card).borderTopLeftRadius,
				}, {
					leftGap: sidebarVisible || compact ? 0 : 4,
					rightGap: editorPaneVisible && !compact ? 4 : 0,
					renderedContentWidth: compact ? 800 : contentWidth,
					contentSize: { width: compact ? 800 : contentWidth, height: compact ? 600 : 598 },
					cornerRadius: compact ? '0px' : '8px',
				});
			});
		}
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

	for (const { connectedEditorTabs, showTabs } of [
		{ connectedEditorTabs: false, showTabs: 'multiple' as const },
		{ connectedEditorTabs: true, showTabs: 'multiple' as const },
		{ connectedEditorTabs: true, showTabs: 'single' as const },
	]) {
		test(`matches the ${connectedEditorTabs ? `connected ${showTabs}-tab` : 'pill'} side-pane gap to the floating-panel gap`, () => {
			const { container, card } = createCard(true, true);
			container.classList.add('modern-ui-tabs', 'dock-detail-panel');
			container.classList.toggle('modern-ui-connected-editor-tabs', connectedEditorTabs);
			container.classList.toggle(AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS, showTabs === 'multiple');
			card.classList.add('part', 'sessionspart');
			const row = append(container, $('.monaco-grid-view'));
			row.style.display = 'flex';
			const sessionAllocation = append(row, $('.session-allocation'));
			sessionAllocation.style.width = '500px';
			sessionAllocation.style.height = '400px';
			sessionAllocation.style.flex = '0 0 auto';
			append(sessionAllocation, card);
			card.style.height = '100%';
			const sidePaneMarginRight = getSessionsPartCardMarginRight(container);
			const contentSize = getAgentsPartCardContentSize(500, 400, true, true, false, false, sidePaneMarginRight);
			const content = append(card, $('.content'));
			content.style.width = `${contentSize.width}px`;
			content.style.height = `${contentSize.height}px`;
			const session = append(content, $('.session-view'));
			session.style.width = '100%';
			session.style.height = '100%';
			const editor = append(row, $('.part.editor'));
			editor.classList.toggle('editor-tabs-multiple', showTabs === 'multiple');
			editor.style.width = '300px';
			editor.style.height = '400px';
			editor.style.flex = '0 0 auto';
			const divider = append(row, $('.monaco-sash.vertical.sessions-side-pane-divider'));
			const dividerStyle = mainWindow.getComputedStyle(divider);
			const gripStyle = mainWindow.getComputedStyle(divider, '::after');
			const editorBounds = editor.getBoundingClientRect();
			const sidePaneFrameInset = getSidePaneFrameInset(container);
			const sidePaneFrameLeft = editorBounds.left + sidePaneFrameInset;
			const insetFrame = connectedEditorTabs && showTabs === 'multiple';

			assert.deepStrictEqual({
				sessionFrameInset: getSessionsPartFrameInset(container),
				sidePaneFrameInset,
				sidePaneMarginRight,
				marginRight: mainWindow.getComputedStyle(card).marginRight,
				backgroundClip: mainWindow.getComputedStyle(card).backgroundClip,
				renderedContentWidth: card.clientWidth,
				contentSize,
				frameGap: sidePaneFrameLeft - session.getBoundingClientRect().right,
				divider: {
					transform: dividerStyle.transform,
					width: dividerStyle.width,
					gripContent: gripStyle.content,
					gripWidth: gripStyle.width,
					gripHeight: gripStyle.height,
				},
			}, {
				sessionFrameInset: 1,
				sidePaneFrameInset: insetFrame ? 1 : 0,
				sidePaneMarginRight: insetFrame ? 2 : 3,
				marginRight: insetFrame ? '2px' : '3px',
				backgroundClip: 'padding-box',
				renderedContentWidth: insetFrame ? 496 : 495,
				contentSize: { width: insetFrame ? 496 : 495, height: 398 },
				frameGap: 4,
				divider: {
					transform: insetFrame ? 'matrix(1, 0, 0, 1, -1, 0)' : 'matrix(1, 0, 0, 1, -2, 0)',
					width: '4px',
					gripContent: '""',
					gripWidth: '2px',
					gripHeight: '2px',
				},
			});
		});
	}

	test('aligns pill and connected side-pane frames above a justified bottom panel', () => {
		const { container } = createCard(true, true);
		container.classList.add('modern-ui-tabs', 'dock-detail-panel', 'panel-alignment-justify');
		const grid = append(container, $('.monaco-grid-view'));
		grid.style.height = '400px';
		const editor = append(grid, $('.part.editor'));
		editor.style.width = '300px';
		editor.style.height = '100%';
		const content = append(editor, $('.content'));
		const baseLayout = sinon.stub(MainEditorPartBase.prototype, 'layout').callsFake((width, height) => {
			content.style.width = `${width}px`;
			content.style.height = `${height}px`;
		});
		const part = {
			layoutService: {
				mainContainer: container,
				agentWorkbenchLayout: AgentWorkbenchLayout.Desktop,
				isModernUICompact: () => false,
				isVisible: (partId: Parts) => partId === Parts.EDITOR_PART
					|| partId === Parts.SESSIONS_PART
					|| partId === Parts.PANEL_PART,
			},
		};
		const layout = MainEditorPart.prototype.layout as (this: typeof part, width: number, height: number, top: number, left: number) => void;
		const states = [
			{ name: 'pill multiple', connected: false, multiple: true },
			{ name: 'connected single', connected: true, multiple: false },
			{ name: 'connected multiple', connected: true, multiple: true },
		];

		const actual = states.map(state => {
			container.classList.toggle('modern-ui-connected-editor-tabs', state.connected);
			container.classList.toggle(AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS, state.multiple);
			editor.classList.toggle('editor-tabs-multiple', state.multiple);
			layout.call(part, 300, 400, 0, 0);
			const sidePaneFrameInset = getSidePaneFrameInset(container);

			return {
				name: state.name,
				sidePaneFrameInset,
				bottomFrameInset: getSidePaneBottomFrameInset(container),
				visibleFrameHeight: editor.getBoundingClientRect().height - sidePaneFrameInset,
				layout: baseLayout.lastCall.args,
			};
		});

		assert.deepStrictEqual(actual, [
			{ name: 'pill multiple', sidePaneFrameInset: 0, bottomFrameInset: 1, visibleFrameHeight: 399, layout: [298, 397, 0, 0] },
			{ name: 'connected single', sidePaneFrameInset: 0, bottomFrameInset: 1, visibleFrameHeight: 399, layout: [298, 397, 0, 0] },
			{ name: 'connected multiple', sidePaneFrameInset: 1, bottomFrameInset: 0, visibleFrameHeight: 399, layout: [298, 398, 0, 0] },
		]);
	});

	test('aligns non-docked side-pane frames after leaving phone layout', () => {
		const { container, card } = createCard(true, true, true);
		container.classList.add('modern-ui-tabs', 'modern-ui-connected-editor-tabs', AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS, 'panel-alignment-justify');
		container.classList.remove('phone-layout');
		card.classList.add('part', 'sessionspart');
		const row = append(container, $('.monaco-grid-view'));
		row.style.display = 'flex';
		row.style.width = '800px';
		row.style.height = '400px';
		const sessionAllocation = append(row, $('.session-allocation'));
		sessionAllocation.style.width = '500px';
		sessionAllocation.style.height = '400px';
		sessionAllocation.style.flex = '0 0 auto';
		sessionAllocation.appendChild(card);
		card.style.height = '100%';
		const sidePaneMarginRight = getSessionsPartCardMarginRight(container);
		const sessionContentSize = getAgentsPartCardContentSize(500, 400, true, true, false, false, sidePaneMarginRight);
		const sessionContent = append(card, $('.content'));
		sessionContent.style.width = `${sessionContentSize.width}px`;
		sessionContent.style.height = `${sessionContentSize.height}px`;
		const session = append(sessionContent, $('.session-view'));
		session.style.width = '100%';
		session.style.height = '100%';
		const editor = append(row, $('.part.editor'));
		editor.style.width = '200px';
		editor.style.height = '100%';
		editor.style.flex = '0 0 auto';
		const editorContent = append(editor, $('.content'));
		const auxiliaryBar = append(row, $('.part.auxiliarybar'));
		auxiliaryBar.style.width = '100px';
		auxiliaryBar.style.height = '100%';
		auxiliaryBar.style.flex = '0 0 auto';
		auxiliaryBar.style.transition = 'none';
		const auxiliaryContent = append(auxiliaryBar, $('.content'));
		const layoutService = {
			mainContainer: container,
			agentWorkbenchLayout: AgentWorkbenchLayout.Mobile,
			isModernUICompact: () => false,
			isVisible: (partId: Parts) => partId === Parts.EDITOR_PART
				|| partId === Parts.AUXILIARYBAR_PART
				|| partId === Parts.SESSIONS_PART
				|| partId === Parts.SIDEBAR_PART
				|| partId === Parts.PANEL_PART,
			getPanelAlignment: () => 'justify' as const,
		};
		const editorLayout = sinon.stub(MainEditorPartBase.prototype, 'layout').callsFake((width, height) => {
			editorContent.style.width = `${width}px`;
			editorContent.style.height = `${height}px`;
		});
		const auxiliaryLayout = sinon.stub(AbstractPaneCompositePart.prototype, 'layout').callsFake((width, height) => {
			auxiliaryContent.style.width = `${width}px`;
			auxiliaryContent.style.height = `${height}px`;
		});
		const layoutEditor = MainEditorPart.prototype.layout as (this: { layoutService: typeof layoutService }, width: number, height: number, top: number, left: number) => void;
		const layoutAuxiliaryBar = AuxiliaryBarPart.prototype.layout as typeof layoutEditor;
		layoutEditor.call({ layoutService }, 200, 400, 0, 500);
		layoutAuxiliaryBar.call({ layoutService }, 100, 400, 0, 700);

		assert.deepStrictEqual({
			docked: container.classList.contains('dock-detail-panel'),
			sessionFrameInset: getSessionsPartFrameInset(container),
			sidePaneFrameInset: getSidePaneFrameInset(container),
			bottomFrameInset: getSidePaneBottomFrameInset(container),
			sidePaneMarginRight,
			renderedMarginRight: mainWindow.getComputedStyle(card).marginRight,
			horizontalGap: editor.getBoundingClientRect().left - session.getBoundingClientRect().right,
			editorFrameHeight: editor.getBoundingClientRect().height,
			auxiliaryFrameHeight: auxiliaryBar.getBoundingClientRect().height,
			editorLayout: editorLayout.lastCall.args,
			auxiliaryLayout: auxiliaryLayout.lastCall.args,
		}, {
			docked: false,
			sessionFrameInset: 1,
			sidePaneFrameInset: 0,
			bottomFrameInset: 1,
			sidePaneMarginRight: 3,
			renderedMarginRight: '3px',
			horizontalGap: 4,
			editorFrameHeight: 399,
			auxiliaryFrameHeight: 399,
			editorLayout: [198, 397, 0, 500],
			auxiliaryLayout: [93, 397, 0, 700],
		});
	});

	test('compensates the bottom-panel margin for the inset session frame', () => {
		const { container } = createCard(true, false);
		container.classList.add('modern-ui-tabs');
		const panel = append(container, $('.part.panel'));
		panel.style.transition = 'none';
		const baseLayout = sinon.stub(AbstractPaneCompositePart.prototype, 'layout');
		let sessionsVisible = true;
		const part = {
			layoutService: {
				mainContainer: container,
				isModernUICompact: () => false,
				isVisible: (partId: Parts) => partId === Parts.PANEL_PART
					|| partId === Parts.SIDEBAR_PART
					|| (partId === Parts.SESSIONS_PART && sessionsVisible),
				getPanelAlignment: () => 'justify' as const,
			},
		};
		const layoutPanel = PanelPart.prototype.layout as (this: typeof part, width: number, height: number, top: number, left: number) => void;

		const actual = [true, false, true].map(visible => {
			sessionsVisible = visible;
			container.classList.toggle('nosessionspart', !visible);
			layoutPanel.call(part, 800, 200, 400, 0);
			return {
				sessionsVisible: visible,
				sessionFrameInset: getSessionsPartFrameInset(container),
				marginTop: mainWindow.getComputedStyle(panel).marginTop,
				layout: baseLayout.lastCall.args,
			};
		});

		assert.deepStrictEqual(actual, [
			{ sessionsVisible: true, sessionFrameInset: 1, marginTop: '3px', layout: [798, 195, 400, 0] },
			{ sessionsVisible: false, sessionFrameInset: 0, marginTop: '4px', layout: [798, 194, 400, 0] },
			{ sessionsVisible: true, sessionFrameInset: 1, marginTop: '3px', layout: [798, 195, 400, 0] },
		]);
	});

	for (const desktop of [false, true]) {
		test(`keeps the expanded ${desktop ? 'desktop' : 'mobile'} editor gutter and content size in sync`, () => {
			const workbench = append(mainWindow.document.body, $('.monaco-workbench.agent-sessions-workbench.noauxiliarybar'));
			store.add(toDisposable(() => workbench.remove()));
			workbench.classList.toggle('dock-detail-panel', desktop);
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
						agentWorkbenchLayout: desktop ? AgentWorkbenchLayout.Desktop : AgentWorkbenchLayout.Mobile,
						isModernUICompact: () => false,
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

		test(`updates ${desktop ? 'desktop' : 'mobile'} editor gutters when density changes`, () => {
			const { container: workbench, card } = createCard(false, true);
			card.remove();
			workbench.classList.add('noauxiliarybar', 'nosessionspart');
			workbench.classList.toggle('dock-detail-panel', desktop);
			const grid = append(workbench, $('.monaco-grid-view'));
			const editor = append(grid, $('.part.editor'));
			const content = append(editor, $('.content'));
			sinon.stub(MainEditorPartBase.prototype, 'layout').callsFake((width, height) => {
				content.style.width = `${width}px`;
				content.style.height = `${height}px`;
			});

			const actual = [false, true, false].map(compact => {
				workbench.classList.toggle('modern-ui-compact', compact);
				const part = {
					layoutService: {
						mainContainer: workbench,
						agentWorkbenchLayout: desktop ? AgentWorkbenchLayout.Desktop : AgentWorkbenchLayout.Mobile,
						isModernUICompact: () => compact,
						isVisible: (partId: Parts) => partId === Parts.EDITOR_PART,
					},
				};
				const layout = MainEditorPart.prototype.layout as (this: typeof part, width: number, height: number, top: number, left: number) => void;
				layout.call(part, grid.clientWidth, 600, 36, 0);
				return {
					gridWidth: grid.clientWidth,
					leftGap: editor.getBoundingClientRect().left - grid.getBoundingClientRect().left,
					rightGap: workbench.getBoundingClientRect().right - editor.getBoundingClientRect().right,
					contentWidth: content.clientWidth,
					editorContentWidth: editor.clientWidth,
					cornerRadius: mainWindow.getComputedStyle(editor).borderBottomRightRadius,
				};
			});

			const defaultState = { gridWidth: 796, leftGap: 4, rightGap: 4, contentWidth: 790, editorContentWidth: 790, cornerRadius: '8px' };
			assert.deepStrictEqual(actual, [
				defaultState,
				{ gridWidth: 800, leftGap: 0, rightGap: 0, contentWidth: 800, editorContentWidth: 800, cornerRadius: '0px' },
				defaultState,
			]);
		});
	}

	test('keeps panel tab and action area horizontal padding unchanged across densities', () => {
		const { container } = createCard(true, true);
		const titles = ['panel', 'auxiliarybar'].map(className => {
			const part = append(container, $(`.part.${className}`));
			const title = append(part, $('.title'));
			const tabs = append(title, $('.composite-bar-container'));
			tabs.style.width = '100px';
			append(title, $('.title-actions'));
			const actions = append(title, $('.global-actions'));
			actions.style.width = '24px';
			return { title, tabs, actions };
		});

		const states = [false, true, false].map(compact => {
			container.classList.toggle('modern-ui-compact', compact);
			return titles.map(({ title, tabs, actions }) => {
				const style = mainWindow.getComputedStyle(title);
				const bounds = title.getBoundingClientRect();
				return {
					paddingLeft: style.paddingLeft,
					paddingRight: style.paddingRight,
					tabsInset: tabs.getBoundingClientRect().left - bounds.left,
					actionsInset: bounds.right - actions.getBoundingClientRect().right,
				};
			});
		});

		const expected = { paddingLeft: '4px', paddingRight: '2px', tabsInset: 4, actionsInset: 2 };
		assert.deepStrictEqual(states, [
			[expected, expected],
			[expected, expected],
			[expected, expected],
		]);
	});

	test('updates panel and auxiliary bar insets when density changes', () => {
		const { container } = createCard(true, true);
		const panel = append(container, $('.part.panel'));
		const auxiliaryBar = append(container, $('.part.auxiliarybar'));
		panel.style.transition = 'none';
		auxiliaryBar.style.transition = 'none';
		const baseLayout = sinon.stub(AbstractPaneCompositePart.prototype, 'layout');

		const actual = [false, true, false].map(compact => {
			container.classList.toggle('modern-ui-compact', compact);
			const part = {
				layoutService: {
					mainContainer: container,
					isModernUICompact: () => compact,
					isVisible: () => true,
					getPanelAlignment: () => 'justify' as const,
				},
			};
			const panelLayout = PanelPart.prototype.layout as (this: typeof part, width: number, height: number, top: number, left: number) => void;
			const auxiliaryBarLayout = AuxiliaryBarPart.prototype.layout as typeof panelLayout;
			panelLayout.call(part, 800, 600, 36, 0);
			const panelSize = baseLayout.lastCall.args;
			auxiliaryBarLayout.call(part, 800, 600, 36, 0);

			return {
				panelSize,
				auxiliaryBarSize: baseLayout.lastCall.args,
				panelMargin: mainWindow.getComputedStyle(panel).marginTop,
				auxiliaryBarPadding: mainWindow.getComputedStyle(auxiliaryBar).paddingLeft,
			};
		});

		const defaultState = { panelSize: [798, 594, 36, 0], auxiliaryBarSize: [793, 598, 36, 0], panelMargin: '4px', auxiliaryBarPadding: '6px' };
		assert.deepStrictEqual(actual, [
			defaultState,
			{ panelSize: [800, 600, 36, 0], auxiliaryBarSize: [800, 600, 36, 0], panelMargin: '0px', auxiliaryBarPadding: '0px' },
			defaultState,
		]);
	});

	test('keeps panel composite content within active horizontal insets', () => {
		const { container } = createCard(true, true);
		const panel = append(container, $('.part.panel'));
		const content = append(panel, $('.content'));
		panel.style.transition = 'none';
		const baseLayout = sinon.stub(AbstractPaneCompositePart.prototype, 'layout').callsFake((width, height) => {
			content.style.width = `${width}px`;
			content.style.height = `${height}px`;
		});
		let sidebarVisible = true;
		let editorPaneVisible = true;
		let alignment: 'center' | 'justify' = 'justify';
		const part = {
			layoutService: {
				mainContainer: container,
				isModernUICompact: () => false,
				isVisible: (partId: Parts) => partId === Parts.PANEL_PART
					|| (partId === Parts.SIDEBAR_PART && sidebarVisible)
					|| ((partId === Parts.EDITOR_PART || partId === Parts.AUXILIARYBAR_PART) && editorPaneVisible),
				getPanelAlignment: () => alignment,
			},
		};
		const layoutPanel = PanelPart.prototype.layout as (this: typeof part, width: number, height: number, top: number, left: number) => void;
		const states = [
			{ name: 'full span', sidebar: true, editorPane: true, alignment: 'justify' as const, width: 798 },
			{ name: 'full span without sidebar', sidebar: false, editorPane: true, alignment: 'justify' as const, width: 794 },
			{ name: 'chat aligned', sidebar: true, editorPane: true, alignment: 'center' as const, width: 794 },
			{ name: 'chat aligned without sidebar', sidebar: false, editorPane: true, alignment: 'center' as const, width: 790 },
			{ name: 'chat aligned without side pane', sidebar: false, editorPane: false, alignment: 'center' as const, width: 794 },
		];

		const actual = states.map(state => {
			sidebarVisible = state.sidebar;
			editorPaneVisible = state.editorPane;
			alignment = state.alignment;
			container.classList.toggle('nosidebar', !state.sidebar);
			container.classList.toggle('noeditorpane', !state.editorPane);
			container.classList.toggle('panel-alignment-center', state.alignment === 'center');
			container.classList.toggle('panel-alignment-justify', state.alignment === 'justify');
			layoutPanel.call(part, 800, 200, 400, 0);

			return {
				name: state.name,
				renderedWidth: panel.clientWidth,
				contentWidth: content.clientWidth,
				layout: baseLayout.lastCall.args,
			};
		});

		assert.deepStrictEqual(actual, states.map(state => ({
			name: state.name,
			renderedWidth: state.width,
			contentWidth: state.width,
			layout: [state.width, 194, 400, 0],
		})));
	});

	test('keeps connected chat and editor frames flush in compact density', () => {
		const { container, card } = createCard(true, true);
		container.classList.add('modern-ui-tabs', 'modern-ui-connected-editor-tabs', 'dock-detail-panel');
		container.style.setProperty('--modern-ui-connected-tab-border', '#808080');
		container.style.setProperty('--vscode-editorGroupHeader-tabsBorder', '#808080');
		card.classList.add('part', 'sessionspart');
		const session = append(card, $('.session-view'));
		const grid = append(container, $('.monaco-grid-view'));
		const editor = append(grid, $('.part.editor.editor-tabs-multiple'));
		const editorContent = append(editor, $('.content'));
		const group = append(editorContent, $('.editor-group-container'));

		const actual = [false, true, false].map(compact => {
			container.classList.toggle('modern-ui-compact', compact);
			return {
				sessionCorner: mainWindow.getComputedStyle(session).borderTopLeftRadius,
				editorCorner: mainWindow.getComputedStyle(group, '::after').borderBottomRightRadius,
				sessionInset: mainWindow.getComputedStyle(card).borderWidth,
				editorInset: mainWindow.getComputedStyle(editor).borderWidth,
				sessionFrame: mainWindow.getComputedStyle(session, '::after').borderWidth,
				editorFrame: mainWindow.getComputedStyle(group, '::after').borderWidth,
			};
		});

		const defaultState = { sessionCorner: '7px', editorCorner: '7px', sessionInset: '1px', editorInset: '1px', sessionFrame: '1px', editorFrame: '1px' };
		assert.deepStrictEqual(actual, [
			defaultState,
			{ sessionCorner: '0px', editorCorner: '0px', sessionInset: '0px', editorInset: '0px', sessionFrame: '1px 0px 0px 1px', editorFrame: '1px 0px 0px 1px' },
			defaultState,
		]);
	});

	for (const theme of ['hc-black', 'hc-light']) {
		test(`preserves the full contrast frame without reserving compact layout space in ${theme}`, () => {
			const { container, card } = createCard(true, false, false, true);
			container.classList.add(theme);
			container.style.setProperty('--part-border-color', '#808080');
			const frame = mainWindow.getComputedStyle(card, '::after');

			assert.deepStrictEqual({
				contentWidth: card.clientWidth,
				borderWidth: mainWindow.getComputedStyle(card).borderWidth,
				frameWidth: frame.borderWidth,
				frameColor: frame.borderColor,
			}, {
				contentWidth: 800,
				borderWidth: '0px',
				frameWidth: '1px',
				frameColor: 'rgb(128, 128, 128)',
			});
		});
	}

	for (const connected of [false, true]) {
		test(`compact ${connected ? 'connected' : 'pill'} panels have zero space between their rendered surfaces`, () => {
			const { container, card } = createCard(true, true, false, true);
			container.classList.add('modern-ui-tabs');
			container.classList.toggle('modern-ui-connected-editor-tabs', connected);
			container.style.setProperty('--modern-ui-connected-tab-border', '#808080');
			card.classList.add('part', 'sessionspart');
			card.style.width = '500px';
			card.style.height = '400px';
			const grid = append(container, $('.monaco-grid-view'));
			const row = append(grid, $('div'));
			row.style.display = 'flex';
			row.appendChild(card);
			const content = append(card, $('.content'));
			const contentSize = getAgentsPartCardContentSize(500, 400, true, true, false, true);
			content.style.width = `${contentSize.width}px`;
			content.style.height = `${contentSize.height}px`;
			const session = append(content, $('.session-view'));
			session.style.height = '100%';
			const auxiliaryBar = append(row, $('.part.auxiliarybar'));
			auxiliaryBar.style.width = '300px';
			auxiliaryBar.style.height = '400px';
			auxiliaryBar.style.transition = 'none';
			const auxiliaryContent = append(auxiliaryBar, $('.content'));
			const panel = append(grid, $('.part.panel'));
			panel.style.width = '800px';
			panel.style.height = '200px';
			panel.style.transition = 'none';
			const panelContent = append(panel, $('.content'));
			const layoutService = {
				mainContainer: container,
				isModernUICompact: () => true,
				isVisible: () => true,
				getPanelAlignment: () => 'justify' as const,
			};
			const auxiliaryPart = { layoutService };
			const panelPart = { layoutService };
			let contentToLayout = auxiliaryContent;
			sinon.stub(AbstractPaneCompositePart.prototype, 'layout').callsFake((width, height) => {
				contentToLayout.style.width = `${width}px`;
				contentToLayout.style.height = `${height}px`;
			});
			const layoutAuxiliaryBar = AuxiliaryBarPart.prototype.layout as (this: typeof auxiliaryPart, width: number, height: number, top: number, left: number) => void;
			const layoutPanel = PanelPart.prototype.layout as typeof layoutAuxiliaryBar;
			layoutAuxiliaryBar.call(auxiliaryPart, 300, 400, 0, 500);
			contentToLayout = panelContent;
			layoutPanel.call(panelPart, 800, 200, 400, 0);
			const sessionBounds = session.getBoundingClientRect();
			const auxiliaryBounds = auxiliaryContent.getBoundingClientRect();
			const panelBounds = panelContent.getBoundingClientRect();
			const frameWidths = (element: HTMLElement) => {
				const style = mainWindow.getComputedStyle(element, '::after');
				return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth];
			};

			assert.deepStrictEqual({
				horizontalGap: auxiliaryBounds.left - sessionBounds.right,
				sessionPanelGap: panelBounds.top - sessionBounds.bottom,
				auxiliaryPanelGap: panelBounds.top - auxiliaryBounds.bottom,
				sessionInset: sessionBounds.left - card.getBoundingClientRect().left,
				sessionFrame: frameWidths(connected ? session : card),
				auxiliaryFrame: frameWidths(auxiliaryBar),
				panelFrame: frameWidths(panel),
			}, {
				horizontalGap: 0,
				sessionPanelGap: 0,
				auxiliaryPanelGap: 0,
				sessionInset: 0,
				sessionFrame: ['1px', '0px', '0px', '1px'],
				auxiliaryFrame: ['1px', '0px', '0px', '1px'],
				panelFrame: ['1px', '0px', '0px', '1px'],
			});
		});
	}

	test('reduces file and changes row insets in compact density', () => {
		const { container } = createCard(true, true);
		const rows = ['explorer-folders-view', 'changes-file-list'].map(className => {
			const list = append(container, $(`.${className}`));
			list.style.position = 'relative';
			const row = append(list, $('.monaco-list-row'));
			row.style.position = 'absolute';
			return row;
		});

		const actual = [false, true, false].map(compact => {
			container.classList.toggle('modern-ui-compact', compact);
			return rows.map(row => ({
				left: mainWindow.getComputedStyle(row).left,
				right: mainWindow.getComputedStyle(row).right,
				width: row.getBoundingClientRect().width,
			}));
		});

		const defaultInsets = { left: '4px', right: '4px', width: 792 };
		const compactInsets = { left: '2px', right: '2px', width: 796 };
		assert.deepStrictEqual(actual, [
			[defaultInsets, defaultInsets],
			[compactInsets, compactInsets],
			[defaultInsets, defaultInsets],
		]);
	});

	for (const partConstructor of [SessionsPart, CustomViewGridPart]) {
		test(`${partConstructor.name} keeps density and phone content dimensions in sync`, () => {
			const { container } = createCard(false, false);
			let compact = false;
			const contentLayouts: { width: number; height: number }[] = [];
			const gridLayouts: { width: number; height: number }[] = [];
			const layoutGrid = (width: number, height: number) => {
				gridLayouts.push({ width, height });
			};
			const part = {
				layoutService: {
					mainContainer: container,
					isModernUICompact: () => compact && !container.classList.contains('phone-layout'),
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
			compact = true;
			container.classList.add('modern-ui-compact');
			layout.call(part, 800, 600, 36, 0);
			container.classList.add('phone-layout');
			container.classList.remove('modern-ui-compact');
			layout.call(part, 390, 796, 48, 0);
			container.classList.remove('phone-layout');
			container.classList.add('modern-ui-compact');
			layout.call(part, 800, 600, 36, 0);
			compact = false;
			container.classList.remove('modern-ui-compact');
			layout.call(part, 800, 600, 36, 0);

			const expectedLayouts = [
				{ width: 794, height: 598 },
				{ width: 800, height: 600 },
				{ width: 390, height: 796 },
				{ width: 800, height: 600 },
				{ width: 794, height: 598 },
			];
			assert.deepStrictEqual({ contentLayouts, gridLayouts }, {
				contentLayouts: expectedLayouts,
				gridLayouts: expectedLayouts,
			});
		});
	}
});
