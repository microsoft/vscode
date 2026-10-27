/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const themeFile = 'src/vs/workbench/common/theme.ts';
const editorFile = 'src/vs/platform/theme/common/colors/editorColors.ts';
const baseFile = 'src/vs/platform/theme/common/colors/baseColors.ts';
const registrations = {
	foreground: baseFile,
	'focusBorder': baseFile,
	'contrastBorder': baseFile,
	'editor.background': editorFile,
	'editor.foreground': editorFile,
	'activityBar.background': themeFile,
	'activityBar.foreground': themeFile,
	'sideBar.background': themeFile,
	'titleBar.activeBackground': themeFile,
	'statusBar.background': themeFile,
};

export function createThemePaletteReader(read) {
	const defaults = new Map();
	function defaultColor(id, scheme, colors) {
		if (!defaults.has(id)) {
			const text = read(registrations[id]);
			const start = text.indexOf(`registerColor('${id}'`);
			const match = start < 0 ? undefined : text.slice(start).match(/,\s*\{(?<values>[^}]+)\}/);
			if (!match) {
				throw new Error(`Theme illustration adapter cannot read defaults for ${id}`);
			}
			defaults.set(id, new Map([...match.groups.values.matchAll(/(?<scheme>hcDark|hcLight|dark|light):\s*(?<value>[^,\n}]+)/g)]
				.map(entry => [entry.groups.scheme, entry.groups.value.trim()])));
		}
		const value = defaults.get(id).get(scheme);
		if (/^'#[\da-f]+'$/i.test(value)) {
			return value.slice(1, -1);
		}
		if (value === 'Color.white') {
			return '#FFFFFF';
		}
		if (value === 'Color.black') {
			return '#000000';
		}
		if (value === 'foreground' || value === 'editorForeground') {
			const target = value === 'foreground' ? 'foreground' : 'editor.foreground';
			return colors.get(target)?.value ?? defaultColor(target, scheme, colors);
		}
		if (value === 'null') {
			return 'none';
		}
		throw new Error(`Theme illustration adapter does not support ${id}: ${value}`);
	}
	return (theme, colors) => {
		const scheme = { 'vs': 'light', 'vs-dark': 'dark', 'hc-black': 'hcDark', 'hc-light': 'hcLight' }[theme.type];
		if (!scheme) {
			throw new Error(`Unsupported built-in theme type: ${theme.type}`);
		}
		const get = id => colors.get(id)?.value ?? defaultColor(id, scheme, colors);
		const editor = get('editor.background');
		const foreground = get('editor.foreground');
		const sidebar = get('sideBar.background');
		const contrast = get('contrastBorder');
		const highContrast = scheme.startsWith('hc');
		return {
			editor, foreground, sidebar,
			activity: get('activityBar.background'),
			activityForeground: get('activityBar.foreground'),
			title: get('titleBar.activeBackground'),
			status: get('statusBar.background'),
			accent: colors.get('button.background')?.value ?? get('focusBorder'),
			border: colors.get('panel.border')?.value ?? contrast,
			agents: colors.get('agents.background')?.value ?? (scheme === 'light' ? sidebar : editor),
			agentsPanel: colors.get('agentsPanel.background')?.value ?? (scheme === 'light' ? editor : sidebar),
			detail: colors.get('agentsDetail.background')?.value ?? editor,
			agentsBorder: colors.get('agentsPanel.border')?.value ?? (highContrast ? contrast : foreground),
			agentsBorderOpacity: colors.has('agentsPanel.border') || highContrast ? 1 : 0.15,
		};
	};
}
