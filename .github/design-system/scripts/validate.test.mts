/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from '@playwright/test';
import { checkDesignPlacement, checkRenderedTopic, validateDesignSystem } from './validate.mts';

let browser: Browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

test('hybrid placement rejects unregistered specs, misplaced shared guidance, and chained bookmarks', async () => {
	const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-placement-')));
	const directory = '.github/design-system';
	const design = `${directory}/sample.design.md`;
	const map = { topics: [{ id: 'sample', kind: 'foundation', design, page: 'content/topics/sample.json' }], documentAliases: { 'old-sample.md': design } };
	const saveMap = async (value: object) => writeFile(path.join(root, directory, 'topics.json'), JSON.stringify(value));
	try {
		await mkdir(path.join(root, directory, 'content/topics'), { recursive: true });
		await mkdir(path.join(root, directory, 'content/components'), { recursive: true });
		await mkdir(path.join(root, 'src/vs'), { recursive: true });
		await writeFile(path.join(root, design), '# Sample');
		await writeFile(path.join(root, directory, 'content/topics/sample.json'), JSON.stringify({ source: design }));
		await writeFile(path.join(root, directory, 'content/components/curation.json'), JSON.stringify({ productControls: [], additions: [], families: [] }));
		await saveMap(map);
		await checkDesignPlacement(root);
		await saveMap({ ...map, topics: [{ ...map.topics[0], design: 'src/vs/sample.design.md' }] });
		await assert.rejects(checkDesignPlacement(root), /shared specs must be flat/);
		await saveMap({ ...map, documentAliases: { 'old-sample.md': 'another.md', 'another.md': design } });
		await assert.rejects(checkDesignPlacement(root), /must resolve directly/);
		await saveMap(map);
		await writeFile(path.join(root, directory, 'orphan.design.md'), '# Orphan');
		await assert.rejects(checkDesignPlacement(root), /Unregistered design specification/);
	} finally { await rm(root, { recursive: true, force: true }); }
});

test('render checks reject empty chapters, reported errors, and unavailable examples', async () => {
	const page = await browser.newPage();
	try {
		for (const { body, error } of [
			{ body: '<p>Source-backed guidance</p>' },
			{ body: '', error: /empty chapter/ },
			{ body: '<p>Stale content</p><details id="problem">Binding failed</details>', error: /chapter rendering failed/ },
			{ body: '<p data-preview-state="unavailable">Fixture failed</p>', error: /live example unavailable/ },
		]) {
			await page.setContent(`<article data-topic="principles" aria-busy="false"><h1>Principles</h1><section class="topic-content">${body}</section></article>`);
			if (error) {
				await assert.rejects(checkRenderedTopic(page, 'principles'), error);
			} else {
				await checkRenderedTopic(page, 'principles');
			}
		}
	} finally { await page.close(); }
});

test('a separately selected viewer validates the selected checkout, not its own content', async () => {
	const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'design-system-roots-')));
	try {
		const root = path.join(directory, 'content');
		const viewer = path.join(directory, 'viewer');
		execFileSync('git', ['clone', '--quiet', '--shared', '--no-checkout', fileURLToPath(new URL('../../../', import.meta.url)), root]);
		await mkdir(path.join(viewer, 'scripts'), { recursive: true });
		await writeFile(path.join(root, 'content.txt'), 'Selected checkout');
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
		assert.deepEqual({ root: path.relative(directory, report.root), viewer: path.relative(directory, report.viewer),
			version: report.viewerVersion, sources: report.sources, rendered: report.renderedTopics },
		{ root: 'content', viewer: 'viewer', version: 'test-viewer', sources: 'passed', rendered: undefined });
	} finally { await rm(directory, { recursive: true, force: true }); }
});
