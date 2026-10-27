/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { controls, controlGaps } from './controls.mjs';
import { createThemePaletteReader } from './theme-palettes.mjs';
import { documentControl } from './component-docs.mjs';
import { buildNavigation, flattenNavigation, pageJumps } from './navigation-model.mjs';
import { ansiRegistryFile, readAnsiColors } from './ansi-colors.mjs';
import { readSizeTokens, readTypography } from './typography-model.mjs';

export const sections = [
	{ id: 'principles', title: 'Design Philosophy', description: 'Values, principles, and moves from the repository’s Design Philosophy skill.' },
	{ id: 'typography', title: 'Typography', description: 'Font families, type styles, hierarchy, emphasis, and the complete registered typography token reference.' },
	{ id: 'spacing', title: 'Spacing', description: 'See the spacing ramp and try padding and gap together.' },
	{ id: 'shape', title: 'Shape', description: 'Corner radii and surface roles, shown side by side.' },
	{ id: 'size', title: 'Size', description: 'Registered icon sizes and stroke thickness. Other component dimensions are not yet standardized.' },
	{ id: 'colors', title: 'Colors', description: 'Semantic color tokens and terminal ANSI colors, in a compact reference.' },
	{ id: 'theming', title: 'Theming', description: 'Browse the built-in themes through simple editor and Agents-window shell illustrations.' },
	{ id: 'components', title: 'Components', description: 'Browse real fixture groups and variants for reusable controls, using the existing Component Explorer renderer.' },
	{ id: 'patterns', title: 'Interaction patterns', description: 'TBD: three example areas to audit and turn into shared patterns.' },
	{ id: 'motion', title: 'Motion', description: 'Illustrative motion previews and placeholder sections for a future system: principles, timing, transitions, patterns, and accessibility.' },
	{ id: 'iconography', title: 'Iconography', description: 'Browse actual Codicon glyphs, inspect their names, and copy a class or CSS code point.', searchable: true },
	{ id: 'layout', title: 'Layout', description: 'Try a simple composition. Broader layout recipes are TBD.' },
	{ id: 'accessibility', title: 'Accessibility', description: 'TBD: example areas for accessible design-system guidance, not a conformance claim.' },
	{ id: 'content', title: 'Content', description: 'TBD: a short outline for future writing and localization guidance.' },
	{ id: 'tokens', title: 'Token lookup', description: 'Browse the full indexed inventory or narrow it by token name or CSS variable. Exact matches appear first.', searchable: true },
];

const sizeFile = 'src/vs/platform/theme/common/sizes/baseSizes.ts';
const iconFile = 'src/vs/base/common/codiconsLibrary.ts';
const guidance = {
	principles: ['.github/skills/design-philosophy/SKILL.md'],
	patterns: ['.github/skills/hover/SKILL.md', '.github/skills/context-menus/SKILL.md', '.github/skills/accessibility/SKILL.md'],
	motion: ['.github/skills/design-philosophy/SKILL.md'],
	layout: ['.github/instructions/design-tokens.instructions.md', '.github/skills/ux-css-layout/SKILL.md'],
	accessibility: ['.github/skills/accessibility/SKILL.md'],
	content: ['.github/instructions/coding-guidelines.instructions.md'],
};

const motionFiles = [
	'src/vs/base/browser/ui/toggle/switch.css',
	'src/vs/base/browser/ui/radio/radio.css',
	'src/vs/base/browser/ui/pixelSpinner/pixelSpinner.css',
	'src/vs/base/browser/ui/hover/hoverWidget.css',
	'src/vs/base/browser/ui/scrollbar/media/scrollbars.css',
	'src/vs/workbench/browser/parts/notifications/media/notificationsToasts.css',
];

export const cssName = id => `--vscode-${id.replaceAll('.', '-')}`;

// Strip JSONC syntax without changing quoted strings or source line numbers.
export function parseJsonc(text) {
	const chars = [...text];
	let quoted = false;
	for (let index = 0; index < chars.length; index++) {
		if (quoted) {
			if (chars[index] === '\\') {
				index++;
			} else if (chars[index] === '"') {
				quoted = false;
			}
		} else if (chars[index] === '"') {
			quoted = true;
		} else if (chars[index] === '/' && ['/', '*'].includes(chars[index + 1])) {
			const block = chars[index + 1] === '*';
			chars[index++] = ' ';
			chars[index] = ' ';
			let closed = !block;
			while (++index < chars.length) {
				if (block && chars[index] === '*' && chars[index + 1] === '/') {
					chars[index++] = ' ';
					chars[index] = ' ';
					closed = true;
					break;
				}
				if (!block && chars[index] === '\n') {
					break;
				}
				if (chars[index] !== '\n' && chars[index] !== '\r') {
					chars[index] = ' ';
				}
			}
			if (!closed) {
				throw new Error('Unterminated JSONC comment');
			}
		}
	}
	quoted = false;
	for (let index = 0; index < chars.length; index++) {
		if (quoted) {
			if (chars[index] === '\\') {
				index++;
			} else if (chars[index] === '"') {
				quoted = false;
			}
		} else if (chars[index] === '"') {
			quoted = true;
		} else if (chars[index] === ',') {
			let next = index + 1;
			while (/\s/.test(chars[next] ?? '') && next < chars.length) {
				next++;
			}
			if (chars[next] === '}' || chars[next] === ']') {
				chars[index] = ' ';
			}
		}
	}
	return JSON.parse(chars.join(''));
}

export function loadSystem(root, selectedTheme = 'Dark 2026', comparisonTheme = 'Light 2026') {
	const sources = new Map();
	const read = file => {
		if (!sources.has(file)) {
			sources.set(file, readFileSync(path.join(root, file), 'utf8'));
		}
		return sources.get(file);
	};
	const source = (file, offset = 0) => ({ file, line: read(file).slice(0, offset).split('\n').length });
	const themeManifests = globSync('extensions/theme-*/package.json', { cwd: root }).sort().map(file => file.split(path.sep).join('/'));
	const themeRoots = themeManifests.map(file => `${path.posix.dirname(file)}/`);
	read('test/componentFixtures/component-explorer.json');
	const themes = themeManifests.flatMap(file => {
		const manifest = JSON.parse(read(file));
		return (manifest.contributes?.themes ?? []).map(theme => ({
			id: theme.id, type: theme.uiTheme,
			file: path.posix.normalize(path.posix.join(path.posix.dirname(file), theme.path)),
		}));
	});
	const selected = themes.find(theme => theme.id === selectedTheme);
	if (!selected) {
		throw new Error(`Unknown theme: ${selectedTheme}`);
	}
	const chain = [];
	const loadTheme = (file, visited = new Set(), inheritance = []) => {
		if (!themeRoots.some(root => file.startsWith(root)) || !file.endsWith('.json')) {
			throw new Error('Theme include must stay in a built-in theme extension');
		}
		if (visited.has(file)) {
			throw new Error(`Theme include cycle: ${file}`);
		}
		visited.add(file);
		const text = read(file);
		const theme = parseJsonc(text);
		if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
			throw new Error(`Invalid theme document: ${file}`);
		}
		const colors = theme.include ? loadTheme(path.posix.normalize(path.posix.join(path.posix.dirname(file), theme.include)), visited, inheritance) : new Map();
		inheritance.push(file);
		for (const [id, value] of Object.entries(theme.colors ?? {})) {
			if (value === null) {
				colors.delete(id);
				continue;
			}
			if (!/^[\w.-]+$/.test(id) || typeof value !== 'string' || !/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) {
				throw new Error(`Unsupported theme color ${id} in ${file}`);
			}
			const offset = text.indexOf(JSON.stringify(id));
			colors.set(id, { id, value, css: cssName(id), category: 'colors', source: source(file, offset) });
		}
		return colors;
	};
	const declarations = [...loadTheme(selected.file, new Set(), chain).values()].sort((a, b) => a.id.localeCompare(b.id));
	const ansiColors = readAnsiColors(read(ansiRegistryFile), selected, declarations);
	const colors = [...declarations.filter(token => !ansiColors.some(ansi => ansi.id === token.id)), ...ansiColors]
		.sort((a, b) => a.id.localeCompare(b.id));
	const compared = themes.find(theme => theme.id === comparisonTheme);
	if (!compared) {
		throw new Error(`Unknown comparison theme: ${comparisonTheme}`);
	}
	const comparisonChain = [];
	const comparisonColors = [...loadTheme(compared.file, new Set(), comparisonChain).values()].sort((a, b) => a.id.localeCompare(b.id));
	const palette = createThemePaletteReader(read);
	read('src/vs/workbench/common/agentsColors.ts');
	const themeGallery = themes.map(theme => ({ ...theme, palette: palette(theme, loadTheme(theme.file)) }));
	const sizes = readSizeTokens(read(sizeFile), sizeFile);
	if (!sizes.length) {
		throw new Error('No base size registrations recognized. Update the explorer source adapter.');
	}
	if (sizes.length !== [...read(sizeFile).matchAll(/\bregisterSize\(/g)].length) {
		throw new Error('Some base size registrations were not recognized. Update the explorer source adapter.');
	}
	const typography = readTypography(read, sizes);
	const indexedSizes = [...sizes, ...typography.tokens.filter(token => !sizes.some(size => size.id === token.id))];
	const icons = [...read(iconFile).matchAll(/register\('(?<id>[^']+)', (?<code>0x[\da-f]+)\)/g)].map(match => ({
		id: match.groups.id, code: match.groups.code, source: source(iconFile, match.index),
	}));
	if (!icons.length) {
		throw new Error('No Codicon registrations recognized. Update the explorer source adapter.');
	}
	const documents = Object.fromEntries(Object.entries(guidance).map(([section, files]) => [section, files.map(file => ({ file, text: read(file) }))]));
	const philosophyDocument = documents.principles[0];
	const philosophyLines = philosophyDocument.text.split('\n');
	const philosophy = philosophyLines.flatMap((line, index) => {
		const match = line.match(/^#### \d+\. (?<title>.+)/);
		if (!match) {
			return [];
		}
		const question = philosophyLines.slice(index + 1, index + 5).find(line => line.startsWith('> **Ask:**'));
		if (!question) {
			throw new Error('Design Philosophy questions changed. Update the source adapter.');
		}
		return [{ title: match.groups.title, question: question.replace(/^> \*\*Ask:\*\*\s*/, '').replaceAll('*', ''), source: { file: philosophyDocument.file, line: index + 1 } }];
	});
	if (philosophy.length !== 7) {
		throw new Error('Design Philosophy principles changed. Update the source adapter.');
	}
	for (const control of controls) {
		if (control.file) {
			read(control.file);
		}
		read(control.owner);
	}
	const documentedControls = controls.map(control => documentControl(control, read));
	for (const gap of controlGaps) {
		if (gap.owner) {
			read(gap.owner);
		}
	}
	const motion = motionFiles.map(file => {
		const text = read(file);
		return {
			file,
			declarations: [...text.matchAll(/^[ \t]*(?<property>transition(?:-[\w-]+)?|animation(?:-[\w-]+)?):[ \t]*(?<value>[^;]+);/gm)]
				.map(match => ({ ...match.groups, source: source(file, match.index) })),
			reducedMotion: text.includes('prefers-reduced-motion') ? 'Media query' : text.includes('monaco-reduce-motion') ? 'Workbench class' : 'No local opt-out found; inspect the caller',
		};
	});
	const indexedDocuments = Object.fromEntries(Object.entries(documents).map(([section, entries]) => [section, entries.map(document => {
		if (section !== 'motion') {
			return document;
		}
		const start = document.text.indexOf('### Delightful');
		const end = document.text.indexOf('\n## ', start);
		return { ...document, text: document.text.slice(start, end === -1 ? undefined : end) };
	})]));
	return {
		themes, themeGallery, theme: selected, chain, colors, sizes: indexedSizes, typography, philosophy, icons, controls: documentedControls, controlGaps, motion, documents: indexedDocuments, sections,
		comparison: { theme: compared, chain: comparisonChain, colors: comparisonColors },
		codiconFontAvailable: existsSync(path.join(root, 'node_modules/@vscode/codicons/dist/codicon.ttf')),
		sourceFiles: [...sources.keys()],
		limitations: [
			'UI color tokens show explicit theme declarations and includes; all 16 terminal ANSI colors use theme overrides or source-registered defaults. This is not a full runtime color-registry resolver. Shell illustrations use a small subset of base defaults and are not live renders.',
			'Size inventory includes baseSizes.ts and deprecated Agents typography aliases. Font stacks and workbench line-height are separately labeled source styles, not invented tokens.',
			'Components are an initial, explicitly curated set of reusable controls, not every fixture. Composite feature scenes remain in Component Explorer.',
			'Control previews discover the checkout’s running Component Explorer session and use its single-fixture renderer with natural interaction. The local daemon and repository dependencies must be available.',
			'There is no centralized product motion system. Motion sections are an outline only; current code samples are not standards, token proposals, or an exhaustive audit.',
			'Guidance is indexed from repository documents, not a new authored specification. No accessibility conformance is claimed.',
			'View state lasts for this live canvas instance. No product settings or repository files are changed.',
		],
	};
}

export function validateView(patch, current, system) {
	if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(key => !['section', 'theme', 'compareTheme', 'controlId', 'fixtureId', 'query', 'explorerUrl', 'anchor', 'expandedNodes'].includes(key))) {
		throw new Error('Expected section, theme, compareTheme, controlId, fixtureId, query, explorerUrl, anchor, or expandedNodes fields');
	}
	const view = { ...current, ...patch };
	if (patch.anchor === undefined && (patch.section !== undefined && patch.section !== current.section
		|| patch.controlId !== undefined && patch.controlId !== current.controlId
		|| patch.query !== undefined && patch.query !== current.query)) {
		view.anchor = '';
	}
	if (patch.anchor && sections.some(section => section.id === view.section && section.searchable)) {
		view.query = '';
	}
	if (!sections.some(section => section.id === view.section)
		|| !system.themes.some(theme => theme.id === view.theme)
		|| !system.themes.some(theme => theme.id === view.compareTheme)
		|| !controls.some(control => control.id === view.controlId)
		|| typeof view.fixtureId !== 'string' || view.fixtureId.length > 1024
		|| typeof view.query !== 'string' || view.query.length > 200) {
		throw new Error('Unknown section, theme, or control; invalid fixture identifier; or search exceeds 200 characters');
	}
	const nodes = flattenNavigation(buildNavigation(system));
	if (typeof view.anchor !== 'string' || view.anchor && !pageJumps(view).some(item => item.anchor === view.anchor)
		|| !Array.isArray(view.expandedNodes) || view.expandedNodes.length > 100
		|| new Set(view.expandedNodes).size !== view.expandedNodes.length
		|| view.expandedNodes.some(id => !nodes.some(node => node.id === id && node.children?.length))) {
		throw new Error('Unknown section navigation anchor or expanded node');
	}
	view.expandedNodes = [...view.expandedNodes];
	if (patch.expandedNodes === undefined && (patch.section !== undefined || patch.controlId !== undefined)) {
		if (nodes.some(node => node.id === view.section && node.children?.length)) {
			view.expandedNodes = [...new Set([...view.expandedNodes, view.section])];
		}
	}
	if (typeof view.explorerUrl !== 'string' || view.explorerUrl.length > 2048) {
		throw new Error('Component Explorer URL must be a string of at most 2048 characters');
	}
	if (view.explorerUrl) {
		const url = new URL(view.explorerUrl);
		if (url.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(url.hostname)
			|| url.username || url.password || url.pathname !== '/___explorer' || url.search || url.hash) {
			throw new Error('Component Explorer URL must be a loopback HTTP /___explorer URL without credentials or query parameters');
		}
	}
	return view;
}
