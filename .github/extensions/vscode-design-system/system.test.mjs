/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { cssName, loadSystem, parseJsonc, validateView } from './system.mjs';
import { createPanel } from './server.mjs';
import { controls, curateFixtures } from './controls.mjs';
import { motionReferences, motionTopics } from './motion-reference.mjs';
import { buildNavigation, pageJumps, flattenNavigation } from './navigation-model.mjs';
import { findTokens } from './token-lookup.mjs';
import { placeholders, readingGuidance } from './page-content.mjs';
import { ansiRegistryFile, readAnsiColors } from './ansi-colors.mjs';
import { parseProvenance, readProvenance } from './provenance.mjs';
import { selectFixtureSession } from './fixtures.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const defaultView = { section: 'principles', theme: 'Dark 2026', compareTheme: 'Light 2026', controlId: 'button', fixtureId: '', query: '', explorerUrl: '', anchor: '', expandedNodes: [] };

test('JSONC preserves comment markers, escaped quotes, and trailing comma strings', () => {
	assert.deepEqual(parseJsonc('{\n// comment\n"url":"https://example.test/a/*b*/", "quote":"a\\"b,}", /* multi\nline */ "items":[1,],}'), {
		url: 'https://example.test/a/*b*/', quote: 'a"b,}', items: [1],
	});
	assert.throws(() => parseJsonc('{/* unfinished'), /Unterminated/);
	assert.throws(() => parseJsonc('{"bad": undefined}'), SyntaxError);
});

test('inventory reads exact registrations, inherited overrides, and source positions', () => {
	const system = loadSystem(root);
	assert.ok(system.sizes.length >= 36);
	assert.ok(system.icons.length > 700);
	assert.deepEqual(system.sizes.find(token => token.id === 'cornerRadius.small'), {
		id: 'cornerRadius.small', value: '4px', css: '--vscode-cornerRadius-small',
		description: 'Small corner radius for compact UI elements.', category: 'shape',
		deprecated: false, source: { file: 'src/vs/platform/theme/common/sizes/baseSizes.ts', line: 98 },
	});

	const color = system.colors.find(token => token.id === 'button.background');
	assert.equal(color.value, '#297AA0');
	assert.equal(color.source.file, 'extensions/theme-defaults/themes/2026-dark.json');
	for (const token of [...system.sizes, ...system.colors, ...system.icons]) {
		const line = readFileSync(new URL(`../../../${token.source.file}`, import.meta.url), 'utf8').split('\n')[token.source.line - 1];
		assert.ok(line.includes(token.id), `${token.id} source line`);
	}
	assert.equal(cssName('fontSize.body1'), '--vscode-fontSize-body1');
	assert.ok(system.documents.principles[0].text.includes('Calm'));
	assert.equal(system.sections.some(section => section.id === 'adoption'), false);
	assert.equal(system.comparison.theme.id, 'Light 2026');
	assert.notEqual(system.comparison.colors.find(token => token.id === 'editor.background').value, system.colors.find(token => token.id === 'editor.background').value);
});

test('source identity distinguishes local branch/worktree, main checkout, and detached state without claiming deployment', () => {
		const paths = ['/repo/.git/worktrees/topic', '/repo/.git', '/repo/topic'];
		const topic = parseProvenance('# branch.oid abcdef1234\n# branch.head topic\n? local-file', paths);
		assert.deepEqual({ kind: topic.kind, branch: topic.branch, commit: topic.commit, worktree: topic.worktree, modified: topic.modified },
			{ kind: 'Local worktree', branch: 'topic', commit: 'abcdef1234', worktree: 'topic', modified: true });
		const main = parseProvenance('# branch.oid abcdef1234\n# branch.head main', ['/repo/.git', '/repo/.git', '/repo']);
		assert.equal(main.kind, 'Local main checkout');
		assert.equal(main.modified, false);
		assert.match(main.deployment, /not a verified deployment/);
		assert.equal(parseProvenance('# branch.oid abcdef1234\n# branch.head (detached)', paths).branch, 'Detached HEAD');
		assert.throws(() => parseProvenance('', paths), /branch and commit metadata/);
		const actual = readProvenance(root);
		assert.equal(actual.worktreePath, root.replace(/\/$/, ''));
		assert.match(actual.commit, /^[a-f\d]{40}$/);
});

test('typography covers active styles, icon sizes, legacy aliases, font stacks, and real source boundaries', () => {
		const system = loadSystem(root);
		const { tokens, families, baseline } = system.typography;
		assert.equal(tokens.length, 25);
		assert.equal(tokens.filter(token => token.id.startsWith('fontSize.')).length, 8);
		assert.equal(tokens.filter(token => token.id.startsWith('fontWeight.')).length, 2);
		assert.equal(tokens.filter(token => token.id.startsWith('codiconFontSize')).length, 2);
		assert.equal(tokens.filter(token => token.deprecated).length, 13);
		for (const token of tokens) {
			assert.ok(system.sizes.some(size => size.id === token.id));
			if (token.deprecated) {
				const replacement = tokens.find(item => item.id === token.replacement);
				assert.ok(replacement, token.id);
				assert.equal(replacement.value, token.value);
			}
			const line = readFileSync(new URL(`../../../${token.source.file}`, import.meta.url), 'utf8').split('\n')[token.source.line - 1];
			assert.ok(line.includes(token.id));
		}
		assert.equal(families.length, 18);
		assert.equal(families.filter(family => family.locale === 'Default').length, 6);
		assert.deepEqual({ fontSize: baseline.fontSize, lineHeight: baseline.lineHeight }, { fontSize: '13px', lineHeight: '1.4em' });
		assert.equal(tokens.some(token => /lineHeight|letterSpacing|fontFamily/.test(token.id)), false);
		assert.equal(system.sections[0].title, 'Design Philosophy');
		assert.equal(system.sections.some(section => section.id === 'overview'), false);
		assert.equal(system.sections.at(-1).id, 'tokens');
		assert.equal(system.philosophy.length, 7);
		assert.match(system.philosophy[0].title, /Quiet at rest/);
});

test('all contributed themes load without inventing runtime defaults', () => {
	const system = loadSystem(root);
	assert.ok(system.themes.length >= 19);
	assert.deepEqual(system.themeGallery.map(theme => theme.id), system.themes.map(theme => theme.id));
	for (const id of ['Abyss', 'Monokai', 'Solarized Dark', 'Solarized Light', 'Dark 2026', 'Light 2026']) {
		assert.ok(system.themes.some(theme => theme.id === id), id);
	}
	for (const theme of system.themes) {
		const snapshot = loadSystem(root, theme.id);
		assert.equal(snapshot.theme.id, theme.id);
		assert.equal(snapshot.chain.at(-1), theme.file);
	}
	const contrast = loadSystem(root, 'Default High Contrast Light');
	assert.equal(contrast.colors.some(token => token.id === 'button.background'), false);
	assert.throws(() => loadSystem(root, '../../outside'), /Unknown theme/);
});

test('all 16 customizable terminal ANSI colors resolve from source defaults or theme overrides', () => {
	const registry = readFileSync(new URL(`../../../${ansiRegistryFile}`, import.meta.url), 'utf8');
	const schemes = [
		['vs-dark', '#2472c8', '#000000'],
		['vs', '#0451a5', '#000000'],
		['hc-black', '#0000ee', '#000000'],
		['hc-light', '#0451a5', '#292929'],
	];
	for (const [type, blue, black] of schemes) {
		const colors = readAnsiColors(registry, { type }, []);
		assert.deepEqual(colors.map(color => color.ansiIndex), Array.from({ length: 16 }, (_, index) => index));
		assert.equal(colors.find(color => color.id === 'terminal.ansiBlue').value, blue);
		assert.equal(colors.find(color => color.id === 'terminal.ansiBlack').value, black);
		assert.ok(colors.every(color => color.origin === 'default' && color.source.file === ansiRegistryFile));
	}
	const source = { file: 'theme.json', line: 42 };
	const overridden = readAnsiColors(registry, { type: 'vs-dark' }, [{ id: 'terminal.ansiRed', value: '#123456', source }]);
	assert.deepEqual(overridden.filter(color => color.id === 'terminal.ansiRed').map(color => ({
		value: color.value, origin: color.origin, source: color.source,
	})), [{ value: '#123456', origin: 'theme', source }]);
	assert.throws(() => readAnsiColors('', { type: 'vs-dark' }, []), /registry changed/);
	const system = loadSystem(root);
	assert.equal(system.colors.filter(color => color.ansiIndex !== undefined).length, 16);
	assert.equal(new Set(system.colors.map(color => color.id)).size, system.colors.length);
	assert.equal(findTokens(system.colors, 'terminal.ansiBrightCyan')[0].css, '--vscode-terminal-ansiBrightCyan');
	assert.ok(system.sourceFiles.includes(ansiRegistryFile));
});

test('every page leads with reading guidance and page jumps follow the content order', () => {
	const system = loadSystem(root);
	assert.deepEqual(system.sections.filter(section => !readingGuidance[section.id]).map(section => section.id), []);
	assert.deepEqual(pageJumps({ section: 'components' }).map(item => item.anchor),
		['component-example', 'component-usage', 'component-accessibility', 'component-api']);
	assert.deepEqual(pageJumps({ section: 'motion' }).map(item => item.anchor),
		['motion-principles', 'motion-timing', 'motion-transitions', 'motion-previews', 'motion-code']);
});

test('theme illustrations use overrides and source-registered defaults across all theme types', () => {
	const gallery = loadSystem(root).themeGallery;
	const find = id => gallery.find(theme => theme.id === id).palette;
	assert.equal(find('Dark 2026').editor, '#121314');
	assert.equal(find('Default High Contrast').editor, '#000000');
	assert.equal(find('Default High Contrast Light').editor, '#FFFFFF');
	assert.equal(find('Visual Studio Dark').activity, '#333333');
	assert.notEqual(find('Light 2026').agents, find('Dark 2026').agents);
	for (const theme of gallery) {
		for (const [role, color] of Object.entries(theme.palette)) {
			if (role !== 'agentsBorderOpacity') {
				assert.match(color, /^(?:#[\da-f]{3,8}|none)$/i, `${theme.id}: ${role}`);
			}
		}
	}
});

test('each component has specific source-backed docs and unmapped primitives stay explicit', () => {
	const system = loadSystem(root);
	assert.equal(system.controls.length, 10);
	for (const control of system.controls) {
		assert.ok(control.docs.summary && control.docs.className && control.docs.preview);
		assert.ok(control.docs.usage.length && control.docs.accessibility.length && control.docs.api.length >= 4);
		for (const prop of control.docs.api) {
			assert.equal(prop.source.file, control.owner);
			assert.ok(readFileSync(new URL(`../../../${prop.source.file}`, import.meta.url), 'utf8').split('\n')[prop.source.line - 1].trim());
		}
	}
	const radio = system.controls.find(control => control.id === 'radio');
	assert.deepEqual({ className: radio.docs.className, groups: radio.groups }, { className: 'Radio', groups: [] });
	assert.deepEqual(system.sections.filter(section => section.searchable).map(section => section.id), ['iconography', 'tokens']);
});

test('motion is a future-work outline, separate from current code and token values', () => {
	assert.deepEqual(motionTopics.map(topic => topic.id), [
		'principles', 'timing', 'transitions',
	]);
	for (const topic of motionTopics) {
		assert.deepEqual(Object.keys(topic).sort(), ['id', 'title', 'description'].sort());
		assert.ok(topic.description.startsWith('TBD:'));
	}
	assert.deepEqual(motionReferences.map(reference => reference.url), [
		'https://oliviatyu.github.io/vscode-motion-audit/',
		'https://fluent2.microsoft.design/motion',
	]);
	const system = loadSystem(root);
	assert.equal(system.motion.length, 6);
	assert.ok(system.limitations.some(limitation => limitation.includes('no centralized product motion system')));
	assert.equal(system.sizes.some(token => token.id.startsWith('motion.')), false);
	for (const sample of system.motion) {
		for (const declaration of sample.declarations) {
			const line = readFileSync(new URL(`../../../${declaration.source.file}`, import.meta.url), 'utf8').split('\n')[declaration.source.line - 1];
			assert.ok(line.includes(declaration.property) && line.includes(declaration.value));
		}
	}
});

test('view validation rejects invalid fields and preserves omitted state', () => {
	const system = loadSystem(root);
	const current = { ...defaultView, section: 'tokens', query: 'spacing' };
	assert.deepEqual(validateView({ section: 'components' }, current, system), { ...current, section: 'components', expandedNodes: ['components'] });
	for (const patch of [null, [], { query: 3 }, { query: 'x'.repeat(201) }, { theme: 'missing' }, { section: 'missing' }, { file: '/etc/passwd' }, { explorerUrl: 3 }, { explorerUrl: 'https://example.test/___explorer' }, { explorerUrl: 'http://localhost:5123/private' }, { explorerUrl: 'http://user:password@localhost:5123/___explorer' }, { explorerUrl: 'http://localhost:5123/___explorer?unexpected=1' }]) {
		assert.throws(() => validateView(patch, current, system));
	}
	assert.equal(validateView({ explorerUrl: 'http://localhost:5123/___explorer' }, current, system).explorerUrl, 'http://localhost:5123/___explorer');
	assert.throws(() => validateView({ compareTheme: 'missing' }, current, system));
	assert.throws(() => validateView({ controlId: 'chat-composite' }, current, system));
	assert.throws(() => validateView({ fixtureId: 3 }, current, system));
	assert.throws(() => validateView({ anchor: 'motion-easing' }, current, system));
	assert.throws(() => validateView({ expandedNodes: ['not-a-branch'] }, current, system));
	assert.throws(() => validateView({ expandedNodes: ['motion', 'motion'] }, current, system));
});

test('navigation stays two levels deep with dedicated visual foundation pages', () => {
	const system = loadSystem(root);
	const tree = buildNavigation(system);
	const flat = flattenNavigation(tree);
	assert.equal(new Set(flat.map(node => node.id)).size, flat.length);
	assert.deepEqual(tree.map(node => node.id), system.sections.map(section => section.id));
	const components = tree.find(node => node.id === 'components');
	assert.deepEqual(components.children.map(node => node.controlId), system.controls.map(control => control.id));
	assert.equal(flat.some(node => node.children?.some(child => child.children)), false);
	assert.deepEqual(pageJumps({ section: 'components' }).map(node => node.anchor),
		['component-example', 'component-usage', 'component-accessibility', 'component-api']);
	const motion = tree.find(node => node.id === 'motion');
	assert.equal(motion.children.length, 4);
	for (const section of ['typography', 'spacing', 'shape', 'size', 'colors', 'tokens']) {
		assert.ok(tree.some(node => node.id === section && !node.children));
	}
	for (const examples of Object.values(placeholders)) {
		assert.ok(examples.length >= 1 && examples.length <= 3);
		assert.ok(examples.every(example => example.text.includes('TBD')));
	}
});

test('navigation state preserves explicit collapse and clears stale cross-page anchors', () => {
	const system = loadSystem(root);
	const selected = validateView({ section: 'components', controlId: 'input', anchor: 'component-api' }, defaultView, system);
	assert.deepEqual({ anchor: selected.anchor, expanded: selected.expandedNodes }, { anchor: 'component-api', expanded: ['components'] });
	const collapsed = validateView({ expandedNodes: [] }, selected, system);
	assert.deepEqual(collapsed.expandedNodes, []);
	assert.equal(validateView({ section: 'theming' }, collapsed, system).anchor, '');
	assert.equal(validateView({ controlId: 'button' }, collapsed, system).anchor, '');
	assert.equal(validateView({ query: 'changed' }, selected, system).anchor, '');
	assert.throws(() => validateView({ section: 'tokens', anchor: 'group-colors' }, defaultView, system), /navigation anchor/);
	const panel = createPanel(root);
	panel.setView({ section: 'motion', anchor: 'motion-timing' });
	const copy = panel.view;
	copy.expandedNodes.length = 0;
	assert.deepEqual(panel.view.expandedNodes, ['motion']);
});

test('lookup is populated by default and narrows exact token names and CSS variables', () => {
	const tokens = [...loadSystem(root).sizes, ...loadSystem(root).colors];
	assert.equal(findTokens(tokens, '').length, tokens.length);
	assert.deepEqual(findTokens(tokens, 'not-a-token'), []);
	for (const query of ['fontSize.body1', '--vscode-fontSize-body1', 'var(--vscode-fontSize-body1)']) {
		assert.equal(findTokens(tokens, query)[0].id, 'fontSize.body1');
	}
	assert.ok(findTokens(tokens, 'cornerRadius').length > 1);
	assert.equal(findTokens(tokens, 'agents.fontSize.heading1')[0].replacement, 'fontSize.heading1');
});

test('curation includes only exact reusable-control groups, not feature composites', () => {
	const catalog = curateFixtures([
		{ fixtureId: 'baseUI/Buttons/Dark', fixtureName: 'Dark', groupPath: ['baseUI', 'Buttons'] },
		{ fixtureId: 'chat/Buttons/Dark', fixtureName: 'Dark', groupPath: ['chat', 'Buttons'] },
		{ fixtureId: 'baseUI/ButtonsComposite/Dark', fixtureName: 'Dark', groupPath: ['baseUI', 'ButtonsComposite'] },
		{ fixtureId: 'editor/multiSelectDropdown/Weekdays/Light', fixtureName: 'Light', groupPath: ['editor', 'multiSelectDropdown', 'Weekdays'] },
	]);
	assert.deepEqual(catalog.filter(control => control.variants.length).map(control => ({
		id: control.id, variants: control.variants.map(variant => variant.id),
	})), [
		{ id: 'button', variants: ['baseUI/Buttons/Dark'] },
		{ id: 'dropdown', variants: ['editor/multiSelectDropdown/Weekdays/Light'] },
	]);
	assert.equal(catalog.length, controls.length);
	assert.throws(() => curateFixtures({}), /invalid fixture catalog/);
	assert.deepEqual(catalog[0].variants[0], {
		id: 'baseUI/Buttons/Dark', name: 'Dark', group: 'baseUI/Buttons', variant: 'Dark', background: undefined,
	});
});

test('fixture discovery selects only an existing local session, never a cloud or ambiguous endpoint', () => {
	const sessions = [
		{ name: 'baseline', serverUrl: 'http://localhost:5124' },
		{ name: 'current', serverUrl: 'http://localhost:5126' },
	];
	assert.deepEqual(selectFixtureSession(sessions, ''), { session: sessions[1], explorerUrl: 'http://localhost:5126/___explorer' });
	assert.equal(selectFixtureSession(sessions, 'http://localhost:5124/___explorer').session.name, 'baseline');
	assert.equal(selectFixtureSession([sessions[0]], '').session.name, 'baseline');
	assert.throws(() => selectFixtureSession([], ''), /No unambiguous/);
	assert.throws(() => selectFixtureSession([{ name: 'one', serverUrl: 'http://localhost:1' }, { name: 'two', serverUrl: 'http://localhost:2' }], ''), /No unambiguous/);
	assert.throws(() => selectFixtureSession([{ name: 'current', serverUrl: 'https://example.test' }], ''), /loopback/);
	assert.throws(() => selectFixtureSession(sessions, 'http://localhost:9999/___explorer'), /does not match/);
});

test('HTTP validates writes, allowlists source reads, and preserves panel state', async t => {
	const panel = createPanel(root);
	await panel.listen();
	t.after(() => panel.close());
	const get = route => fetch(`${panel.url}${route}`);
	const post = (body, origin = panel.url) => fetch(`${panel.url}/api/view`, {
		method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
	});
	assert.equal((await get('/')).status, 200);
	assert.equal((await get('/canvas.css')).status, 200);
	assert.equal((await get('/canvas.js')).status, 404);
	assert.equal((await get('/navigation.js')).status, 404);
	assert.equal((await get('/browsing.js')).status, 404);
	assert.match(await (await get('/')).text(), /Live design-system source API/);
	assert.equal((await get('/source?file=../../etc/passwd')).status, 404);
	assert.equal((await post({ section: 'tokens' }, 'https://example.test')).status, 403);
	panel.setPublicOrigin('http://127.0.0.1:6006');
	assert.equal((await post({ section: 'tokens' }, 'http://127.0.0.1:6006')).status, 200);
	assert.equal((await fetch(`${panel.url}/api/view`, {
		method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
	})).status, 403);
	assert.equal((await post({ section: 'missing' })).status, 400);
	assert.equal((await post({ query: 'x'.repeat(5000) })).status, 413);
	assert.equal((await post({ theme: 'Light 2026', section: 'tokens', query: 'fontSize' })).status, 200);
	assert.deepEqual((await (await get('/api/system')).json()).view, {
		...defaultView, theme: 'Light 2026', section: 'tokens', query: 'fontSize',
	});
	panel.setView({ section: 'components' });
	assert.equal((await (await get('/api/system')).json()).view.section, 'components');
	const source = await get('/source?file=src/vs/platform/theme/common/sizes/baseSizes.ts');
	assert.equal(source.status, 200);
	assert.match(await source.text(), /id="L97"/);
	panel.setView({ compareTheme: 'Default High Contrast Light' });
	assert.equal((await get('/source?file=extensions/theme-defaults/themes/hc_light.json')).status, 200);
	assert.equal((await get('/missing')).status, 404);
});

test('independent panels do not share view state', async t => {
	const first = createPanel(root);
	const second = createPanel(root);
	await Promise.all([first.listen(), second.listen()]);
	t.after(() => Promise.all([first.close(), second.close()]));
	first.setView({ query: 'button', section: 'tokens' });
	assert.deepEqual(second.view, defaultView);
});

test('control catalog discovery is cached, refreshable, and tied to the connected URL', async t => {
	const calls = [];
	const panel = createPanel(root, async (_root, url) => {
		calls.push(url);
		return { controls: [{ id: 'button', variants: [{ id: 'baseUI/Buttons/Dark' }] }] };
	});
	await panel.listen();
	t.after(() => panel.close());
	const get = route => fetch(`${panel.url}${route}`);
	assert.equal((await get('/api/fixtures')).status, 200);
	await (await get('/api/fixtures')).json();
	panel.setView({ explorerUrl: 'http://localhost:5123/___explorer' });
	await (await get('/api/fixtures')).json();
	await (await get('/api/fixtures')).json();
	await (await get('/api/fixtures?refresh=true')).json();
	panel.setView({ explorerUrl: 'http://localhost:5124/___explorer' });
	await (await get('/api/fixtures')).json();
	assert.deepEqual(calls, ['', 'http://localhost:5123/___explorer', 'http://localhost:5123/___explorer', 'http://localhost:5124/___explorer']);
	if (loadSystem(root).codiconFontAvailable) {
		const font = await get('/codicon.ttf');
		assert.equal(font.headers.get('content-type'), 'font/ttf');
		assert.ok((await font.arrayBuffer()).byteLength > 10000);
	}
});
