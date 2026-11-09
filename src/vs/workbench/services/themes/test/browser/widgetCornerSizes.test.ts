/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $, append, getWindow } from '../../../../../base/browser/dom.js';
import { createStyleSheet } from '../../../../../base/browser/domStylesheets.js';
import { ActionBar } from '../../../../../base/browser/ui/actionbar/actionbar.js';
import { Button, ButtonWithDropdown, unthemedButtonStyles } from '../../../../../base/browser/ui/button/button.js';
import { InputBox, unthemedInboxStyles } from '../../../../../base/browser/ui/inputbox/inputBox.js';
import { Menu, unthemedMenuStyles } from '../../../../../base/browser/ui/menu/menu.js';
import { Radio } from '../../../../../base/browser/ui/radio/radio.js';
import { Switch } from '../../../../../base/browser/ui/toggle/switch.js';
import { Checkbox, Toggle, unthemedToggleStyles } from '../../../../../base/browser/ui/toggle/toggle.js';
import { Action } from '../../../../../base/common/actions.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { defaultCheckboxStyles } from '../../../../../platform/theme/browser/defaultStyles.js';
import { buttonsCornerRadius, controlsCornerRadius, dialogsCornerRadius, hoversCornerRadius, inputsCornerRadius, menusCornerRadius, popupsCornerRadius } from '../../../../../platform/theme/common/sizeRegistry.js';
import { SIZE_CUSTOMIZATIONS_SETTING } from '../../../../../platform/theme/common/sizeService.js';
import { ColorScheme } from '../../../../../platform/theme/common/theme.js';
import { TestColorTheme } from '../../../../../platform/theme/test/common/testThemeService.js';
import { generateColorThemeCSS } from '../../browser/colorThemeCss.js';
import { WorkbenchSizeService } from '../../browser/workbenchSizeService.js';
import '../../../../../base/browser/ui/selectBox/selectBox.css';
import '../../../../../base/browser/ui/selectBox/selectBoxCustom.css';
import '../../../../../base/browser/ui/dialog/dialog.css';
import '../../../../../base/browser/ui/findinput/findInput.css';
import '../../../../../base/browser/ui/icons/iconSelectBox.css';
import '../../../../../base/browser/ui/menu/menubar.css';
import '../../../../../base/browser/ui/dropdown/dropdown.css';
import '../../../../../platform/actions/browser/menuEntryActionViewItem.css';
import '../../../../../platform/hover/browser/hover.css';
import '../../../../../platform/quickinput/browser/media/quickInput.css';
import '../../../../../platform/actionWidget/browser/actionWidget.css';
import '../../../../../platform/actionWidget/browser/tabbedActionListWidget.css';
import '../../../../../editor/contrib/hover/browser/hover.css';
import '../../../../browser/media/style.css';
import '../../../../contrib/modernUI/browser/media/roundedCorners.css';
import '../../../../contrib/extensions/browser/media/extension.css';
import '../../../../contrib/extensions/browser/media/extensionEditor.css';
import '../../../../contrib/preferences/browser/media/settingsEditor2.css';
import '../../../../contrib/chat/browser/widget/media/chat.css';
// eslint-disable-next-line local/code-import-patterns, local/code-layering -- Exercise browser chrome CSS without creating a native browser view.
import '../../../../contrib/browserView/electron-browser/media/browser.css';
// eslint-disable-next-line local/code-import-patterns -- Verify the shared theme output against Agents-specific widget overrides.
import '../../../../../sessions/browser/media/style.css';
import '../../../../contrib/sessionChanges/browser/media/changesView.css';
import '../../../../contrib/sessionChanges/browser/media/createPullRequest.css';
// eslint-disable-next-line local/code-import-patterns -- Exercise the Agents-specific radio and button overrides.
import '../../../../../sessions/contrib/chat/browser/media/runScriptAction.css';
import '../../../../contrib/sessions/browser/chat/media/chatInput.css';

suite('Widget corner sizes', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidgets(customizations: Record<string, number> = {}, agents = false, scheme = ColorScheme.DARK) {
		const configuration = new TestConfigurationService({ [SIZE_CUSTOMIZATIONS_SETTING]: customizations });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const log = store.add(new class extends NullLogService {
			readonly warnings: string[] = [];
			override warn(message: string): void { this.warnings.push(message); }
		}());
		const sizes = store.add(new WorkbenchSizeService(configuration, log));
		const theme = new TestColorTheme({}, scheme);
		const sheet = createStyleSheet(undefined, undefined, store.add(new DisposableStore()));
		const updateCSS = () => sheet.textContent = generateColorThemeCSS(theme, '.widget-size-test', undefined, undefined, sizes).code;
		updateCSS();
		store.add(sizes.onDidChangeSizes(updateCSS));
		const root = append(document.body, $('.monaco-workbench.widget-size-test'));
		root.classList.add(agents ? 'agent-sessions-workbench' : 'modern-ui', 'modern-ui-tabs');
		if (scheme === ColorScheme.HIGH_CONTRAST_DARK || scheme === ColorScheme.HIGH_CONTRAST_LIGHT) {
			root.classList.add(scheme === ColorScheme.HIGH_CONTRAST_DARK ? 'hc-black' : 'hc-light');
		}
		store.add(toDisposable(() => root.remove()));
		const button = store.add(new Button(root, { ...unthemedButtonStyles, title: '' }));
		button.label = 'Test button';
		button.setAriaLabel('Test button');
		const split = store.add(new ButtonWithDropdown(root, {
			...unthemedButtonStyles, title: '', actions: [], contextMenuProvider: { showContextMenu: () => { } },
		}));
		split.label = 'Split button';
		const input = store.add(new InputBox(root, undefined, { inputBoxStyles: unthemedInboxStyles, ariaLabel: 'Test input' }));
		input.value = 'Input';
		const select = append(root, $<HTMLSelectElement>('select.monaco-select-box'));
		const options = append(root, $('.monaco-select-box-dropdown-container.visible'));
		const menuHost = append(root, $('.context-view'));
		const action = store.add(new Action('test-action', 'Test action'));
		const menu = store.add(new Menu(menuHost, [action], { ariaLabel: 'Test menu' }, unthemedMenuStyles));
		const actionPicker = append(root, $('.action-widget'));
		const hover = append(root, $('.monaco-hover.workbench-hover'));
		const pointerHover = append(root, $('.monaco-hover.workbench-hover.with-pointer'));
		const editor = append(root, $('.monaco-editor'));
		const editorHover = append(editor, $('.monaco-resizable-hover'));
		const editorHoverContents = append(editorHover, $('.monaco-hover'));
		const dialog = append(root, $('.monaco-dialog-box'));
		const palette = append(root, $('.quick-input-widget'));
		const paletteHeader = append(palette, $('.quick-input-header'));
		const toggle = store.add(new Toggle({ ...unthemedToggleStyles, title: 'Test toggle', isChecked: false }));
		append(root, toggle.domNode);
		const checkbox = store.add(new Checkbox('Test checkbox', false, defaultCheckboxStyles));
		append(root, checkbox.domNode);
		const radio = store.add(new Radio({ ariaLabel: 'Test radio', items: [{ text: 'First' }, { text: 'Middle' }, { text: 'Last' }] }));
		append(root, radio.domNode);
		const segmented = store.add(new Radio({ ariaLabel: 'Test segments', className: 'segmented', items: [{ text: 'One' }, { text: 'Two' }] }));
		append(root, segmented.domNode);
		const toolbar = store.add(new ActionBar(root));
		toolbar.push(store.add(new Action('test-toolbar', 'Test toolbar action', 'codicon codicon-add')), { icon: true, label: false });
		const toolbarLabel = toolbar.domNode.querySelector<HTMLElement>('.action-label')!;
		const paletteInput = store.add(new InputBox(append(paletteHeader, $('.quick-input-filter')), undefined, { inputBoxStyles: unthemedInboxStyles }));
		const paletteToolbar = store.add(new ActionBar(paletteHeader));
		const paletteToggle = store.add(new Toggle({ ...unthemedToggleStyles, title: 'Test palette toggle', isChecked: false }));
		append(paletteToolbar.domNode, paletteToggle.domNode);
		const actionFilter = append(actionPicker, $<HTMLInputElement>('input.action-list-filter-input'));
		const iconSelector = append(append(append(root, $('.icon-select-box')), $('.icon-select-icons-container')), $('.icon-container'));
		const menubarTitle = append(append(append(root, $('.menubar')), $('.menubar-menu-button')), $('.menubar-menu-title'));
		const pillSwitch = store.add(new Switch({ ariaLabel: 'Test switch' }));
		append(root, pillSwitch.domNode);
		const pill = append(root, $('.test-pill'));
		pill.style.borderRadius = 'var(--vscode-cornerRadius-circle)';
		const tab = append(root, $('.test-tab'));
		tab.style.borderRadius = 'var(--vscode-cornerRadius-small)';
		const radius = (element: HTMLElement) => getWindow(element).getComputedStyle(element).borderRadius;
		const snapshot = () => ({
			button: radius(button.element),
			split: [radius(split.primaryButton.element), radius(split.dropdownButton.element)],
			input: [radius(input.element), radius(input.inputElement)],
			select: radius(select),
			options: radius(options),
			menu: [radius(menuHost), radius(menuHost.querySelector<HTMLElement>('.monaco-menu')!), radius(menu.getContainer())],
			actionPicker: radius(actionPicker),
			hovers: [hover, pointerHover, editorHover, editorHoverContents].map(radius),
			dialog: radius(dialog),
			palette: radius(palette),
			paletteHeader: agents ? radius(paletteHeader) : undefined,
			pill: radius(pill),
			tab: radius(tab),
		});
		const controlSnapshot = () => ({
			toggle: radius(toggle.domNode),
			checkbox: radius(checkbox.domNode),
			radio: radio.optionElements.map(radius),
			segmented: [radius(segmented.domNode), ...segmented.optionElements.map(radius), radius(segmented.domNode.querySelector<HTMLElement>('.monaco-radio-selection')!)],
			toolbar: radius(toolbarLabel),
			paletteInput: [radius(paletteInput.element), radius(paletteInput.inputElement)],
			paletteToggle: radius(paletteToggle.domNode),
			actionFilter: radius(actionFilter),
			iconSelector: radius(iconSelector),
			menubarTitle: radius(menubarTitle),
			switch: [radius(pillSwitch.domNode), radius(pillSwitch.domNode.querySelector<HTMLElement>('.monaco-switch-thumb')!)],
			menuItem: radius(menuHost.querySelector<HTMLElement>('.action-menu-item')!),
		});
		const update = async (value: Record<string, number>) => {
			await configuration.setUserConfiguration(SIZE_CUSTOMIZATIONS_SETTING, value);
			configuration.onDidChangeConfigurationEmitter.fire({
				affectsConfiguration: key => key === SIZE_CUSTOMIZATIONS_SETTING,
				source: ConfigurationTarget.USER,
				affectedKeys: new Set([SIZE_CUSTOMIZATIONS_SETTING]),
				change: { keys: [SIZE_CUSTOMIZATIONS_SETTING], overrides: [] },
			});
		};
		return { root, sizes, theme, log, button, input, toggle, checkbox, radio, segmented, toolbarLabel, controlSnapshot, snapshot, update };
	}

	for (const agents of [false, true]) {
		for (const scheme of [ColorScheme.LIGHT, ColorScheme.DARK, ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT]) {
			for (const radius of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
				test(`applies ${radius}px widget corners with Agents ${agents} and scheme ${scheme}`, () => {
					const { snapshot, controlSnapshot } = createWidgets({ 'controls.cornerRadius': radius, 'popups.cornerRadius': radius }, agents, scheme);
					const all = `${radius}px`;
					assert.deepStrictEqual({ ...snapshot(), controls: controlSnapshot() }, {
						button: all,
						split: [`${all} 0px 0px ${all}`, `0px ${all} ${all} 0px`].map(value => radius === 0 ? '0px' : value),
						input: [all, all],
						select: all,
						options: all,
						menu: [all, all, all],
						actionPicker: all,
						hovers: [all, all, all, all],
						dialog: all,
						palette: all,
						paletteHeader: agents ? all : undefined,
						pill: '9999px',
						tab: '4px',
						controls: {
							toggle: all, checkbox: all,
							radio: [`${all} 0px 0px ${all}`, '0px', `0px ${all} ${all} 0px`].map(value => radius === 0 ? '0px' : value),
							segmented: [all, all, all, all],
							toolbar: all, paletteInput: [all, all], paletteToggle: all,
							actionFilter: all, iconSelector: all, menubarTitle: all,
							switch: ['9999px', '9999px'], menuItem: '6px',
						},
					});
				});
			}
		}

		test(`specific widget values override families, update live and reset with Agents ${agents}`, async () => {
			const { sizes, theme, snapshot, controlSnapshot, update } = createWidgets({}, agents);
			const baseline = snapshot();
			const controlBaseline = controlSnapshot();
			await update({
				'panels.cornerRadius': 0,
				'controls.cornerRadius': 3, 'buttons.cornerRadius': 2, 'inputs.cornerRadius': 1,
				'popups.cornerRadius': 6, 'menus.cornerRadius': 4, 'hovers.cornerRadius': 5, 'dialogs.cornerRadius': 0,
			});
			const customized = snapshot();
			const customizedControls = controlSnapshot();
			const resolved = [controlsCornerRadius, buttonsCornerRadius, inputsCornerRadius, popupsCornerRadius, menusCornerRadius, hoversCornerRadius, dialogsCornerRadius]
				.map(id => ({ value: sizes.getSize(id, theme)?.value, customized: sizes.isCustomized(id) }));
			await update({ 'default.cornerRadius': 0, 'panels.cornerRadius': 0 });
			assert.deepStrictEqual({
				customized: {
					button: customized.button, input: customized.input, menu: customized.menu,
					hovers: customized.hovers, dialog: customized.dialog, palette: customized.palette,
				},
				resolved,
				reset: snapshot(),
				customizedControls,
				resetControls: controlSnapshot(),
			}, {
				customized: { button: '2px', input: ['1px', '1px'], menu: ['4px', '4px', '4px'], hovers: ['5px', '5px', '5px', '5px'], dialog: '0px', palette: '6px' },
				resolved: [3, 2, 1, 6, 4, 5, 0].map(value => ({ value, customized: true })),
				reset: baseline,
				customizedControls: {
					toggle: '3px', checkbox: '3px', radio: ['3px 0px 0px 3px', '0px', '0px 3px 3px 0px'],
					segmented: ['3px', '3px', '3px', '3px'], toolbar: '2px',
					paletteInput: ['1px', '1px'], paletteToggle: '3px', actionFilter: '1px',
					iconSelector: '3px', menubarTitle: '2px', switch: ['9999px', '9999px'], menuItem: '6px',
				},
				resetControls: controlBaseline,
			});
		});

		for (const scheme of [ColorScheme.LIGHT, ColorScheme.DARK, ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT]) {
			test(`feature overrides follow controls and restore their defaults with Agents ${agents} and scheme ${scheme}`, async () => {
				const { root, update } = createWidgets({}, agents, scheme);
				const within = (parent: HTMLElement, ...selectors: string[]) => selectors.reduce((container, selector) => append(container, $(selector)), parent);
				const listActions = within(root, '.extension-list-item', '.details', '.footer', '.monaco-action-bar', '.actions-container');
				const listSplit = append(listActions, $('.action-item.action-dropdown-item'));
				const listLeading = append(listSplit, $('a.action-label.extension-action.label'));
				const listTrailing = within(listSplit, '.monaco-dropdown', 'a.action-label.extension-action.label.dropdown');
				const editorActions = within(root, '.extension-editor', '.header', '.details', '.actions-status-container', '.monaco-action-bar', '.actions-container');
				const editorSplit = append(editorActions, $('.action-item.action-dropdown-item'));
				const editorLeading = append(editorSplit, $('a.action-label.extension-action.label'));
				const editorTrailing = within(editorSplit, '.monaco-dropdown', 'a.action-label.extension-action.label.dropdown');
				const changes = within(root, '.changes-view-body', '.chat-editing-session-actions.outside-card');
				const changesSplit = store.add(new ButtonWithDropdown(changes, {
					...unthemedButtonStyles, secondary: true, title: '', actions: [], contextMenuProvider: { showContextMenu: () => { } },
				}));
				changesSplit.label = 'Test changes action';
				const pullRequestInput = store.add(new InputBox(append(root, $('.create-pull-request-widget')), undefined, { inputBoxStyles: unthemedInboxStyles }));
				const settingCheckbox = store.add(new Checkbox('Test setting', false, defaultCheckboxStyles));
				settingCheckbox.domNode.classList.add('setting-value-checkbox');
				append(within(root, '.settings-editor', '.settings-body', '.settings-tree-container', '.setting-item-bool'), settingCheckbox.domNode);
				const scriptSection = append(root, $('.run-script-action-section'));
				const scriptRadio = store.add(new Radio({ ariaLabel: 'Test script option', items: [{ text: 'One' }, { text: 'Two' }] }));
				append(scriptSection, scriptRadio.domNode);
				const scriptButton = store.add(new Button(within(root, '.run-script-action-buttons'), { ...unthemedButtonStyles, title: '' }));
				scriptButton.label = 'Run';
				const browserUrl = within(root, '.browser-root', '.browser-url-container');
				const remoteIndicator = append(browserUrl, $('.browser-remote-indicator'));
				const sendButton = within(root, '.interactive-session', '.chat-input-toolbars', '.chat-execute-toolbar', '.monaco-action-bar', '.action-item.chat-submit-button', 'a.action-label');
				const tab = within(root, '.extension-editor', '.body', '.navbar', '.monaco-action-bar', '.actions-container', '.action-item', 'a.action-label');
				const rows = within(root, '.monaco-list', '.monaco-list-row');
				const pickerTab = within(root, '.action-widget', '.tabbed-action-list-tabbar', '.monaco-custom-radio', '.monaco-button');
				const read = (element: HTMLElement) => getWindow(element).getComputedStyle(element).borderRadius;
				const snapshot = () => ({
					list: [read(listLeading), read(listTrailing)],
					editor: [read(editorLeading), read(editorTrailing)],
					changes: [read(changesSplit.primaryButton.element), read(changesSplit.dropdownButton.element)],
					input: [read(pullRequestInput.element), read(pullRequestInput.inputElement)],
					checkbox: read(settingCheckbox.domNode),
					script: [read(scriptRadio.domNode), ...scriptRadio.optionElements.map(read), read(scriptButton.element)],
					browser: [read(browserUrl), read(remoteIndicator)],
					special: [read(sendButton), read(tab), read(rows), read(pickerTab)],
				});
				const baseline = snapshot();
				for (const value of [0, 2, 8]) {
					await update({ 'controls.cornerRadius': value });
					const all = `${value}px`;
					const leading = value ? `${all} 0px 0px ${all}` : all;
					const trailing = value ? `0px ${all} ${all} 0px` : all;
					assert.deepStrictEqual(snapshot(), {
						list: [leading, trailing], editor: [leading, trailing], changes: [leading, trailing],
						input: [all, all], checkbox: all, script: [all, all, all, all],
						browser: [all, leading], special: baseline.special,
					});
				}
				await update({});
				assert.deepStrictEqual(snapshot(), baseline);
			});
		}
	}

	test('keeps host-specific defaults until a widget family is actually customized', () => {
		const modern = createWidgets();
		const agents = createWidgets({}, true);
		const modernDefaults = modern.snapshot();
		const agentsDefaults = agents.snapshot();
		assert.deepStrictEqual({
			modern: { button: modernDefaults.button, input: modernDefaults.input, dialog: modernDefaults.dialog, palette: modernDefaults.palette },
			agents: { button: agentsDefaults.button, input: agentsDefaults.input, dialog: agentsDefaults.dialog, palette: agentsDefaults.palette, hover: agentsDefaults.hovers[0] },
			isCustomized: [buttonsCornerRadius, menusCornerRadius].map(id => agents.sizes.isCustomized(id)),
		}, {
			modern: { button: '4px', input: ['4px', '4px'], dialog: '8px', palette: '8px' },
			agents: { button: '4px', input: ['4px', '4px'], dialog: '12px', palette: '12px', hover: '5px' },
			isCustomized: [false, false],
		});
	});

	test('invalid widget overrides log warnings and do not replace current shapes', async () => {
		const { snapshot, update, log, sizes } = createWidgets();
		const baseline = snapshot();
		await update({
			'controls.cornerRadius': -1, 'buttons.cornerRadius': 9, 'inputs.cornerRadius': 1.5,
			'popups.cornerRadius': NaN, 'menus.cornerRadius': Infinity, 'hovers.cornerRadius': -2, 'dialogs.cornerRadius': 9,
		});
		assert.deepStrictEqual({ shapes: snapshot(), warnings: log.warnings.length, isCustomized: sizes.isCustomized(buttonsCornerRadius) }, {
			shapes: baseline, warnings: 7, isCustomized: false,
		});
	});

	test('button and input leaf overrides leave other control shapes at their built-in defaults', async () => {
		const { controlSnapshot, update } = createWidgets();
		const baseline = controlSnapshot();
		await update({ 'buttons.cornerRadius': 0, 'inputs.cornerRadius': 8 });
		const customized = controlSnapshot();
		await update({});
		assert.deepStrictEqual({ customized, reset: controlSnapshot() }, {
			customized: {
				...baseline, toolbar: '0px', menubarTitle: '0px',
				paletteInput: ['8px', '8px'], actionFilter: '8px',
			},
			reset: baseline,
		});
	});

	test('shared widget families also work without Modern UI enabled', async () => {
		const { root, snapshot, update } = createWidgets();
		root.classList.remove('modern-ui', 'modern-ui-tabs');
		const baseline = snapshot();
		await update({ 'controls.cornerRadius': 0, 'popups.cornerRadius': 3 });
		const customized = snapshot();
		await update({});
		assert.deepStrictEqual({
			button: customized.button, input: customized.input, dialog: customized.dialog, palette: customized.palette,
			reset: snapshot(), defaults: [baseline.dialog, baseline.palette],
		}, {
			button: '0px', input: ['0px', '0px'], dialog: '3px', palette: '3px',
			reset: baseline, defaults: ['12px', '12px'],
		});
	});

	test('radius changes preserve keyboard focus, accessible names, dimensions and focus outlines', async () => {
		const { button, input, update } = createWidgets();
		button.focus();
		const read = () => {
			const css = getWindow(button.element).getComputedStyle(button.element);
			return {
				focused: button.hasFocus(), role: button.element.getAttribute('role'),
				label: button.element.getAttribute('aria-label'), inputLabel: input.inputElement.getAttribute('aria-label'),
				width: button.element.offsetWidth, height: button.element.offsetHeight,
				outlineWidth: css.outlineWidth, outlineStyle: css.outlineStyle, outlineOffset: css.outlineOffset,
			};
		};
		const before = read();
		await update({ 'controls.cornerRadius': 0, 'popups.cornerRadius': 0 });
		assert.deepStrictEqual({ before, after: read() }, {
			before, after: before,
		});
		assert.deepStrictEqual({ focused: before.focused, role: before.role, label: before.label, inputLabel: before.inputLabel }, {
			focused: true, role: 'button', label: 'Test button', inputLabel: 'Test input',
		});
	});

	test('custom corners preserve checkbox, toggle and radio keyboard interaction and accessibility', async () => {
		const { toggle, checkbox, radio, update } = createWidgets();
		const dimensions = () => [toggle.domNode, checkbox.domNode, ...radio.optionElements].map(element => ({
			width: element.offsetWidth, height: element.offsetHeight,
			role: element.getAttribute('role'), label: element.getAttribute('aria-label'),
		}));
		const before = dimensions();
		await update({ 'controls.cornerRadius': 8 });
		const customizedDimensions = dimensions();
		const keyboard = (element: HTMLElement, key: string, keyCode: number) =>
			element.dispatchEvent(new KeyboardEvent('keydown', { key, keyCode, bubbles: true }));
		toggle.focus();
		keyboard(toggle.domNode, ' ', 32);
		checkbox.focus();
		keyboard(checkbox.domNode, ' ', 32);
		radio.optionElements[0].focus();
		keyboard(radio.optionElements[0], 'ArrowRight', 39);
		assert.deepStrictEqual({
			dimensions: customizedDimensions, toggle: toggle.domNode.getAttribute('aria-checked'),
			checkbox: checkbox.domNode.getAttribute('aria-checked'),
			selected: radio.optionElements.map(element => element.getAttribute('aria-checked')),
			focused: getWindow(radio.domNode).document.activeElement === radio.optionElements[1],
		}, {
			dimensions: before, toggle: 'true', checkbox: 'true', selected: ['false', 'true', 'false'], focused: true,
		});
	});
});
