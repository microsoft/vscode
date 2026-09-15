/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Color } from '../../../../base/common/color.js';
import type { IBrowserCanvasTheme } from '../../../../platform/browserView/common/browserView.js';
import { isDark } from '../../../../platform/theme/common/theme.js';
import type { IColorTheme } from '../../../../platform/theme/common/themeService.js';

/**
 * Maps the canvas guest's semantic theme contract to the owning VS Code theme.
 * These are guest defaults, not inline declarations: an extension's own CSS wins.
 */
export function createBrowserCanvasTheme(theme: IColorTheme, font: string): IBrowserCanvasTheme {
	const dark = isDark(theme.type);
	const color = (...ids: string[]): Color => {
		for (const id of ids) {
			const value = theme.getColor(id);
			if (value) {
				return value;
			}
		}
		return dark ? Color.white : Color.black;
	};
	const cssVariables: Record<string, string> = {};
	const set = (name: string, value: string | Color) => cssVariables[`--${name}`] = value.toString();
	const foreground = color('editor.foreground', 'foreground');
	const background = color('editor.background');
	const muted = color('sideBar.background', 'editor.background');
	const border = color('contrastBorder', 'panel.border', 'widget.border', 'foreground');
	const focus = color('focusBorder', 'textLink.foreground');
	const disabled = color('disabledForeground', 'descriptionForeground');
	const textMuted = color('descriptionForeground', 'foreground');
	const selection = color('editor.selectionBackground', 'list.activeSelectionBackground');
	const input = color('input.background', 'editor.background');
	const checked = color('inputOption.activeBackground', 'button.background');
	const semantic: Record<string, Color> = {
		accent: color('textLink.foreground', 'focusBorder'),
		attention: color('editorWarning.foreground', 'terminal.ansiYellow'),
		danger: color('errorForeground', 'editorError.foreground'),
		success: color('terminal.ansiGreen', 'charts.green'),
		severe: color('terminal.ansiBrightYellow', 'editorWarning.foreground'),
		done: color('terminal.ansiMagenta', 'charts.purple'),
		sponsors: color('terminal.ansiMagenta', 'charts.purple'),
		upsell: color('textLink.foreground', 'focusBorder'),
		open: color('terminal.ansiGreen', 'charts.green'),
		closed: color('errorForeground', 'editorError.foreground'),
		neutral: textMuted,
	};
	for (const [name, value] of Object.entries(semantic)) {
		set(`background-color-${name}-emphasis`, value);
		set(`background-color-${name}-muted`, value.transparent(0.16));
		set(`text-color-${name}`, value);
	}
	for (const name of ['accent', 'attention', 'danger', 'success']) {
		set(`border-color-${name}-emphasis`, semantic[name]);
		set(`border-color-${name}-muted`, semantic[name].transparent(0.4));
	}
	set('border-color-closed-emphasis', semantic.closed);
	for (const [name, value] of Object.entries({
		default: background, muted, overlay: color('editorWidget.background', 'editor.background'),
		'overlay-backdrop': Color.black.transparent(0.4), emphasis: foreground,
		disabled: input, skeleton: muted, black: Color.black, white: Color.white, transparent: Color.transparent,
		'segmentedControl-bg-emphasis': selection, 'segmentedControl-bg-rest': input, 'segmentedControl-button-bg-rest': muted,
	})) {
		set(`background-color-${name}`, value);
	}
	for (const [name, value] of Object.entries({
		default: foreground, muted: textMuted, disabled, draft: textMuted, white: Color.white,
		'on-emphasis': color('button.foreground', 'editor.background'), link: semantic.accent,
	})) {
		set(`text-color-${name}`, value);
	}
	for (const name of ['default', 'emphasis', 'muted', 'overlay', 'pure', 'skeleton', 'subtle', 'subtle-opaque', 'subtle-opaque-input']) {
		set(`border-color-${name}`, border);
	}
	set('border-color-transparent', Color.transparent);
	set('color-focus-outline', focus);
	set('color-white', Color.white);
	set('outline-color-default', border);
	set('outline-color-focus-default', focus);
	for (const name of ['accent-emphasis', 'attention-emphasis', 'danger-emphasis', 'emphasis', 'rest', 'success-emphasis']) {
		set(`outline-color-borderColor-${name}`, semantic[name.split('-')[0]] ?? border);
	}
	for (const family of ['default', 'primary', 'danger', 'invisible', 'outline']) {
		for (const state of ['rest', 'hover', 'active', 'disabled']) {
			const hover = state === 'hover' || state === 'active';
			const primary = family === 'primary';
			const invisible = family === 'invisible' || family === 'outline';
			set(`background-color-button-${family}-${state}`, invisible
				? hover ? color('toolbar.hoverBackground', 'list.hoverBackground') : Color.transparent
				: family === 'danger' ? semantic.danger.transparent(hover ? 0.3 : 0.15)
					: primary ? color(hover ? 'button.hoverBackground' : 'button.background')
						: color(hover ? 'button.secondaryHoverBackground' : 'button.secondaryBackground', 'input.background'));
			if (!primary || !hover) {
				set(`text-color-button-${family}-${state}`, state === 'disabled' ? disabled
					: family === 'danger' ? semantic.danger
						: primary ? color('button.foreground') : color('button.secondaryForeground', 'foreground'));
			}
			if (family !== 'outline' && !(family === 'danger' && state === 'disabled')
				&& !(family === 'invisible' && (state === 'active' || state === 'disabled'))) {
				set(`border-color-button-${family}-${state}`, family === 'danger' ? semantic.danger : invisible ? Color.transparent : border);
			}
		}
	}
	set('text-color-button-star', semantic.attention);
	for (const state of ['rest', 'hover', 'active', 'disabled', 'selected']) {
		const hover = state === 'hover' || state === 'active';
		set(`background-color-control-${state}`, state === 'selected' ? selection : hover ? color('list.hoverBackground', 'input.background') : input);
		set(`background-color-control-transparent-${state}`, state === 'selected' ? selection : hover ? color('toolbar.hoverBackground', 'input.background') : Color.transparent);
		if (state !== 'disabled' && state !== 'selected') {
			set(`border-color-control-transparent-${state}`, state === 'rest' ? Color.transparent : focus);
		}
		if (state !== 'selected') {
			set(`background-color-control-checked-${state}`, checked);
			set(`border-color-control-checked-${state}`, focus);
		}
		if (!hover) {
			set(`border-color-control-${state}`, state === 'selected' ? focus : border);
		}
	}
	for (const name of ['rest', 'hover']) {
		set(`text-color-control-danger-${name}`, semantic.danger);
	}
	for (const name of ['active', 'hover']) {
		set(`background-color-control-danger-${name}`, semantic.danger.transparent(0.16));
	}
	for (const [name, value] of Object.entries({
		danger: semantic.danger, emphasis: border, success: semantic.success, warning: semantic.attention,
	})) {
		set(`border-color-control-${name}`, value);
	}
	for (const [name, value] of Object.entries({
		'checked-disabled': disabled, 'checked-rest': color('inputOption.activeForeground', 'foreground'),
		disabled, icon: foreground, placeholder: color('input.placeholderForeground', 'descriptionForeground'),
		rest: color('input.foreground', 'foreground'),
	})) {
		set(`text-color-control-${name}`, value);
	}
	for (const [name, value] of Object.entries({
		add: color('diffEditor.insertedTextBackground', 'diffEditor.insertedLineBackground'),
		addLine: color('diffEditor.insertedLineBackground', 'diffEditor.insertedTextBackground'),
		addLineHover: color('diffEditor.insertedLineBackground', 'diffEditor.insertedTextBackground'),
		additionNum: semantic.success.transparent(0.16),
		del: color('diffEditor.removedTextBackground', 'diffEditor.removedLineBackground'),
		delLine: color('diffEditor.removedLineBackground', 'diffEditor.removedTextBackground'),
		delLineHover: color('diffEditor.removedLineBackground', 'diffEditor.removedTextBackground'),
		deletionNum: semantic.danger.transparent(0.16),
		hunkLine: color('diffEditor.unchangedRegionBackground', 'editor.background'),
		hunkNum: muted, hunkNumHover: muted, normal: background, normalNum: background,
	})) {
		set(`background-color-diffBlob-${name}`, value);
	}
	set('text-color-diffBlob-addSign', semantic.success);
	set('text-color-diffBlob-delSign', semantic.danger);
	set('text-color-diffBlob-lineNum', color('editorLineNumber.foreground', 'descriptionForeground'));
	const palette: Record<string, Color> = {
		auburn: color('terminal.ansiRed'), blue: color('charts.blue', 'terminal.ansiBlue'),
		brown: color('terminal.ansiYellow'), coral: color('terminal.ansiBrightRed'), cyan: color('terminal.ansiCyan'),
		gray: textMuted, green: semantic.success, indigo: color('terminal.ansiBlue'), lemon: color('terminal.ansiBrightYellow'),
		lime: color('terminal.ansiBrightGreen'), olive: color('terminal.ansiGreen'), orange: color('charts.orange', 'terminal.ansiYellow'),
		pine: color('terminal.ansiGreen'), pink: color('terminal.ansiBrightMagenta'), plum: color('terminal.ansiMagenta'),
		purple: color('charts.purple', 'terminal.ansiMagenta'), red: semantic.danger,
		teal: color('terminal.ansiCyan'), yellow: semantic.attention,
	};
	for (const [name, value] of Object.entries(palette)) {
		set(`background-color-label-${name}-rest`, value.transparent(0.16));
		set(`text-color-label-${name}-rest`, value);
		if (name !== 'cyan' && name !== 'indigo') {
			set(`color-data-${name}-emphasis`, value);
			set(`color-data-${name}-muted`, value.transparent(0.4));
		}
	}
	for (const name of ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'violet', 'magenta', 'pink']) {
		const value = palette[name] ?? palette.purple;
		set(`true-color-${name}`, value);
		set(`true-color-${name}-muted`, value.transparent(0.4));
	}
	const syntax: Record<string, string> = {
		comment: 'comment', constant: 'number', entity: 'function', invalid: 'invalid',
		keyword: 'keyword', regexp: 'regexp', string: 'string', tag: 'class', variable: 'variable',
	};
	for (const [name, tokenType] of Object.entries(syntax)) {
		const index = theme.getTokenStyleMetadata(tokenType, [], '')?.foreground;
		const value = index === undefined ? undefined : theme.tokenColorMap[index];
		set(`syntax-color-${name}`, value && /^#[\da-f]{3,8}$/i.test(value) ? Color.fromHex(value) : foreground);
	}
	set('syntax-color-bg', background);
	set('syntax-color-fg', foreground);
	set('syntax-color-default', foreground);
	set('text-selection-background', selection);
	set('text-selection-foreground', color('editor.selectionForeground', 'editor.foreground'));
	for (const name of ['sans', 'sans-display', 'system']) {
		set(`font-${name}`, font);
	}
	set('font-mono', 'ui-monospace, SFMono-Regular, Consolas, monospace');
	for (const [name, weight] of Object.entries({ light: 300, normal: 400, medium: 500, semibold: 600 })) {
		set(`font-weight-${name}`, String(weight));
	}
	for (const [name, size] of Object.entries({
		display: 36, 'title-large': 28, 'title-medium': 24, 'title-small': 20, subtitle: 16,
		'body-large': 16, 'body-medium': 14, 'body-ui': 13, 'body-small': 12, caption: 11, badge: 11, 'code-block': 13, 'code-inline': 12,
	})) {
		set(`text-${name}`, `${size}px`);
		if (name !== 'code-inline') {
			set(`leading-${name}`, '1.5');
		}
	}
	const mode = dark ? 'dark' : 'light';
	return {
		cssVariables,
		attributes: {
			'data-color-mode': mode, 'data-dark-theme': 'dark', 'data-light-theme': 'light',
			'data-theme-source': 'vscode', 'data-theme-tone': mode, 'data-visual-mode': 'default',
		},
		colorScheme: mode,
		stylesheets: {
			rampa: `:root { ${Object.entries(cssVariables).filter(([name]) => name.startsWith('--true-color-') || name.startsWith('--color-data-')).map(([name, value]) => `${name}: ${value};`).join(' ')} }`,
		},
	};
}
