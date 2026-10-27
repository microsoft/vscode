/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const ansiRegistryFile = 'src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts';

export function readAnsiColors(text, theme, declaredColors) {
	const scheme = { vs: 'light', 'vs-dark': 'dark', 'hc-black': 'hcDark', 'hc-light': 'hcLight' }[theme.type];
	if (!scheme) {
		throw new Error(`Unknown ANSI theme scheme: ${theme.type}`);
	}
	const entries = [...text.matchAll(/'(?<id>terminal\.ansi\w+)':\s*\{\s*index:\s*(?<index>\d+),\s*defaults:\s*\{(?<defaults>[^}]+)\}/g)];
	if (entries.length !== 16 || new Set(entries.map(entry => Number(entry.groups.index))).size !== 16
		|| entries.some(entry => Number(entry.groups.index) < 0 || Number(entry.groups.index) > 15)) {
		throw new Error('ANSI color registry changed. Update the explorer source adapter.');
	}
	return entries.map(entry => {
		const { id, index, defaults } = entry.groups;
		const values = Object.fromEntries([...defaults.matchAll(/(?<scheme>light|dark|hcDark|hcLight):\s*'(?<value>#[\da-f]+)'/gi)]
			.map(value => [value.groups.scheme, value.groups.value]));
		const value = values[scheme];
		if (!value) {
			throw new Error(`Missing ANSI default: ${id}, ${scheme}`);
		}
		const declaration = declaredColors.find(color => color.id === id);
		const registration = { file: ansiRegistryFile, line: text.slice(0, entry.index).split('\n').length };
		return {
			id, value: declaration?.value ?? value, css: `--vscode-${id.replaceAll('.', '-')}`, category: 'colors',
			description: `${id.slice('terminal.'.length)} ANSI color in the terminal. Customize through workbench.colorCustomizations.`,
			source: declaration?.source ?? registration,
			registration, origin: declaration ? 'theme' : 'default', ansiIndex: Number(index),
		};
	}).sort((a, b) => a.ansiIndex - b.ansiIndex);
}
