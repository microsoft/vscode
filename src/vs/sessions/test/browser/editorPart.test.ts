/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ScrollableElement } from '../../../base/browser/ui/scrollbar/scrollableElement.js';
import { mainWindow } from '../../../base/browser/window.js';
import { toDisposable } from '../../../base/common/lifecycle.js';
import { ScrollbarVisibility } from '../../../base/common/scrollable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
// eslint-disable-next-line local/code-import-patterns
import { createBrowserWelcome } from '../../../workbench/contrib/browserView/browser/browserWelcome.js';
import { renderSessionsEmptyState } from '../../../workbench/browser/parts/sessions/sessionsEmptyState.js';
import { AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS } from '../../../workbench/browser/parts/sessions/agentsPartCard.js';
import '../../browser/parts/media/editorPart.css';
import '../../browser/media/workbench.css';
import '../../browser/media/style.css';
import '../../browser/media/floatingAuxiliaryBar.css';
import '../../../workbench/browser/parts/editor/media/multieditortabscontrol.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../workbench/contrib/modernUI/browser/media/tabs.css';
// eslint-disable-next-line local/code-import-patterns
import '../../../workbench/contrib/modernUI/browser/connectedEditorTabs.js';

function appendElement(parent: HTMLElement, className: string): HTMLElement {
	const element = mainWindow.document.createElement('div');
	element.className = className;
	parent.appendChild(element);
	return element;
}

suite('Sessions - EditorPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('native canvas clipping follows the component editor radius inside the connected frame', () => {
		const root = appendElement(mainWindow.document.body, `monaco-workbench agent-sessions-workbench modern-ui-tabs modern-ui-connected-editor-tabs dock-detail-panel ${AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS}`);
		store.add(toDisposable(() => root.remove()));
		root.style.cssText = '--vscode-strokeThickness: 1px; --vscode-cornerRadius-large: 8px; --vscode-agents-layout-floatingPanelGap: 4px;';
		const editor = appendElement(appendElement(root, 'monaco-grid-view'), 'part editor editor-tabs-multiple');
		const group = appendElement(appendElement(editor, 'content'), 'editor-group-container');
		const canvas = appendElement(appendElement(appendElement(group, 'session-canvas-editor'), 'browser-container-wrapper'), 'browser-container');
		const results = [0, 1, 4, 8].map(radius => {
			root.style.setProperty('--vscode-agentsWindow-editorArea-cornerRadius', `${radius}px`);
			return {
				frame: mainWindow.getComputedStyle(group, '::after').borderTopLeftRadius,
				canvas: mainWindow.getComputedStyle(canvas).borderTopLeftRadius,
			};
		});
		assert.deepStrictEqual(results, [0, 1, 4, 8].map(radius => ({
			frame: `${Math.max(0, radius - 1)}px`, canvas: `${Math.max(0, radius - 2)}px`,
		})));
	});

	test('only modern editor tabs change scrollbar placement and painted thickness', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench modern-ui-tabs modern-ui-connected-editor-tabs');
		workbench.style.cssText = '--vscode-cornerRadius-circle: 9999px; --vscode-scrollbarSlider-background: #123456;';
		const group = appendElement(appendElement(appendElement(workbench, 'part editor'), 'content'), 'editor-group-container');
		const title = appendElement(group, 'title tabs');
		const row = appendElement(title, 'tabs-and-actions-container');
		const breadcrumbs = appendElement(title, 'breadcrumbs-control');
		const editorContent = appendElement(group, 'editor-container');
		const results = [];
		store.add(toDisposable(() => workbench.remove()));
		for (const [mode, modern, connected] of [
			['legacy', false, false],
			['pill', true, false],
			['connected', true, true],
			['connected-without-modern', false, true],
		] as const) {
			workbench.classList.toggle('modern-ui-tabs', modern);
			workbench.classList.toggle('modern-ui-connected-editor-tabs', connected);
			for (const [surface, parent] of [['tabs', row], ['breadcrumbs', breadcrumbs], ['content', editorContent]] as const) {
				for (const size of [3, 10]) {
					const content = mainWindow.document.createElement('div');
					content.style.cssText = 'width: 180px; height: 32px;';
					const scrollable = store.add(new ScrollableElement(content, {
						horizontal: ScrollbarVisibility.Visible,
						horizontalScrollbarSize: size,
						vertical: ScrollbarVisibility.Hidden,
					}));
					const viewport = scrollable.getDomNode();
					parent.appendChild(viewport);
					scrollable.setScrollDimensions({ width: 180, scrollWidth: 600, height: 32, scrollHeight: 32 });
					const track = viewport.querySelector<HTMLElement>('.scrollbar.horizontal')!;
					const slider = track.querySelector<HTMLElement>('.slider')!;
					const paint = mainWindow.getComputedStyle(slider, '::before');
					assert.strictEqual(paint.content, '""', 'The Agents stylesheet must generate the painted thumb');
					results.push({
						mode, surface, size,
						hitHeight: slider.getBoundingClientRect().height,
						paintHeight: paint.height,
						insets: [paint.top, paint.right, paint.bottom, paint.left],
						atTop: track.getBoundingClientRect().top === viewport.getBoundingClientRect().top,
						atBottom: track.getBoundingClientRect().bottom === viewport.getBoundingClientRect().bottom,
						radius: paint.borderRadius,
						color: paint.backgroundColor,
						sliderBackground: mainWindow.getComputedStyle(slider).backgroundColor,
					});
					viewport.remove();
				}
			}
		}
		assert.deepStrictEqual(results, results.map(result => {
			const modernTabs = (result.mode === 'connected' || result.mode === 'pill') && result.surface === 'tabs';
			return {
				...result,
				hitHeight: result.size,
				paintHeight: `${result.size - (modernTabs ? 0 : 2)}px`,
				insets: Array(4).fill(modernTabs ? '0px' : '1px'),
				atTop: modernTabs,
				atBottom: !modernTabs,
				radius: '9999px',
				color: 'rgb(18, 52, 86)',
				sliderBackground: 'rgba(0, 0, 0, 0)',
			};
		}));
	});

	test('Connected panel rows match panel header height across hosts', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench modern-ui-tabs modern-ui-connected-editor-tabs');
		workbench.style.cssText = '--vscode-spacing-size20: 2px; --vscode-spacing-size40: 4px; --vscode-spacing-size60: 6px; --vscode-cornerRadius-small: 4px; --vscode-cornerRadius-medium: 6px; --vscode-strokeThickness: 1px;';
		const editor = appendElement(workbench, 'part editor');
		const group = appendElement(appendElement(editor, 'content'), 'editor-group-container');
		const title = appendElement(group, 'title tabs');
		const row = appendElement(title, 'tabs-and-actions-container');
		const tabs = appendElement(appendElement(row, 'monaco-scrollable-element'), 'tabs-container');
		const tab = appendElement(tabs, 'tab active');
		appendElement(tab, 'tab-fill');
		appendElement(tab, 'tab-connected-edge');
		tab.style.width = '120px';
		const inactive = appendElement(tabs, 'tab');
		inactive.classList.add('hovered');
		const inactiveFill = appendElement(inactive, 'tab-fill');
		inactive.style.width = '120px';
		const results = [];
		store.add(toDisposable(() => workbench.remove()));
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			workbench.classList.add(theme);
			for (const direction of ['ltr', 'rtl']) {
				workbench.dir = direction;
				for (const compact of [false, true]) {
					title.classList.toggle('compact-height', compact);
					for (const host of ['main', 'agents', 'modal']) {
						workbench.classList.toggle('agent-sessions-workbench', host !== 'main');
						editor.classList.toggle('modal-editor-part', host === 'modal');
						const style = mainWindow.getComputedStyle(tab);
						results.push({
							theme, direction, compact, host,
							rowHeight: row.getBoundingClientRect().height,
							topInset: mainWindow.getComputedStyle(tab.firstElementChild!).top,
							tabHeight: style.height,
							capRadius: mainWindow.getComputedStyle(tab.firstElementChild!).borderTopRightRadius,
							hoverInsets: [mainWindow.getComputedStyle(inactiveFill).top, mainWindow.getComputedStyle(inactiveFill).bottom],
						});
					}
				}
			}
			workbench.classList.remove(theme);
		}
		assert.deepStrictEqual(results, results.map(result => ({
			...result,
			rowHeight: result.compact ? 28 : 32,
			topInset: '0px',
			tabHeight: `${result.compact ? 27 : 31}px`,
			capRadius: '7px',
			hoverInsets: ['0px', '-1px'],
		})));
	});

	test('connected detail tabs keep rounded corners while sharing the single card frame', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench modern-ui-tabs modern-ui-connected-editor-tabs dock-detail-panel');
		workbench.classList.add(AGENTS_SIDE_PANE_MULTIPLE_TABS_CLASS);
		for (const [name, value] of Object.entries({
			'--vscode-agents-layout-floatingPanelGap': '4px',
			'--vscode-spacing-size20': '2px',
			'--vscode-spacing-size40': '4px',
			'--vscode-spacing-size60': '6px',
			'--vscode-spacing-size80': '8px',
			'--vscode-spacing-size200': '20px',
			'--vscode-cornerRadius-small': '4px',
			'--vscode-cornerRadius-large': '8px',
			'--vscode-strokeThickness': '1px',
			'--vscode-editorGroupHeader-tabsBorder': '#445566',
			'--vscode-agentsPanel-border': '#abcdef',
			'--vscode-focusBorder': '#00ff00',
			'--vscode-contrastBorder': '#ffffff',
			'--vscode-tab-border': '#ffffff',
		})) {
			workbench.style.setProperty(name, value);
		}
		const grid = appendElement(workbench, 'monaco-grid-view');
		const card = appendElement(grid, 'part editor editor-tabs-multiple');
		const content = appendElement(card, 'content');
		const group = appendElement(content, 'editor-group-container active');
		group.style.width = '358px';
		const title = appendElement(group, 'title tabs');
		const row = appendElement(title, 'tabs-and-actions-container');
		const scrollable = appendElement(row, 'monaco-scrollable-element');
		const tabs = appendElement(scrollable, 'tabs-container');
		const first = appendElement(tabs, 'tab active connected-tab-top-row first-in-row');
		const firstFill = appendElement(first, 'tab-fill');
		const firstEdge = appendElement(first, 'tab-connected-edge');
		const second = appendElement(tabs, 'tab connected-tab-top-row connected-tab-last');
		const secondFill = appendElement(second, 'tab-fill');
		const secondEdge = appendElement(second, 'tab-connected-edge');
		first.style.width = second.style.width = '180px';
		tabs.style.width = '358px';
		appendElement(group, 'editor-container').style.height = '96px';

		store.add(toDisposable(() => workbench.remove()));
		for (const theme of ['vs', 'vs-dark', 'hc-black', 'hc-light']) {
			workbench.classList.add(theme);
			for (const active of [true, false]) {
				group.classList.toggle('active', active);
				const frameBorder = theme.startsWith('hc-') ? 'rgb(171, 205, 239)' : 'rgb(68, 85, 102)';
				for (const compact of [false, true]) {
					title.classList.toggle('compact-height', compact);
					for (const zoom of [0.8, 1, 1.25]) {
						workbench.style.zoom = String(zoom);
						for (const firstActive of [true, false]) {
							first.classList.toggle('active', firstActive);
							second.classList.toggle('active', !firstActive);
							const fill = firstActive ? firstFill : secondFill;
							const cap = mainWindow.getComputedStyle(firstActive ? firstEdge : secondEdge);
							const frame = mainWindow.getComputedStyle(group, '::after');
							assert.deepStrictEqual({
								outerBorder: mainWindow.getComputedStyle(card).borderTopColor,
								frame: [frame.borderTopColor, frame.borderRightColor, frame.borderBottomColor, frame.borderLeftColor],
								frameInsets: [frame.top, frame.right, frame.bottom, frame.left],
								frameRadius: frame.borderRadius,
								frameDeviceStroke: Math.round(parseFloat(frame.borderTopWidth) * zoom * mainWindow.devicePixelRatio),
								framePointerEvents: frame.pointerEvents,
								capAlignedWithFrame: Math.abs(fill.getBoundingClientRect().top - group.getBoundingClientRect().top) < 1 / 32,
								capBorder: cap.borderTopColor,
								fillTopBorder: mainWindow.getComputedStyle(fill).borderTopColor,
								firstBackgroundClip: mainWindow.getComputedStyle(firstFill).backgroundClip,
								firstLeftBorder: mainWindow.getComputedStyle(firstFill).borderLeftColor,
							}, {
								outerBorder: 'rgba(0, 0, 0, 0)',
								frame: [frameBorder, frameBorder, frameBorder, frameBorder],
								frameInsets: ['0px', '0px', '0px', '0px'],
								frameRadius: '7px',
								frameDeviceStroke: Math.max(1, Math.floor(zoom * mainWindow.devicePixelRatio)),
								framePointerEvents: 'none',
								capAlignedWithFrame: true,
								capBorder: theme.startsWith('hc-') ? active ? 'rgb(0, 255, 0)' : 'rgb(255, 255, 255)' : frameBorder,
								fillTopBorder: 'rgba(0, 0, 0, 0)',
								firstBackgroundClip: 'border-box',
								firstLeftBorder: 'rgba(0, 0, 0, 0)',
							}, `${theme}, active: ${active}, compact: ${compact}, zoom: ${zoom}, first: ${firstActive}`);
						}

						for (const wrapped of [true, false]) {
							row.classList.toggle('wrapping', wrapped);
							first.classList.toggle('last-in-row', wrapped);
							first.classList.toggle('connected-tab-upper-row', wrapped);
							second.classList.toggle('first-in-row', wrapped);
							second.classList.toggle('connected-tab-top-row', !wrapped);
							const cap = mainWindow.getComputedStyle(secondFill);
							assert.deepStrictEqual({
								active: second.classList.contains('active'),
								laterRow: second.offsetTop > first.offsetTop,
								leadingEdge: second.getBoundingClientRect().left === first.getBoundingClientRect().left,
								backgroundClip: cap.backgroundClip,
								leftBorder: cap.borderLeftColor,
								leftCorner: cap.borderTopLeftRadius,
							}, {
								active: true,
								laterRow: wrapped,
								leadingEdge: wrapped,
								backgroundClip: 'border-box',
								leftBorder: 'rgba(0, 0, 0, 0)',
								leftCorner: wrapped ? '0px' : '5px',
							}, `${theme}, active: ${active}, compact: ${compact}, zoom: ${zoom}, wrapped: ${wrapped}`);
						}
					}
				}
			}
			workbench.classList.remove(theme);
		}

		for (const excluded of ['phone-layout', 'modal-editor-part']) {
			const target = excluded === 'phone-layout' ? workbench : card;
			target.classList.add(excluded);
			assert.strictEqual(mainWindow.getComputedStyle(group, '::after').content, 'none');
			target.classList.remove(excluded);
		}
		workbench.classList.remove('modern-ui-connected-editor-tabs');
		assert.deepStrictEqual({
			frame: mainWindow.getComputedStyle(group, '::after').content,
			outerBorder: mainWindow.getComputedStyle(card).borderTopColor,
		}, { frame: 'none', outerBorder: 'rgb(171, 205, 239)' });
	});

	for (const position of ['left', 'top', 'bottom']) {
		test(`keeps the connected outer frame above ${position} details without adding another stroke`, () => {
			const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench modern-ui-tabs modern-ui-connected-editor-tabs dock-detail-panel');
			workbench.style.setProperty('--vscode-strokeThickness', '1px');
			workbench.style.setProperty('--vscode-cornerRadius-large', '8px');
			workbench.style.setProperty('--vscode-contrastBorder', '#abcdef');
			workbench.style.setProperty('--vscode-editorGroupHeader-tabsBorder', '#445566');
			workbench.style.setProperty('--vscode-agentsPanel-border', '#abcdef');
			const card = appendElement(appendElement(workbench, 'monaco-grid-view'), 'part editor editor-tabs-multiple');
			const content = appendElement(card, 'content');
			const group = appendElement(content, 'editor-group-container');
			const pane = appendElement(group, 'editor-container');
			const details = appendElement(card, `part auxiliarybar docked-auxiliarybar docked-auxiliarybar-${position}`);
			try {
				for (const theme of ['vs-dark', 'vs', 'hc-black', 'hc-light']) {
					workbench.classList.add(theme);
					const frame = mainWindow.getComputedStyle(group, '::after');
					const dockedIsolation = mainWindow.getComputedStyle(content).isolation;
					card.classList.add('floating-details-visible');
					const floatingIsolation = mainWindow.getComputedStyle(content).isolation;
					const floatingPaneIsolation = mainWindow.getComputedStyle(pane).isolation;
					card.classList.remove('floating-details-visible');
					assert.deepStrictEqual({
						dockedIsolation, floatingIsolation, floatingPaneIsolation,
						restoredIsolation: mainWindow.getComputedStyle(content).isolation,
						frameAboveDetails: Number(frame.zIndex) > Number(mainWindow.getComputedStyle(details).zIndex),
						frameColor: frame.borderColor,
						frameWidth: frame.borderWidth,
						pointerEvents: frame.pointerEvents,
						outerFrame: mainWindow.getComputedStyle(card, '::after').content,
					}, {
						dockedIsolation: 'auto', floatingIsolation: 'auto', floatingPaneIsolation: 'isolate', restoredIsolation: 'auto',
						frameAboveDetails: true,
						frameColor: theme.startsWith('hc-') ? 'rgb(171, 205, 239)' : 'rgb(68, 85, 102)',
						frameWidth: '1px', pointerEvents: 'none', outerFrame: 'none',
					}, theme);
					workbench.classList.remove(theme);
				}
			} finally {
				workbench.remove();
			}
		});
	}

	test('keeps the existing connected frame above detached webview overlays while Details float', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench modern-ui-tabs modern-ui-connected-editor-tabs dock-detail-panel markdown-frame-layer-test');
		store.add(toDisposable(() => workbench.remove()));
		Object.assign(workbench.style, { position: 'fixed', left: '0', top: '0', width: '800px', height: '600px' });
		workbench.style.setProperty('--vscode-strokeThickness', '1px');
		workbench.style.setProperty('--vscode-cornerRadius-large', '8px');
		workbench.style.setProperty('--vscode-editorGroupHeader-tabsBorder', '#445566');
		workbench.style.setProperty('--vscode-agentsPanel-border', '#abcdef');
		workbench.style.setProperty('--vscode-editor-background', '#112233');
		workbench.style.setProperty('--vscode-contrastBorder', '#abcdef');
		const grid = appendElement(workbench, 'monaco-grid-view');
		Object.assign(grid.style, { width: '100%', height: '100%' });
		const card = appendElement(grid, 'part editor editor-tabs-multiple floating-details-visible');
		Object.assign(card.style, { position: 'absolute', left: '20px', top: '20px', width: '600px', height: '500px' });
		const content = appendElement(card, 'content');
		Object.assign(content.style, { position: 'absolute', inset: '0' });
		const group = appendElement(content, 'editor-group-container');
		Object.assign(group.style, { width: '100%', height: '100%' });
		const pane = appendElement(group, 'editor-container');
		const overlay = appendElement(workbench, 'webview-overlay-content');
		const bounds = group.getBoundingClientRect();
		Object.assign(overlay.style, {
			position: 'fixed', zIndex: '2', left: `${bounds.left}px`, top: `${bounds.top + 64}px`,
			width: `${bounds.width}px`, height: `${bounds.height - 64}px`,
			backgroundColor: 'var(--vscode-editor-background)',
		});
		const probe = mainWindow.document.createElement('style');
		workbench.appendChild(probe);
		for (const theme of ['vs-dark', 'vs', 'hc-black', 'hc-light']) {
			workbench.classList.add(theme);
			probe.textContent = '';
			const pointerEvents = mainWindow.getComputedStyle(group, '::after').pointerEvents;
			// Make the existing frame hit-testable to verify its paint order, then restore its pointer transparency.
			probe.textContent = '.monaco-workbench.agent-sessions-workbench.modern-ui-tabs.modern-ui-connected-editor-tabs.dock-detail-panel.markdown-frame-layer-test:not(.phone-layout) .part.editor.editor-tabs-multiple:not(.modal-editor-part) > .content .editor-group-container::after { pointer-events: auto; }';
			const points = [[bounds.left + 0.5, bounds.top + 100], [bounds.right - 0.5, bounds.top + 100], [bounds.left + 100, bounds.bottom - 0.5]];
			assert.deepStrictEqual({
				frameAboveWebview: points.map(([x, y]) => mainWindow.document.elementFromPoint(x, y) === group),
				pointerEvents,
				border: mainWindow.getComputedStyle(group, '::after').borderWidth,
				outerFrame: mainWindow.getComputedStyle(card, '::after').content,
				contentIsolation: mainWindow.getComputedStyle(content).isolation,
				paneIsolation: mainWindow.getComputedStyle(pane).isolation,
			}, { frameAboveWebview: [true, true, true], pointerEvents: 'none', border: '1px', outerFrame: 'none', contentIsolation: 'auto', paneIsolation: 'isolate' }, theme);
			probe.textContent = '';
			workbench.classList.remove(theme);
		}
		card.classList.add('modal-editor-part');
		assert.strictEqual(mainWindow.getComputedStyle(pane).isolation, 'auto');
	});

	test('constrains the Browser navbar to the editor header height', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench dock-detail-panel');
		workbench.style.setProperty('--vscode-spacing-size40', '4px');
		workbench.style.setProperty('--vscode-spacing-size280', '28px');
		workbench.style.setProperty('--vscode-spacing-size320', '32px');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');

		const editorPart = appendElement(workbench, 'part editor');
		const editorContent = appendElement(editorPart, 'content');
		const editorGroupContainer = appendElement(editorContent, 'editor-group-container');
		const browserRoot = appendElement(editorGroupContainer, 'browser-root');
		const navbar = appendElement(browserRoot, 'browser-navbar');
		navbar.style.display = 'flex';
		navbar.style.alignItems = 'center';

		const urlContainer = appendElement(navbar, 'browser-url-container');
		urlContainer.style.height = '25px';

		store.add(toDisposable(() => workbench.remove()));
		const defaultHeight = mainWindow.getComputedStyle(navbar).height;
		editorGroupContainer.classList.add('editor-tabs-compact-height');
		const compactHeight = mainWindow.getComputedStyle(navbar).height;

		assert.deepStrictEqual({ defaultHeight, compactHeight }, {
			defaultHeight: '32px',
			compactHeight: '28px',
		});
	});

	test('uses a semantic heading for shared empty states', () => {
		const host = appendElement(mainWindow.document.body, 'agent-sessions-workbench');

		store.add(toDisposable(() => host.remove()));
		const container = renderSessionsEmptyState(host, 'Files', 'Select a file from the Files view');
		const title = container.querySelector<HTMLElement>('.sessions-empty-state-title');
		const description = container.querySelector<HTMLElement>('.sessions-empty-state-description');
		assert.ok(title && description);

		assert.deepStrictEqual({
			contentChildren: Array.from(container.children, element => element.className),
			title: {
				tagName: title.tagName,
				textContent: title.textContent,
				margin: mainWindow.getComputedStyle(title).margin,
			},
			description: {
				textContent: description.textContent,
			},
		}, {
			contentChildren: ['sessions-empty-state-title', 'sessions-empty-state-description'],
			title: {
				tagName: 'H2',
				textContent: 'Files',
				margin: '0px',
			},
			description: {
				textContent: 'Select a file from the Files view',
			},
		});
	});

	test('uses the shared empty-state hierarchy for Browser', () => {
		const workbench = appendElement(mainWindow.document.body, 'monaco-workbench agent-sessions-workbench');
		workbench.style.setProperty('--vscode-spacing-size40', '4px');
		workbench.style.setProperty('--vscode-fontSize-body1', '13px');
		workbench.style.setProperty('--vscode-fontWeight-regular', '400');
		workbench.style.setProperty('--vscode-fontWeight-semiBold', '600');
		workbench.style.setProperty('--vscode-foreground', 'rgb(204, 204, 204)');
		workbench.style.setProperty('--vscode-descriptionForeground', 'rgb(157, 157, 157)');

		const editorPart = appendElement(workbench, 'part editor');
		const browserRoot = appendElement(editorPart, 'browser-root');

		store.add(toDisposable(() => workbench.remove()));
		const container = createBrowserWelcome('Browser', 'Use Add Element to Chat to reference UI elements in chat prompts.');
		browserRoot.appendChild(container);

		const content = container.querySelector<HTMLElement>('.browser-welcome-content');
		const icon = content?.querySelector<HTMLElement>('.browser-welcome-icon');
		const title = content?.querySelector<HTMLElement>('.browser-welcome-title');
		const subtitle = content?.querySelector<HTMLElement>('.browser-welcome-subtitle');
		assert.ok(content && icon && title && subtitle);

		const contentStyle = mainWindow.getComputedStyle(content);
		const titleStyle = mainWindow.getComputedStyle(title);
		const subtitleStyle = mainWindow.getComputedStyle(subtitle);

		assert.deepStrictEqual({
			containerChildren: Array.from(container.children, element => element.className),
			contentChildren: Array.from(content.children, element => element.className),
			gap: contentStyle.gap,
			iconDisplay: mainWindow.getComputedStyle(icon).display,
			title: {
				tagName: title.tagName,
				textContent: title.textContent,
				color: titleStyle.color,
				fontSize: titleStyle.fontSize,
				fontWeight: titleStyle.fontWeight,
				margin: titleStyle.margin,
				padding: titleStyle.padding,
			},
			subtitle: {
				textContent: subtitle.textContent,
				color: subtitleStyle.color,
				fontSize: subtitleStyle.fontSize,
				fontWeight: subtitleStyle.fontWeight,
				margin: subtitleStyle.margin,
				padding: subtitleStyle.padding,
			},
		}, {
			containerChildren: ['browser-welcome-content'],
			contentChildren: ['browser-welcome-icon', 'browser-welcome-title', 'browser-welcome-subtitle'],
			gap: '4px',
			iconDisplay: 'none',
			title: {
				tagName: 'H2',
				textContent: 'Browser',
				color: 'rgb(204, 204, 204)',
				fontSize: '13px',
				fontWeight: '600',
				margin: '0px',
				padding: '0px',
			},
			subtitle: {
				textContent: 'Use Add Element to Chat to reference UI elements in chat prompts.',
				color: 'rgb(157, 157, 157)',
				fontSize: '13px',
				fontWeight: '400',
				margin: '0px',
				padding: '0px',
			},
		});
	});

});
