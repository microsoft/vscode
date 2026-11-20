/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { checkDesignPlacement, checkRenderedSnapshot, discoverDesignSpecs, validateDesignSystem } from './validate.mts';

async function writeJson(file: string, value: object): Promise<void> {
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, JSON.stringify(value, null, '\t'));
}

async function writeSpec(root: string, file: string, metadata: Record<string, string | number | boolean>, body = '# Spec'): Promise<void> {
	const frontMatter = Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
	const absolutePath = path.join(root, file);
	await mkdir(path.dirname(absolutePath), { recursive: true });
	await writeFile(absolutePath, `---\n${frontMatter}\n---\n\n${body}\n`);
}

async function createCheckout(root: string): Promise<void> {
	const designRoot = '.github/skills/design-system';
	await mkdir(path.join(root, `${designRoot}/foundations`), { recursive: true });
	await mkdir(path.join(root, `${designRoot}/patterns`), { recursive: true });
	await mkdir(path.join(root, `${designRoot}/content/topics`), { recursive: true });
	await mkdir(path.join(root, `${designRoot}/content/components`), { recursive: true });
	await mkdir(path.join(root, 'src/vs/base/ui'), { recursive: true });
	await writeSpec(root, `${designRoot}/foundations/principles.design.md`, {
		title: 'Principles',
		kind: 'foundation',
		status: 'stable',
		order: 1
	});
	await writeSpec(root, `${designRoot}/foundations/colors.design.md`, {
		title: 'Colors',
		kind: 'foundation',
		status: 'stable',
		order: 6
	});
	await writeSpec(root, `${designRoot}/patterns/modal.design.md`, {
		title: 'Modal',
		kind: 'pattern',
		status: 'stable',
		order: 1
	});
	await writeSpec(root, 'src/vs/base/ui/button.design.md', {
		title: 'Button',
		kind: 'primitive',
		status: 'draft'
	});
	await writeSpec(root, 'src/vs/base/ui/button-bar.design.md', {
		title: 'Button bar',
		kind: 'composite',
		status: 'draft'
	});
	await writeFile(path.join(root, 'src/vs/base/ui/button.fixture.tsx'), 'export const ButtonFixture = {};');
	for (const [id, source] of [
		['principles', `${designRoot}/foundations/principles.design.md`],
		['colors', `${designRoot}/foundations/colors.design.md`],
		['modal', `${designRoot}/patterns/modal.design.md`],
		['documentation', `${designRoot}/references/document-library.md`],
		['components', `${designRoot}/references/component-overview.md`]
	]) {
		if (id === 'documentation' || id === 'components') {
			await mkdir(path.dirname(path.join(root, source)), { recursive: true });
			await writeFile(path.join(root, source), `# ${id}`);
		}
		await writeJson(path.join(root, `${designRoot}/content/topics/${id}.json`), {
			version: 1,
			id,
			renderer: id === 'documentation' ? 'documents' : id === 'components' ? 'components' : id === 'modal' ? 'patterns' : 'foundations',
			source,
			content: {}
		});
	}
	await writeJson(path.join(root, `${designRoot}/content/components/curation.json`), {
		productControls: [{
			id: 'button',
			owner: 'src/vs/base/ui/button.ts',
			design: 'src/vs/base/ui/button.design.md'
		}],
		additions: [],
		families: [['button', { design: 'src/vs/base/ui/button.design.md' }]]
	});
	await writeFile(path.join(root, 'src/vs/base/ui/button.ts'), 'export class Button {}');
}

test('discovers ordered specs from metadata without promoting nearby fixtures', async () => {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-discovery-')));
	try {
		await createCheckout(root);
		const specs = await discoverDesignSpecs(root);
		assert.deepEqual(specs.map(spec => [spec.id, spec.kind]), [
			['principles', 'foundation'],
			['colors', 'foundation'],
			['modal', 'pattern'],
			['button', 'primitive'],
			['button-bar', 'composite']
		]);
		await checkDesignPlacement(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('validates deprecated redirects and rejects missing, invalid, or ambiguous metadata', async () => {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-metadata-')));
	try {
		await createCheckout(root);
		const deprecatedPath = '.github/skills/design-system/patterns/old-modal.design.md';
		await writeSpec(root, deprecatedPath, {
			id: 'old-modal',
			title: 'Old modal',
			kind: 'pattern',
			status: 'deprecated',
			replacedBy: 'modal'
		});
		await checkDesignPlacement(root);

		await writeSpec(root, deprecatedPath, {
			id: 'old-modal',
			title: 'Old modal',
			kind: 'pattern',
			status: 'deprecated'
		});
		await assert.rejects(discoverDesignSpecs(root), /deprecated specs require 'replacedBy'/);

		await writeSpec(root, deprecatedPath, {
			id: 'old-modal',
			title: 'Old modal',
			kind: 'pattern',
			status: 'deprecated',
			replacedBy: 'missing'
		});
		await assert.rejects(discoverDesignSpecs(root), /replacement 'missing'/);

		await writeSpec(root, deprecatedPath, {
			id: 'old-modal',
			title: 'Old modal',
			kind: 'primitive',
			status: 'deprecated',
			replacedBy: 'modal'
		});
		await assert.rejects(discoverDesignSpecs(root), /kind 'primitive' is not valid under pattern/);

		await writeSpec(root, deprecatedPath, {
			id: 'old-modal',
			title: 'Old modal',
			kind: 'pattern',
			status: 'unknown',
			replacedBy: 'modal'
		});
		await assert.rejects(discoverDesignSpecs(root), /status 'unknown'/);

		await writeSpec(root, deprecatedPath, {
			id: 'old-modal',
			title: 'Old modal',
			kind: 'pattern',
			status: 'deprecated',
			replacedBy: 'modal'
		});
		await writeSpec(root, '.github/skills/design-system/foundations/missing-status.design.md', {
			title: 'Missing status',
			kind: 'foundation'
		});
		await assert.rejects(discoverDesignSpecs(root), /requires a non-empty 'status' string/);

		await rm(path.join(root, '.github/skills/design-system/foundations/missing-status.design.md'));
		await writeSpec(root, '.github/skills/design-system/patterns/duplicate.design.md', {
			id: 'modal',
			title: 'Duplicate modal',
			kind: 'pattern',
			status: 'stable'
		});
		await assert.rejects(discoverDesignSpecs(root), /Duplicate spec id 'modal'/);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test('snapshot checks require the book shell and reject unresolved placeholders', async () => {
	const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-render-')));
	try {
		const file = path.join(directory, 'design-system.html');
		await writeFile(file, '<main id="reference"></main><script id="snapshot-payload"></script><title>Visual Studio Code Design System</title>');
		await checkRenderedSnapshot(file);
		await writeFile(file, '<main id="reference"></main><script id="snapshot-payload">[[unresolved]]</script><title>Visual Studio Code Design System</title>');
		await assert.rejects(checkRenderedSnapshot(file), /Unresolved placeholder/);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('a separately selected viewer validates the selected checkout, not its own content', async () => {
	const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-system-roots-')));
	try {
		const root = path.join(directory, 'content');
		const viewer = path.join(directory, 'viewer');
		execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', fileURLToPath(new URL('../../../../', import.meta.url)), root]);
		await createCheckout(root);
		await writeFile(path.join(root, 'content.txt'), 'Selected checkout');
		await mkdir(path.join(viewer, 'scripts'), { recursive: true });
		await writeFile(path.join(viewer, 'content.txt'), 'Wrong checkout');
		await writeFile(path.join(viewer, 'package.json'), JSON.stringify({ name: 'vscode-design-system', version: 'test-viewer' }));
		await writeFile(path.join(viewer, 'scripts/book.mjs'), `
			import assert from 'node:assert/strict';
			import { readFileSync, realpathSync } from 'node:fs';
			import path from 'node:path';
			const [command, flag, root] = process.argv.slice(2);
			assert.deepEqual([command, flag], ['validate', '--root']);
			assert.equal(realpathSync(process.cwd()), root);
			assert.equal(readFileSync(path.join(root, 'content.txt'), 'utf8'), 'Selected checkout');
		`);
		const report = await validateDesignSystem({ root, viewer, sourcesOnly: true });
		assert.deepEqual({
			root: path.relative(directory, report.root),
			viewer: path.relative(directory, report.viewer!),
			version: report.viewerVersion,
			sources: report.sources,
			exportedTopics: report.exportedTopics
		}, {
			root: 'content',
			viewer: 'viewer',
			version: 'test-viewer',
			sources: 'passed',
			exportedTopics: undefined
		});
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('full validation calls the selected viewer CLI and exports its complete topic count', async () => {
	const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-system-export-validation-')));
	try {
		const root = path.join(directory, 'content');
		const viewer = path.join(directory, 'viewer');
		const output = path.join(directory, 'output');
		execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', fileURLToPath(new URL('../../../../', import.meta.url)), root]);
		await createCheckout(root);
		await mkdir(path.join(viewer, 'scripts'), { recursive: true });
		await writeFile(path.join(viewer, 'package.json'), JSON.stringify({ name: 'vscode-design-system', version: 'test-viewer' }));
		await writeFile(path.join(viewer, 'scripts/book.mjs'), `
			import assert from 'node:assert/strict';
			import { realpathSync } from 'node:fs';
			const [command, flag, root] = process.argv.slice(2);
			assert.equal(realpathSync(process.cwd()), root);
			assert.equal(flag, '--root');
			assert.ok(['validate', 'list'].includes(command));
			console.log(JSON.stringify(command === 'list' ? { topics: [{ id: 'colors' }, { id: 'component-button' }] } : { valid: true }));
		`);
		await writeFile(path.join(viewer, 'scripts/export.mjs'), `
			import assert from 'node:assert/strict';
			import { writeFileSync } from 'node:fs';
			const [output, flag, root] = process.argv.slice(2);
			assert.equal(flag, '--root');
			assert.equal(root, ${JSON.stringify(root)});
			writeFileSync(output, '<main id="reference"></main><script id="snapshot-payload"></script><title>Visual Studio Code Design System</title>');
			console.log(JSON.stringify({ topics: 2 }));
		`);
		const report = await validateDesignSystem({ root, viewer, output });
		assert.equal(report.exportedTopics, 2);
		assert.ok((await readFile(path.join(output, 'design-system.html'), 'utf8')).includes('snapshot-payload'));
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});

test('Colors chapter keeps its specification as the primary source and links to baseColors.ts', async () => {
	const root = fileURLToPath(new URL('../../../../', import.meta.url));
	const expectedSpec = '.github/skills/design-system/foundations/colors.design.md';
	const composition = JSON.parse(await readFile(path.join(root, '.github/skills/design-system/content/topics/colors.json'), 'utf8')) as {
		source: string;
		sources: { file: string }[];
	};
	assert.equal(composition.source, expectedSpec);
	assert.ok(composition.sources.some(source => source.file === expectedSpec));

	const spec = await readFile(path.join(root, expectedSpec), 'utf8');
	const baseColorsLink = /\[baseColors\.ts\]\((?<target>[^)]+)\)/.exec(spec)?.groups?.target;
	assert.ok(baseColorsLink);
	assert.equal(
		await realpath(path.resolve(path.dirname(path.join(root, expectedSpec)), baseColorsLink)),
		await realpath(path.join(root, 'src/vs/platform/theme/common/colors/baseColors.ts'))
	);
});
