/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { load } from 'js-yaml';
import { getWebCdnConfiguration, validateMobileWebCdnIdentity } from './cdnConfiguration.ts';

const commit = '0123456789abcdef0123456789abcdef01234567';

test('normal publication keeps its existing source, commit directory and file inventory', () => {
	assert.deepStrictEqual(getWebCdnConfiguration([], 'insider', commit), {
		source: '../vscode-web', prefix: `insider/${commit}/`, patterns: ['**'], mobile: false,
	});
});

test('mobile publication cannot enter the normal web preload directory', () => {
	assert.deepStrictEqual(getWebCdnConfiguration(['--mobile'], 'insider', commit), {
		source: 'out-mobile-preview',
		prefix: `agents/mobile/insider/${commit}/`,
		patterns: ['out/**', 'node_modules/**', 'extensions/**', 'mobile-preview.json'],
		mobile: true,
	});
	for (const [quality, revision] of [['dev', commit], ['stable', undefined], ['stable', '../other']]) {
		assert.throws(() => getWebCdnConfiguration(['--mobile'], quality, revision));
	}
	assert.throws(() => getWebCdnConfiguration(['--mobile', '--other'], 'stable', commit), /Usage/);
});

test('mobile CDN publication verifies the pipeline commit and quality without a second release ID', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'mobile-cdn-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeFile(join(directory, 'mobile-preview.json'), JSON.stringify({
		schemaVersion: 2, kind: 'sessions-mobile-preview', build: { commit, quality: 'insider' },
	}));
	await validateMobileWebCdnIdentity(directory, 'insider', commit);
	await assert.rejects(validateMobileWebCdnIdentity(directory, 'stable', commit), /VSCODE_QUALITY/);
	await assert.rejects(validateMobileWebCdnIdentity(directory, 'insider', 'f'.repeat(40)), /BUILD_SOURCEVERSION/);
});

test('the standard publisher registers mobile separately while preserving web and server-web platform names', () => {
	const moduleUrl = new URL('../common/publish.ts', import.meta.url).href;
	const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
		const { getPlatform } = await import(${JSON.stringify(moduleUrl)});
		console.log(JSON.stringify(['mobile', 'standalone', 'x64'].map(arch => getPlatform('web', 'linux', arch, 'archive-unsigned'))));
	`], { encoding: 'utf8', env: { ...process.env, SYSTEM_ACCESSTOKEN: 'unit-test' } });
	assert.deepStrictEqual(JSON.parse(output.trim()), ['web-mobile', 'web-standalone', 'server-linux-x64-web']);
});

test('both product pipeline entry points keep mobile opt-in and require the existing Web stage', async () => {
	for (const file of ['../product-build.yml', '../product-build-template.yml']) {
		const source = await readFile(new URL(file, import.meta.url), 'utf8');
		const pipeline = load(source) as { parameters: { name: string; default: boolean }[] };
		assert.equal(pipeline.parameters.find(parameter => parameter.name === 'VSCODE_BUILD_WEB_MOBILE')?.default, false);
		assert.ok(source.includes('VSCODE_BUILD_WEB_MOBILE: ${{ parameters.VSCODE_BUILD_WEB_MOBILE }}'));
		assert.ok(source.includes('Mobile web requires a Product build with VSCODE_BUILD_WEB=true'));
	}
});

test('the existing Web job builds a normal archive before publication and guards mobile CDN writes', async () => {
	const source = await readFile(new URL('./product-build-web.yml', import.meta.url), 'utf8');
	const pipeline = load(source) as { parameters: { name: string; default: boolean }[]; jobs: { templateContext: { outputs: object[] } }[] };
	assert.equal(pipeline.parameters.find(parameter => parameter.name === 'VSCODE_BUILD_WEB_MOBILE')?.default, false);
	assert.ok(JSON.stringify(pipeline.jobs[0].templateContext.outputs).includes('vscode_web_linux_mobile_archive-unsigned'));
	assert.ok(source.includes('npm run test-mobile-preview'));
	assert.ok(source.includes('node --test build/azure-pipelines/web/cdnConfiguration.test.ts'));
	assert.ok(source.includes('npm run bundle-mobile-preview'));
	assert.ok(source.includes('-C out-mobile-preview out node_modules extensions mobile-preview.json'));
	assert.ok(source.includes('condition: and(succeeded(), eq(variables[\'VSCODE_PUBLISH\'], \'True\'))'));
	assert.ok(source.indexOf('Build and validate mobile web archive') < source.indexOf('node build/azure-pipelines/upload-cdn.ts --mobile'));
	assert.ok(!source.includes('publish-mobile-preview'));
});
