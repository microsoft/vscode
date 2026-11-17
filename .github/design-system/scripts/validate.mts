/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { Browser, Page } from '@playwright/test';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));

interface ValidationOptions {
	root?: string;
	viewer?: string;
	output?: string;
	sourcesOnly?: boolean;
}

interface ValidationReport {
	root: string;
	viewer: string;
	viewerVersion: string;
	identity: string;
	sources: 'passed';
	renderedTopics?: number;
	preview?: string;
	limits?: string;
}

export async function checkRenderedTopic(page: Page, topic: string): Promise<void> {
	const article = page.locator(`article[data-topic="${topic}"]`);
	await article.locator('h1').waitFor({ state: 'visible', timeout: 30000 });
	await page.waitForFunction(id => {
		const article = document.querySelector(`article[data-topic="${id}"]`);
		return article?.getAttribute('aria-busy') === 'false';
	}, topic, { timeout: 30000 });
	assert.ok((await article.locator('h1').innerText()).trim(), `${topic}: empty heading`);
	assert.ok((await article.locator('.topic-content').innerText()).trim(), `${topic}: empty chapter`);
	assert.equal(await article.locator('.topic-content[data-topic-state="error"], #problem:not([hidden])').count(), 0, `${topic}: chapter rendering failed`);
	await page.waitForFunction(() => !document.querySelector('[data-preview-state="connecting"], [data-preview-state="loading"]'), undefined, { timeout: 30000 });
	const unavailable = await article.locator('[data-preview-state="unavailable"]').allTextContents();
	assert.deepEqual(unavailable, [], `${topic}: live example unavailable`);
	await page.evaluate(async () => {
		await document.fonts.ready;
		await Promise.all([...document.images].map(image => image.decode()));
	});
}

export async function validateDesignSystem({ root = checkout, viewer, output, sourcesOnly = false }: ValidationOptions = {}): Promise<ValidationReport> {
	root = await realpath(root);
	viewer = await realpath(viewer ?? path.join(root, '.github/extensions/vscode-design-system'));
	const metadata: { name: string; version: string } = JSON.parse(await readFile(path.join(viewer, 'package.json'), 'utf8'));
	assert.equal(metadata.name, 'vscode-design-system', 'Select a vscode-design-system viewer installation or clone');
	assert.ok(typeof metadata.version === 'string', 'The viewer must declare its version');
	const run = (script: string, args: string[]) => execFileSync(process.execPath, [path.join(viewer, 'scripts', script), ...args], {
		cwd: root, stdio: 'inherit', timeout: 180000,
	});
	run('book.mjs', ['validate', '--root', root]);
	const identity = execFileSync('git', ['log', '-1', '--format=%H%n%D'], { cwd: root, encoding: 'utf8' }).trim();
	const report: ValidationReport = { root, viewer, viewerVersion: metadata.version, identity, sources: 'passed' };
	if (sourcesOnly) {
		console.log(JSON.stringify(report, null, '\t'));
		return report;
	}
	const require = createRequire(path.join(root, 'package.json'));
	const { chromium }: typeof import('@playwright/test') = require('@playwright/test');
	const directory = output ? path.resolve(output) : await mkdtemp(path.join(os.tmpdir(), 'design-system-check-'));
	if (output) { await mkdir(directory); }
	let browser: Browser | undefined;
	try {
		const preview = path.join(directory, 'design-system.html');
		run('export.mjs', [preview, '--root', root]);
		browser = await chromium.launch({ headless: true });
		const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
		const errors: string[] = [];
		page.on('pageerror', error => errors.push(error.message));
		page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); } });
		page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
		page.on('response', response => { if (response.status() >= 400) { errors.push(`${response.status()} ${response.url()}`); } });
		await page.goto(pathToFileURL(preview).href);
		await page.waitForFunction(() => Reflect.has(globalThis, 'designSnapshot'), undefined, { timeout: 30000 });
		const topics = await page.evaluate(() => {
			const snapshot: { catalog: { id: string }[] } = Reflect.get(globalThis, 'designSnapshot');
			return snapshot.catalog.map(({ id }) => id);
		});
		assert.ok(topics.length, 'The exported book has no chapters');
		for (const topic of topics) {
			const url = pathToFileURL(preview);
			url.searchParams.set('topic', topic);
			await page.goto(url.href);
			await checkRenderedTopic(page, topic);
			assert.deepEqual(errors, [], `${topic}: browser errors`);
			console.log(`Rendered ${topic}`);
		}
		Object.assign(report, { renderedTopics: topics.length, preview: output ? preview : undefined,
			limits: 'Portable Chromium smoke check; not native canvas lifecycle, live-server refresh, every fixture variant, or visual approval.' });
		if (output) { await writeFile(path.join(directory, 'validation.json'), `${JSON.stringify(report, null, '\t')}\n`); }
		console.log(JSON.stringify(report, null, '\t'));
		return report;
	} finally {
		await browser?.close();
		if (!output) { await rm(directory, { recursive: true, force: true }); }
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
	const { values } = parseArgs({ options: {
		root: { type: 'string' }, viewer: { type: 'string' }, output: { type: 'string' },
		'sources-only': { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
	} });
	if (values.help) {
		console.log('Usage: node .github/design-system/scripts/validate.mts [--root <checkout>] [--viewer <viewer clone or installation>] [--sources-only] [--output <new directory>]');
	} else {
		await validateDesignSystem({ ...values, sourcesOnly: values['sources-only'] });
	}
}
