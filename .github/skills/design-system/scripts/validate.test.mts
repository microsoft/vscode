/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkDesignPlacement, discoverDesignSpecs } from './validate.mts';

async function writeSpec(root: string, file: string, metadata: Record<string, unknown>, body = '# Spec'): Promise<void> {
	const frontMatter = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
	const absolutePath = path.join(root, file);
	await mkdir(path.dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, `---\n${frontMatter}\n---\n\n${body}\n`);
}

const designRoot = '.github/skills/design-system';

async function createCheckout(root: string): Promise<void> {
	await mkdir(path.join(root, 'src/vs/base/ui'), { recursive: true });
	await writeFile(path.join(root, 'src/vs/base/ui/button.ts'), 'export class Button {}');
	await writeFile(path.join(root, 'src/vs/base/ui/button.fixture.ts'), 'export const ButtonFixture = {};');
	await writeFile(path.join(root, 'src/vs/base/ui/button.css'), '.button { gap: 4px; }');
	await writeSpec(root, `${designRoot}/foundations/principles.design.md`, {
		title: 'Principles',
		kind: 'foundation',
		order: 1
	});
	await writeSpec(root, `${designRoot}/foundations/spacing.design.md`, {
		title: 'Spacing',
		kind: 'foundation',
		isDraft: false,
		order: 6,
		presentation: 'foundations',
		tokenDomain: true,
		specimens: {
			ownership: [['Gap', { $text: 'Gap ownership' }]],
			spacing: { patterns: [{ id: 'siblings', rules: [{ file: 'src/vs/base/ui/button.css', selector: '.button', properties: ['gap'] }] }] }
		}
	}, '# Spacing\n\n## Gap ownership\n\nSiblings own the gap.');
	await writeSpec(root, `${designRoot}/patterns/modal.design.md`, {
		title: 'Modal',
		kind: 'pattern',
		order: 1
	});
	await writeSpec(root, 'src/vs/base/ui/button.design.md', {
		title: 'Button',
		kind: 'component',
		isDraft: true,
		component: { implementation: 'src/vs/base/ui/button.ts', api: ['Button'], fixtures: ['baseUI/Buttons'] }
	});
	await writeSpec(root, 'src/vs/base/ui/button-bar.design.md', {
		title: 'Button bar',
		kind: 'component',
		isDraft: true
	});
}

test('discovers ordered specs and their owned bindings without a separate registry', async () => {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-discovery-')));
	try {
		await createCheckout(root);
		const specs = await discoverDesignSpecs(root);
		assert.deepStrictEqual({
			specs: specs.map(spec => [spec.id, spec.kind, spec.isDraft, spec.presentation ?? null, spec.tokenDomain ?? null]),
			button: specs.find(spec => spec.id === 'button')?.component,
			spacing: specs.find(spec => spec.id === 'spacing')?.specimens,
			content: existsSync(path.join(root, designRoot, 'content'))
		}, {
			specs: [
				['principles', 'foundation', false, null, null],
				['spacing', 'foundation', false, 'foundations', true],
				['modal', 'pattern', false, null, null],
				['button', 'component', true, null, null],
				['button-bar', 'component', true, null, null]
			],
			button: { implementation: 'src/vs/base/ui/button.ts', api: ['Button'], fixtures: ['baseUI/Buttons'] },
			spacing: {
				ownership: [['Gap', { $text: 'Gap ownership' }]],
				spacing: { patterns: [{ id: 'siblings', rules: [{ file: 'src/vs/base/ui/button.css', selector: '.button', properties: ['gap'] }] }] }
			},
			content: false
		});
		// The default checkout root is a directory URL path with a trailing separator.
		assert.deepStrictEqual(await discoverDesignSpecs(`${root}${path.sep}`), specs);
		assert.deepStrictEqual(JSON.parse(execFileSync(process.execPath, [
			fileURLToPath(new URL('./validate.mts', import.meta.url)), '--root', root, '--list'
		], { encoding: 'utf8' })), specs.map(({ id, path, title, kind, isDraft, order }) => ({
			id, path, title, kind, isDraft, ...(order === undefined ? {} : { order })
		})));
		await checkDesignPlacement(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('rejects bindings that are misplaced, unsupported, or duplicate chapter structure', async () => {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-bindings-')));
	try {
		await createCheckout(root);
		const foundation = `${designRoot}/foundations/example.design.md`;
		const component = 'src/vs/base/ui/button.design.md';
		const cases: [string, Record<string, unknown>, RegExp][] = [
			[foundation, { title: 'Example', kind: 'foundation', isDraft: true, presentation: 'gallery' }, /unsupported presentation 'gallery'/],
			[foundation, { title: 'Example', kind: 'foundation', isDraft: true, tokenDomain: 'yes' }, /'tokenDomain' must be a boolean/],
			[foundation, { title: 'Example', kind: 'foundation', isDraft: true, specimens: { sections: [] } }, /must not duplicate chapter identity or structure/],
			[foundation, { title: 'Example', kind: 'foundation', isDraft: true, specimens: { source: 'src/vs/other.md' } }, /must not duplicate chapter identity or structure/],
			[foundation, { title: 'Example', kind: 'foundation', isDraft: true, specimens: { isDraft: true } }, /must not duplicate chapter identity or structure/],
			[foundation, { title: 'Example', kind: 'foundation', isDraft: true, specimens: { preview: { $ref: 'x' } } }, /invalid example bindings/],
			[foundation, { title: 'Example', kind: 'foundation', isDraft: true, specimens: { preview: { file: 'src/vs/base/ui/missing.css' } } }, /example\.design\.md: referenced file does not exist: src\/vs\/base\/ui\/missing\.css/],
			[foundation, { title: 'Example', kind: 'foundation', isDraft: true, component: { implementation: 'src/vs/base/ui/button.ts' } }, /invalid component bindings/],
			[component, { title: 'Button', kind: 'primitive', isDraft: true }, /kind 'primitive' is not valid under component/],
			[component, { title: 'Button', kind: 'composite', isDraft: true }, /kind 'composite' is not valid under component/],
			[component, { title: 'Button', kind: 'component', isDraft: true, presentation: 'guidance' }, /chapter bindings belong to shared guidance/],
			[component, { title: 'Button', kind: 'component', isDraft: true, component: { owner: 'src/vs/base/ui/button.ts' } }, /invalid component bindings/],
			[component, { title: 'Button', kind: 'component', isDraft: true, component: { api: ['Button'] } }, /API selections require an implementation/]
		];
		const results: string[] = [];
		for (const [file, metadata, expected] of cases) {
			await writeSpec(root, file, metadata);
			await assert.rejects(discoverDesignSpecs(root), expected);
			results.push(file);
			await createCheckout(root);
			await rm(path.join(root, foundation), { force: true });
		}

		await mkdir(path.join(root, 'src/vs/base/other'), { recursive: true });
		await writeSpec(root, 'src/vs/base/other/button.design.md', {
			id: 'other-button',
			title: 'Other button',
			kind: 'component',
			isDraft: true,
			component: { implementation: 'src/vs/base/ui/button.ts' }
		});
		await assert.rejects(discoverDesignSpecs(root), /must be beside its implementation/);
		assert.equal(results.length, cases.length);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('validates draft flags and replacement links and rejects ambiguous metadata', async () => {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-metadata-')));
	try {
		await createCheckout(root);
		const deprecatedPath = '.github/skills/design-system/patterns/old-modal.design.md';
		const metadata = {
			id: 'old-modal',
			title: 'Old modal',
			kind: 'pattern',
			replacedBy: 'modal'
		};
		await writeSpec(root, deprecatedPath, metadata);
		await checkDesignPlacement(root);

		const cases: [Record<string, unknown>, RegExp][] = [
			[{ isDraft: true }, /'replacedBy' is not valid on draft specs/],
			[{ isDraft: 'true' }, /'isDraft' must be a boolean/],
			[{ isDraft: null }, /'isDraft' must be a boolean/],
			[{ status: 'deprecated' }, /use 'isDraft' instead of 'status'/],
			[{ replacedBy: 'missing' }, /replacement 'missing'/],
			[{ kind: 'primitive' }, /kind 'primitive' is not valid under pattern/]
		];
		for (const [invalid, expected] of cases) {
			await writeSpec(root, deprecatedPath, { ...metadata, ...invalid });
			await assert.rejects(discoverDesignSpecs(root), expected);
		}
		await writeSpec(root, deprecatedPath, metadata);
		await writeSpec(root, '.github/skills/design-system/patterns/duplicate.design.md', {
			id: 'modal',
			title: 'Duplicate modal',
			kind: 'pattern'
		});
		await assert.rejects(discoverDesignSpecs(root), /Duplicate spec id 'modal'/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('preserves UTF-8 metadata across read boundaries', async () => {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-unicode-')));
	try {
		await createCheckout(root);
		const prefix = '---\ntitle: "Elevation"\nkind: "foundation"\nspecimens:\n  label: "';
		const label = 'a'.repeat(4095 - Buffer.byteLength(prefix)) + '\u00e9';
		await writeFile(path.join(root, designRoot, 'foundations/elevation.design.md'), `${prefix}${label}"\n---\n# Elevation\n`);
		const elevation = (await discoverDesignSpecs(root)).find(spec => spec.id === 'elevation');
		assert.deepStrictEqual({ title: elevation?.title, label: elevation?.specimens?.label }, { title: 'Elevation', label });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('bounds front matter by encoded bytes rather than character count', async () => {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-metadata-limit-')));
	try {
		await createCheckout(root);
		const prefix = 'title: "Elevation"\nkind: "foundation"\nspecimens:\n  label: "';
		const available = 64 * 1024 - Buffer.byteLength(prefix + '"');
		const label = '\u00e9'.repeat(Math.floor(available / 2)) + 'a'.repeat(available % 2);
		const file = path.join(root, designRoot, 'foundations/elevation.design.md');
		await writeFile(file, `---\n${prefix}${label}"\n---\n# Elevation\n`);
		assert.equal((await discoverDesignSpecs(root)).find(spec => spec.id === 'elevation')?.specimens?.label, label);
		await writeFile(file, `---\n${prefix}${label}a"\n---\n# Elevation\n`);
		await assert.rejects(discoverDesignSpecs(root), /oversized YAML front matter/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('Colors specification owns its chapter and links to baseColors.ts', async () => {
	const root = fileURLToPath(new URL('../../../../', import.meta.url));
	const expectedSpec = '.github/skills/design-system/foundations/colors.design.md';
	const colors = (await discoverDesignSpecs(await realpath(root))).find(spec => spec.id === 'colors');
	assert.deepStrictEqual({ path: colors?.path, presentation: colors?.presentation }, { path: expectedSpec, presentation: 'foundations' });

	const spec = await readFile(path.join(root, expectedSpec), 'utf8');
	const baseColorsLink = /\[baseColors\.ts\]\((?<target>[^)]+)\)/.exec(spec)?.groups?.target;
	assert.ok(baseColorsLink);
	assert.equal(
		await realpath(path.resolve(path.dirname(path.join(root, expectedSpec)), baseColorsLink)),
		await realpath(path.join(root, 'src/vs/platform/theme/common/colors/baseColors.ts'))
	);
});
