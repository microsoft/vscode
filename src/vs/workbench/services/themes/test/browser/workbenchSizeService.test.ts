/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { cloneGlobalStylesheets, createStyleSheet } from '../../../../../base/browser/domStylesheets.js';
import { OverlayLayoutElement } from '../../../../../base/browser/overlayLayoutElement.js';
import { Button, unthemedButtonStyles } from '../../../../../base/browser/ui/button/button.js';
import { InputBox, unthemedInboxStyles } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { agentsPanelsCornerRadius, agentsPanelsSpacing, agentsToolsPanelCornerRadius, getSizeRegistry, panelsSpacing, primarySideBarCornerRadius, toolsPanelCornerRadius, editorAreaCornerRadius, agentsChatPanelsCornerRadius } from '../../../../../platform/theme/common/sizeRegistry.js';
import { SIZE_CUSTOMIZATIONS_SETTING } from '../../../../../platform/theme/common/sizeService.js';
import { TestColorTheme, TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { PartOverlayCorners } from '../../../../browser/part.js';
import { WorkbenchSizeService } from '../../browser/workbenchSizeService.js';
import { generateColorThemeCSS } from '../../browser/colorThemeCss.js';
import { getFloatingEditorVerticalMargins, getFloatingPaneCompositeHorizontalMargins, getFloatingPanelOuterMargin, Parts, Position } from '../../../layout/browser/layoutService.js';
import { TestLayoutService } from '../../../../test/browser/workbenchTestServices.js';
import '../../common/themeConfiguration.js';
import '../../../../browser/media/floatingPanels.css';
import '../../../../browser/media/part.css';
import '../../../../contrib/modernUI/browser/media/editorBorder.css';
import '../../../../contrib/modernUI/browser/media/roundedCorners.css';
import '../../../../../base/browser/ui/dialog/dialog.css';
import '../../../../../platform/quickinput/browser/media/quickInput.css';
import { registerTestIframe } from '../../../../../base/test/browser/testWindow.js';

suite('WorkbenchSizeService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const theme = new TestColorTheme();

	function createService(value: unknown = {}) {
		const configuration = new TestConfigurationService({ workbench: { sizeCustomizations: value } });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const log = store.add(new class extends NullLogService {
			readonly warnings: string[] = [];
			override warn(message: string): void { this.warnings.push(message); }
		}());
		const service = store.add(new WorkbenchSizeService(configuration, log));
		return { service, configuration, log };
	}

	test('registers the size customizations setting', () => {
		const property = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties()[SIZE_CUSTOMIZATIONS_SETTING];
		assert.deepStrictEqual({ type: property.type, default: property.default, allOf: property.allOf }, {
			type: 'object', default: {}, allOf: [{ $ref: 'vscode://schemas/size-customizations' }],
		});
	});

	for (const value of [null, [], '3px', 3]) {
		test(`rejects a non-object customization value ${JSON.stringify(value)}`, () => {
			const { service, log } = createService(value);
			assert.deepStrictEqual({ radius: service.getSize(toolsPanelCornerRadius, theme)?.value, warnings: log.warnings.length }, {
				radius: 8, warnings: 1,
			});
		});
	}

	test('rejects invalid and internal overrides explicitly while applying valid entries', () => {
		const { service, log } = createService({
			'panels.cornerRadius': 5,
			'toolsPanel.cornerRadius': 0,
			'primarySideBar.cornerRadius': -1,
			'secondarySideBar.cornerRadius': 9,
			'editorArea.cornerRadius': 1.5,
			'agentsWindow.chatPanels.cornerRadius': '2px',
			'activityBar.cornerRadius': NaN,
			'cornerRadius.large': 0,
			'default.cornerRadius': 0,
			'spacing.size40': 0,
			'unknown.size': 1,
		});
		assert.deepStrictEqual({
			values: [toolsPanelCornerRadius, primarySideBarCornerRadius, editorAreaCornerRadius, agentsChatPanelsCornerRadius].map(id => service.getSize(id, theme)?.value),
			warnings: log.warnings.length,
			attribution: log.warnings.every(message => message.includes(SIZE_CUSTOMIZATIONS_SETTING)),
		}, {
			values: [0, 5, 5, 5], warnings: 9, attribution: true,
		});
	});

	test('removing a component override restores the current role rather than a cached default', async () => {
		const { service, configuration } = createService({ 'panels.cornerRadius': 6, 'primarySideBar.cornerRadius': 2 });
		const values: number[] = [];
		store.add(service.onDidChangeSizes(() => values.push(service.getSize(primarySideBarCornerRadius, theme)!.value)));
		for (const value of [{ 'panels.cornerRadius': 3 }, {}]) {
			await configuration.setUserConfiguration(SIZE_CUSTOMIZATIONS_SETTING, value);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === SIZE_CUSTOMIZATIONS_SETTING,
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([SIZE_CUSTOMIZATIONS_SETTING]),
				change: { keys: [SIZE_CUSTOMIZATIONS_SETTING], overrides: [] },
			});
		}
		assert.deepStrictEqual(values, [3, 8]);
	});

	test('removed page and widget customizations are rejected without restyling controls or pop-ups', () => {
		const removed = {
			'pages.cornerRadius': 0,
			'controls.cornerRadius': 0,
			'buttons.cornerRadius': 0,
			'inputs.cornerRadius': 0,
			'popups.cornerRadius': 0,
			'menus.cornerRadius': 0,
			'hovers.cornerRadius': 0,
			'dialogs.cornerRadius': 0,
		};
		const { service, log } = createService({ ...removed, 'panels.cornerRadius': 0 });
		const sheet = createStyleSheet(undefined, undefined, store.add(new DisposableStore()));
		sheet.textContent = generateColorThemeCSS(theme, '.panel-only-size-test', undefined, undefined, service).code;
		const widgets = ['modern-ui', 'agent-sessions-workbench'].map(windowClass => {
			const root = append(document.body, $(`.monaco-workbench.panel-only-size-test.${windowClass}`));
			store.add(toDisposable(() => root.remove()));
			const button = store.add(new Button(root, { ...unthemedButtonStyles, title: '' }));
			button.label = 'Test';
			const input = store.add(new InputBox(root, undefined, { inputBoxStyles: unthemedInboxStyles }));
			const dialog = append(root, $('.monaco-dialog-box'));
			const palette = append(root, $('.quick-input-widget'));
			return [button.element, input.element, dialog, palette].map(element => getWindow(element).getComputedStyle(element).borderRadius);
		});
		assert.deepStrictEqual({
			warnings: log.warnings.length,
			stillRegistered: Object.keys(removed).filter(id => service.getSize(id, theme) !== undefined),
			panels: service.getSize(toolsPanelCornerRadius, theme)?.value,
			widgets,
		}, {
			warnings: 8, stillRegistered: [], panels: 0,
			widgets: [['4px', '4px', '8px', '8px'], ['4px', '4px', '12px', '12px']],
		});
	});

	test('Agents window controls inherit shared defaults without changing editor-window overrides', () => {
		const { service } = createService({
			'panels.cornerRadius': 6,
			'toolsPanel.cornerRadius': 0,
			'agentsWindow.panels.cornerRadius': 2,
			'agentsWindow.toolsPanel.cornerRadius': 3,
			'panels.spacing': 8,
			'agentsWindow.panels.spacing': 12,
		});
		assert.deepStrictEqual([
			toolsPanelCornerRadius, agentsPanelsCornerRadius, agentsToolsPanelCornerRadius, agentsChatPanelsCornerRadius, panelsSpacing, agentsPanelsSpacing,
		].map(id => service.getSize(id, theme)?.value), [0, 2, 3, 2, 8, 12]);
	});

	test('rejects invalid spacing overrides without changing valid shared spacing', () => {
		const results = [-1, 17, 1.5, '8px', NaN].map(value => {
			const { service, log } = createService({ 'panels.spacing': 8, 'agentsWindow.panels.spacing': value });
			return { spacing: service.getSize(agentsPanelsSpacing, theme)?.value, warnings: log.warnings.length };
		});
		assert.deepStrictEqual(results, Array.from({ length: 5 }, () => ({ spacing: 8, warnings: 1 })));
	});

	for (const spacing of [0, 1, 4, 8, 16]) {
		test(`matches the rendered ${spacing}px editor gap to numeric content insets while preserving outer gutters`, () => {
			const { service } = createService({ 'panels.spacing': spacing });
			const sheet = createStyleSheet(undefined, undefined, store.add(new DisposableStore()));
			sheet.textContent = generateColorThemeCSS(theme, '.semantic-spacing-test', undefined, undefined, service).code;
			const root = append(document.body, $('.monaco-workbench.semantic-spacing-test.modern-ui.floating-panels.noactivitybar.nopanel'));
			store.add(toDisposable(() => root.remove()));
			const grid = append(root, $('.monaco-grid-view'));
			grid.style.display = 'flex';
			const sidebar = append(grid, $('.part.sidebar.left.floating-part-outer-left'));
			const editor = append(grid, $('.part.editor'));
			for (const element of [sidebar, editor]) {
				element.style.width = '200px';
				element.style.height = '100px';
				element.style.flexShrink = '0';
			}
			const layout = new class extends TestLayoutService {
				override isFloatingPanelsEnabled() { return true; }
				override getPanelSpacing() { return this.isModernUICompact() ? 0 : service.getSize(panelsSpacing, theme)!.value; }
				override getPanelPosition() { return Position.BOTTOM; }
				override isVisible(part: Parts) { return [Parts.TITLEBAR_PART, Parts.SIDEBAR_PART, Parts.EDITOR_PART, Parts.STATUSBAR_PART].includes(part); }
			}();
			const read = () => ({
				visualGap: editor.getBoundingClientRect().left - sidebar.getBoundingClientRect().right,
				contentInsets: getFloatingPaneCompositeHorizontalMargins(layout, Parts.EDITOR_PART),
				outerGutter: getFloatingPanelOuterMargin(layout),
				sidebarBottom: getWindow(root).getComputedStyle(sidebar).marginBottom,
				editorVertical: getFloatingEditorVerticalMargins(layout, getWindow(root)),
			});
			const regular = read();
			root.classList.add('modern-ui-compact');
			layout.isModernUICompact = () => true;
			assert.deepStrictEqual({ regular, compact: read() }, {
				regular: { visualGap: spacing, contentInsets: { left: spacing, right: 4 }, outerGutter: 4, sidebarBottom: '4px', editorVertical: { top: 0, bottom: 4 } },
				compact: { visualGap: 0, contentInsets: { left: 0, right: 0 }, outerGutter: 0, sidebarBottom: '0px', editorVertical: { top: 0, bottom: 0 } },
			});
		});
	}

	for (const spacing of [0, 1, 4, 8, 16]) {
		for (const sashSize of [2, 4, 20]) {
			test(`keeps ${sashSize}px workbench sashes thin and centered within a ${spacing}px gap`, () => {
				const { service } = createService({ 'panels.spacing': spacing });
				const sheet = createStyleSheet(undefined, undefined, store.add(new DisposableStore()));
				sheet.textContent = generateColorThemeCSS(theme, '.semantic-sash-test', undefined, undefined, service).code;
				const root = append(document.body, $('.monaco-workbench.semantic-sash-test.floating-panels'));
				root.style.setProperty('--vscode-sash-size', `${sashSize}px`);
				root.style.setProperty('--vscode-sash-hover-size', '4px');
				root.style.cssText += '; position: relative; width: 400px; height: 400px;';
				store.add(toDisposable(() => root.remove()));
				const vertical = append(root, $('.monaco-sash.vertical'));
				vertical.style.cssText = `left: ${100 - sashSize / 2}px; top: 0; height: 100px;`;
				const horizontal = append(root, $('.monaco-sash.horizontal'));
				horizontal.style.cssText = `top: ${100 - sashSize / 2}px; left: 0; width: 100px;`;
				const targetWindow = getWindow(root);
				const read = () => [vertical, horizontal].map((sash, index) => {
					const css = targetWindow.getComputedStyle(sash);
					const hover = targetWindow.getComputedStyle(sash, '::before');
					const hit = Number.parseFloat(index === 0 ? css.width : css.height);
					const hoverSize = Number.parseFloat(index === 0 ? hover.width : hover.height);
					const hoverOffset = Number.parseFloat(index === 0 ? hover.left : hover.top);
					const rect = sash.getBoundingClientRect();
					const rootRect = root.getBoundingClientRect();
					return {
						hit, hoverSize,
						hoverCenterOffset: hoverOffset + hoverSize / 2 - hit / 2,
						center: (index === 0 ? rect.left - rootRect.left : rect.top - rootRect.top) + hit / 2,
					};
				});
				const regular = read();
				root.classList.add('modern-ui-compact');
				assert.deepStrictEqual({ regular, compact: read() }, {
					regular: Array.from({ length: 2 }, () => ({
						hit: sashSize, hoverSize: 4, hoverCenterOffset: 0, center: 100 + spacing / 2,
					})),
					compact: Array.from({ length: 2 }, () => ({
						hit: sashSize, hoverSize: 4, hoverCenterOffset: 0, center: 100,
					})),
				});
			});
		}
	}

	for (const radius of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
		test(`renders ${radius}px semantic sizes without changing primitives or compact seams`, () => {
			const { service } = createService({ 'panels.cornerRadius': radius, 'primarySideBar.cornerRadius': 2 });
			const style = createStyleSheet(undefined, undefined, store.add(new DisposableStore()));
			style.textContent = generateColorThemeCSS(theme, '.semantic-size-test', undefined, undefined, service).code;
			const root = append(document.body, $('.monaco-workbench.semantic-size-test.modern-ui.floating-panels'));
			store.add(toDisposable(() => root.remove()));
			const grid = append(root, $('.monaco-grid-view'));
			const sidebar = append(grid, $('.part.sidebar.left'));
			const panel = append(grid, $('.part.panel'));
			const editor = append(grid, $('.part.editor'));
			const content = append(editor, $('.content'));
			const rail = append(grid, $('.part.activitybar.left'));
			const read = () => [sidebar, panel, editor, content, rail].map(element => {
				const css = getWindow(element).getComputedStyle(element);
				return [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomRightRadius, css.borderBottomLeftRadius];
			});
			const regular = read();
			const primitive = getWindow(root).getComputedStyle(root).getPropertyValue('--vscode-cornerRadius-large').trim();
			root.classList.add('modern-ui-compact');
			const compact = read();
			root.classList.remove('modern-ui-compact');
			const newlyAddedPanel = append(grid, $('.part.panel'));
			assert.deepStrictEqual({ regular, compact, primitive, newPanel: getWindow(root).getComputedStyle(newlyAddedPanel).borderRadius }, {
				regular: [
					['0px', '2px', '2px', '0px'],
					[`${radius}px`, `${radius}px`, `${radius}px`, `${radius}px`],
					[`${radius}px`, `${radius}px`, `${radius}px`, `${radius}px`],
					[`${radius}px`, `${radius}px`, `${radius}px`, `${radius}px`],
					['2px', '0px', '0px', '2px'],
				],
				compact: Array.from({ length: 5 }, () => ['0px', '0px', '0px', '0px']),
				primitive: '8px',
				newPanel: `${radius}px`,
			});
		});
	}

	test('cloned auxiliary-window styles receive initial sizes and live updates', async () => {
		const { service, configuration } = createService({ 'panels.cornerRadius': 3 });
		const style = createStyleSheet(undefined, undefined, store.add(new DisposableStore()));
		const update = () => style.textContent = generateColorThemeCSS(theme, '.semantic-auxiliary-test', undefined, undefined, service).code
			+ '.semantic-auxiliary-test .part.editor { border-radius: var(--vscode-editorArea-cornerRadius); }';
		update();
		store.add(service.onDidChangeSizes(update));
		const frame = append(document.body, $<HTMLIFrameElement>('iframe'));
		store.add(toDisposable(() => frame.remove()));
		store.add(registerTestIframe(frame));
		const targetWindow = frame.contentWindow;
		assert.ok(targetWindow);
		store.add(cloneGlobalStylesheets(targetWindow));
		const root = $('.monaco-workbench.semantic-auxiliary-test');
		targetWindow.document.body.appendChild(root);
		root.classList.add('modern-ui', 'floating-panels');
		const part = append(append(root, $('.monaco-grid-view')), $('.part.editor'));
		part.style.cssText = 'position: relative; width: 200px; height: 200px; border: 1px solid transparent;';
		const anchor = append(part, $('.notebook-anchor'));
		anchor.style.cssText = 'position: absolute; inset: 0;';
		const overlay = append(root, $('.notebookOverlay'));
		const themes = new TestThemeService(theme);
		store.add(themes._onThemeChange);
		store.add(themes._onFileIconThemeChange);
		store.add(themes._onProductIconThemeChange);
		const corners = store.add(new PartOverlayCorners(overlay, service, themes));
		corners.setAnchor(anchor, part);
		const initial = targetWindow.getComputedStyle(root).getPropertyValue('--vscode-toolsPanel-cornerRadius').trim();
		const initialClipping = overlay.style.borderRadius;
		await configuration.setUserConfiguration(SIZE_CUSTOMIZATIONS_SETTING, { 'panels.cornerRadius': 5 });
		configuration.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: key => key === SIZE_CUSTOMIZATIONS_SETTING,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([SIZE_CUSTOMIZATIONS_SETTING]),
			change: { keys: [SIZE_CUSTOMIZATIONS_SETTING], overrides: [] },
		});
		await new Promise<void>(resolve => {
			const observer = new (getWindow(root).MutationObserver)(() => {
				observer.disconnect();
				resolve();
			});
			store.add(toDisposable(() => observer.disconnect()));
			observer.observe(targetWindow.document.head, { subtree: true, childList: true, characterData: true });
		});
		await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
		assert.deepStrictEqual({ initial, updated: targetWindow.getComputedStyle(root).getPropertyValue('--vscode-toolsPanel-cornerRadius').trim(), initialClipping, clipping: overlay.style.borderRadius }, {
			initial: '3px', updated: '5px', initialClipping: '2px', clipping: '4px',
		});
	});

	test('registry defaults remain independent of user customizations', () => {
		const { service } = createService({ 'panels.cornerRadius': 0 });
		assert.deepStrictEqual([
			service.getSize(toolsPanelCornerRadius, theme)?.value,
			getSizeRegistry().resolveDefaultSize(toolsPanelCornerRadius, theme)?.value,
		], [0, 8]);
	});

	test('notebook overlays follow live editor corners, preserve title and split seams, and release modal clipping', async () => {
		const { service, configuration } = createService({ 'editorArea.cornerRadius': 0 });
		const themeService = new TestThemeService(theme);
		store.add(themeService._onThemeChange);
		store.add(themeService._onFileIconThemeChange);
		store.add(themeService._onProductIconThemeChange);
		const sheet = createStyleSheet(undefined, undefined, store.add(new DisposableStore()));
		const update = () => sheet.textContent = generateColorThemeCSS(themeService.getColorTheme(), '.notebook-size-test', undefined, undefined, service).code;
		update();
		store.add(service.onDidChangeSizes(update));
		store.add(themeService.onDidColorThemeChange(update));
		const root = append(document.body, $('.monaco-workbench.modern-ui.floating-panels.notebook-size-test'));
		root.style.cssText = 'position: fixed; left: 0; top: 0; width: 202px; height: 202px; --vscode-strokeThickness: 1px;';
		store.add(toDisposable(() => root.remove()));
		const editor = append(append(root, $('.monaco-grid-view')), $('.part.editor'));
		editor.style.cssText = 'position: relative; width: 202px; height: 202px; border: 1px solid transparent;';
		const anchor = append(editor, $('.notebook-anchor'));
		anchor.style.cssText = 'position: absolute; top: 40px; left: 0; right: 0; bottom: 0;';
		const overlay = store.add(new OverlayLayoutElement());
		overlay.content.classList.add('notebookOverlay');
		append(root, overlay.root);
		const corners = store.add(new PartOverlayCorners(overlay.content, service, themeService));
		overlay.setAnchorElement(anchor, { clippingContainer: editor });
		corners.setAnchor(anchor, editor);
		const read = () => {
			const css = getWindow(overlay.content).getComputedStyle(overlay.content);
			return [css.borderTopLeftRadius, css.borderTopRightRadius, css.borderBottomRightRadius, css.borderBottomLeftRadius];
		};
		const actual = [read()];
		for (const value of [{ 'editorArea.cornerRadius': 1 }, { 'editorArea.cornerRadius': 5 }, {}]) {
			await configuration.setUserConfiguration(SIZE_CUSTOMIZATIONS_SETTING, value);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === SIZE_CUSTOMIZATIONS_SETTING, source: ConfigurationTarget.USER,
				affectedKeys: new Set([SIZE_CUSTOMIZATIONS_SETTING]), change: { keys: [SIZE_CUSTOMIZATIONS_SETTING], overrides: [] },
			});
			actual.push(read());
		}
		anchor.style.right = '100px';
		corners.setAnchor(anchor, editor);
		const split = read();
		root.classList.add('modern-ui-compact');
		await new Promise<void>(resolve => getWindow(root).setTimeout(resolve, 0));
		const compact = read();
		root.classList.remove('modern-ui-compact');
		overlay.content.classList.add('notebook-overlay-modal');
		corners.setAnchor(anchor, undefined);
		assert.deepStrictEqual({ actual, split, compact, modal: { inline: overlay.content.style.borderRadius, radii: read() } }, {
			actual: [0, 0, 4, 7].map(value => ['0px', '0px', `${value}px`, `${value}px`]),
			split: ['0px', '0px', '0px', '7px'],
			compact: ['0px', '0px', '0px', '0px'],
			modal: { inline: '', radii: ['8px', '8px', '8px', '8px'] },
		});
	});
});
