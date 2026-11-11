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
import { getWebCdnConfiguration, validateMobileWebCdnIdentity } from '../../azure-pipelines/web/cdnConfiguration.ts';
import { mobileDirectory, mobileManifestName } from '../../next/mobile.ts';

const commit = '0123456789abcdef0123456789abcdef01234567';

test('normal publication keeps its existing source, commit directory and file inventory', () => {
	assert.deepStrictEqual(getWebCdnConfiguration([], 'insider', commit), {
		source: '../vscode-web', prefix: `insider/${commit}/`, patterns: ['**'], mobile: false,
	});
});

test('mobile publication cannot enter the normal web preload directory', () => {
	assert.deepStrictEqual(getWebCdnConfiguration(['--mobile'], 'insider', commit), {
		source: mobileDirectory,
		prefix: `agents/mobile/insider/${commit}/`,
		patterns: ['out/**', 'node_modules/**', 'extensions/**', mobileManifestName],
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
	await writeFile(join(directory, mobileManifestName), JSON.stringify({
		schemaVersion: 2, kind: 'sessions-mobile', build: { commit, quality: 'insider' },
	}));
	await validateMobileWebCdnIdentity(directory, 'insider', commit);
	await assert.rejects(validateMobileWebCdnIdentity(directory, 'stable', commit), /VSCODE_QUALITY/);
	await assert.rejects(validateMobileWebCdnIdentity(directory, 'insider', 'f'.repeat(40)), /BUILD_SOURCEVERSION/);
});

test('the standard publisher registers mobile separately while preserving web and server-web platform names', () => {
	const moduleUrl = new URL('../../azure-pipelines/common/publish.ts', import.meta.url).href;
	const output = execFileSync(process.execPath, ['--input-type=module', '-e', `
		const { getPlatform } = await import(${JSON.stringify(moduleUrl)});
		console.log(JSON.stringify(['mobile', 'standalone', 'x64'].map(arch => getPlatform('web', 'linux', arch, 'archive-unsigned'))));
	`], { encoding: 'utf8', env: { ...process.env, SYSTEM_ACCESSTOKEN: 'unit-test' } });
	assert.deepStrictEqual(JSON.parse(output.trim()), ['web-mobile', 'web-standalone', 'server-linux-x64-web']);
});

test('both product pipeline entry points keep mobile opt-in and require the existing Web stage', async () => {
	for (const file of ['../../azure-pipelines/product-build.yml', '../../azure-pipelines/product-build-template.yml']) {
		const source = await readFile(new URL(file, import.meta.url), 'utf8');
		const pipeline = load(source) as { parameters: { name: string; default: boolean }[] };
		assert.equal(pipeline.parameters.find(parameter => parameter.name === 'VSCODE_BUILD_WEB_MOBILE')?.default, false);
		assert.ok(source.includes('VSCODE_BUILD_WEB_MOBILE: ${{ parameters.VSCODE_BUILD_WEB_MOBILE }}'));
		assert.ok(source.includes('Mobile web requires a Product build with VSCODE_BUILD_WEB=true'));
	}
});

test('the existing Web job builds a normal archive before publication and guards mobile CDN writes', async () => {
	const source = await readFile(new URL('../../azure-pipelines/web/product-build-web.yml', import.meta.url), 'utf8');
	const pipeline = load(source) as { parameters: { name: string; default: boolean }[]; jobs: { templateContext: { outputs: object[] } }[] };
	assert.equal(pipeline.parameters.find(parameter => parameter.name === 'VSCODE_BUILD_WEB_MOBILE')?.default, false);
	assert.ok(JSON.stringify(pipeline.jobs[0].templateContext.outputs).includes('vscode_web_linux_mobile_archive-unsigned'));
	assert.match(source, /^\s*pnpm run test-mobile\s*$/m);
	assert.ok(source.includes('node --test build/lib/test/mobileWebPublication.test.ts'));
	assert.match(source, /^\s*pnpm run bundle-mobile\s*$/m);
	assert.ok(source.includes('--transform=\'s,^out-mobile,vscode-web-mobile,\''));
	assert.ok(source.includes('out-mobile/mobile.json'));
	assert.ok(source.includes('condition: and(succeeded(), eq(variables[\'VSCODE_PUBLISH\'], \'True\'))'));
	assert.ok(source.indexOf('Build and validate mobile web archive') < source.indexOf('node build/azure-pipelines/upload-cdn.ts --mobile'));
	assert.ok(!source.includes('publish-mobile'));
});

test('mobile archive retries reuse the standard artifact check without changing the ordinary archive guard', async () => {
	const mobileCondition = '${{ if eq(parameters.VSCODE_BUILD_WEB_MOBILE, true) }}';
	type Step = { script?: string; env?: { SYSTEM_ACCESSTOKEN?: string }; [mobileCondition]?: Step[] };
	const source = await readFile(new URL('../../azure-pipelines/web/product-build-web.yml', import.meta.url), 'utf8');
	const pipeline = load(source) as {
		jobs: {
			templateContext: {
				outputs: { artifactName?: string; condition?: string; [mobileCondition]?: { artifactName: string; condition: string }[] }[];
			};
			steps: Step[];
		}[];
	};
	const job = pipeline.jobs[0];
	const mobileSteps = job.steps.flatMap(step => step[mobileCondition] ?? []);
	const mobileCheck = mobileSteps.find(step => step.script?.includes('common/checkForArtifact.ts'));
	const ordinaryCheck = job.steps.find(step => step.script?.includes('common/checkForArtifact.ts'));
	assert.deepStrictEqual({
		outputs: job.templateContext.outputs.flatMap(output => output[mobileCondition] ?? [])
			.map(({ artifactName, condition }) => ({ artifactName, condition })),
		mobileCheck: mobileCheck?.script?.trim().split(/\s+/),
		token: mobileCheck?.env?.SYSTEM_ACCESSTOKEN,
		ordinaryCheck: ordinaryCheck?.script?.trim().split(/\s+/),
		ordinaryCondition: job.templateContext.outputs.find(output => output.artifactName === 'vscode_web_linux_standalone_archive-unsigned')?.condition,
	}, {
		outputs: [{
			artifactName: 'vscode_web_linux_mobile_archive-unsigned',
			condition: 'and(succeeded(), ne(variables[\'WEB_MOBILE_ARCHIVE_PUBLISHED\'], \'true\'))',
		}],
		mobileCheck: ['node', 'build/azure-pipelines/common/checkForArtifact.ts', 'WEB_MOBILE_ARCHIVE_PUBLISHED', 'vscode_web_linux_mobile_archive-unsigned'],
		token: '$(System.AccessToken)',
		ordinaryCheck: ['node', 'build/azure-pipelines/common/checkForArtifact.ts', 'WEB_ARCHIVE_PUBLISHED', 'vscode_web_linux_standalone_archive-unsigned'],
		ordinaryCondition: 'and(succeeded(), ne(variables[\'WEB_ARCHIVE_PUBLISHED\'], \'true\'))',
	});
});
