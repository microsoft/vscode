/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { pipeline as pipelineStreams } from 'node:stream/promises';
import { load } from 'js-yaml';
import yazl from 'yazl';
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

test('both product pipeline entry points enable mobile without rejecting CI or Web-disabled builds', async () => {
	for (const file of ['../../azure-pipelines/product-build.yml', '../../azure-pipelines/product-build-template.yml']) {
		const source = await readFile(new URL(file, import.meta.url), 'utf8');
		const pipeline = load(source) as { parameters: { name: string; displayName?: string; type: string; default: boolean }[] };
		assert.deepStrictEqual(pipeline.parameters.find(parameter => parameter.name === 'VSCODE_BUILD_WEB_MOBILE'), {
			name: 'VSCODE_BUILD_WEB_MOBILE', displayName: '\u{1f3af} Mobile', type: 'boolean', default: true,
		});
		assert.ok(source.includes('VSCODE_BUILD_WEB_MOBILE: ${{ parameters.VSCODE_BUILD_WEB_MOBILE }}'));
		assert.ok(!source.includes('Mobile web requires a Product build with VSCODE_BUILD_WEB=true'));
		assert.ok(source.includes('${{ if and(eq(variables[\'VSCODE_CIBUILD\'], false), eq(variables[\'VSCODE_BUILD_STAGE_WEB\'], true)) }}'));
	}
});

test('mobile has a separate nonblocking job and timeout without weakening the ordinary Web job', async () => {
	const wrapper = await readFile(new URL('../../azure-pipelines/web/product-build-web.yml', import.meta.url), 'utf8');
	const pipeline = load(wrapper) as { parameters: { name: string; default: boolean }[]; jobs: object[] };
	assert.equal(pipeline.parameters.find(parameter => parameter.name === 'VSCODE_BUILD_WEB_MOBILE')?.default, true);
	assert.deepStrictEqual(pipeline.jobs, [
		{ template: 'product-build-web-job.yml', parameters: { VSCODE_POOL_NAME: '${{ parameters.VSCODE_POOL_NAME }}' } },
		{ '${{ if parameters.VSCODE_BUILD_WEB_MOBILE }}': [{ template: 'product-build-web-job.yml', parameters: { VSCODE_POOL_NAME: '${{ parameters.VSCODE_POOL_NAME }}', mobile: true } }] },
	]);
	const source = await readFile(new URL('../../azure-pipelines/web/product-build-web-job.yml', import.meta.url), 'utf8');
	const job = (load(source) as { jobs: { job: string; continueOnError?: boolean; timeoutInMinutes: number; '${{ if parameters.mobile }}': { continueOnError: boolean } }[] }).jobs[0];
	assert.deepStrictEqual({
		name: job.job, timeout: job.timeoutInMinutes, ordinaryContinues: job.continueOnError, mobileContinues: job['${{ if parameters.mobile }}'].continueOnError,
	}, { name: '${{ iif(parameters.mobile, \'Mobile\', \'Web\') }}', timeout: 45, ordinaryContinues: undefined, mobileContinues: true });
	assert.match(source, /^\s*pnpm run test-mobile\s*$/m);
	assert.ok(source.includes('node --test build/lib/test/mobileWebPublication.test.ts'));
	assert.match(source, /^\s*pnpm run bundle-mobile\s*$/m);
	assert.ok(source.includes('--transform=\'s,^out-mobile,vscode-web-mobile,\''));
	assert.ok(source.includes('out-mobile/mobile.json'));
	assert.ok(source.includes('condition: and(succeeded(), eq(variables[\'WEB_MOBILE_ARCHIVE_READY\'], \'true\'), eq(variables[\'VSCODE_PUBLISH\'], \'True\'))'));
	assert.ok(source.indexOf('Build and validate mobile web archive') < source.indexOf('node build/azure-pipelines/upload-cdn.ts --mobile'));
	assert.ok(!source.includes('publish-mobile'));
});

test('mobile archive retries reuse the standard artifact check without changing the ordinary archive guard', async () => {
	const mobileCondition = '${{ if parameters.mobile }}';
	const webCondition = '${{ if not(parameters.mobile) }}';
	type Step = { script?: string; env?: { SYSTEM_ACCESSTOKEN?: string }; [mobileCondition]?: Step[]; [webCondition]?: Step[] };
	type Output = { artifactName?: string; condition?: string; sbomEnabled?: boolean; isProduction?: boolean; [mobileCondition]?: Output[]; [webCondition]?: Output[] };
	const source = await readFile(new URL('../../azure-pipelines/web/product-build-web-job.yml', import.meta.url), 'utf8');
	const pipeline = load(source) as {
		jobs: {
			templateContext: {
				outputs: Output[];
			};
			steps: Step[];
		}[];
	};
	const job = pipeline.jobs[0];
	const mobileSteps = job.steps.flatMap(step => step[mobileCondition] ?? []);
	const mobileCheck = mobileSteps.find(step => step.script?.includes('common/checkForArtifact.ts'));
	const ordinaryCheck = job.steps.flatMap(step => step[webCondition] ?? []).find(step => step.script?.includes('common/checkForArtifact.ts'));
	const mobileArchive = job.templateContext.outputs.flatMap(output => output[mobileCondition] ?? [])[0];
	assert.deepStrictEqual({
		mobileArchive: {
			artifactName: mobileArchive?.artifactName,
			condition: mobileArchive?.condition,
			sbomEnabled: mobileArchive?.sbomEnabled,
			isProduction: mobileArchive?.isProduction,
		},
		mobileCheck: mobileCheck?.script?.trim().split(/\s+/),
		token: mobileCheck?.env?.SYSTEM_ACCESSTOKEN,
		ordinaryCheck: ordinaryCheck?.script?.trim().split(/\s+/),
		ordinaryCondition: job.templateContext.outputs.flatMap(output => output[webCondition] ?? [])[0]?.condition,
	}, {
		mobileArchive: {
			artifactName: 'vscode_web_linux_mobile_archive-unsigned',
			condition: 'and(succeeded(), eq(variables[\'WEB_MOBILE_ARCHIVE_READY\'], \'true\'), ne(variables[\'WEB_MOBILE_ARCHIVE_PUBLISHED\'], \'true\'))',
			sbomEnabled: true,
			isProduction: true,
		},
		mobileCheck: ['node', 'build/azure-pipelines/common/checkForArtifact.ts', 'WEB_MOBILE_ARCHIVE_PUBLISHED', 'vscode_web_linux_mobile_archive-unsigned'],
		token: '$(System.AccessToken)',
		ordinaryCheck: ['node', 'build/azure-pipelines/common/checkForArtifact.ts', 'WEB_ARCHIVE_PUBLISHED', 'vscode_web_linux_standalone_archive-unsigned'],
		ordinaryCondition: 'and(succeeded(), ne(variables[\'WEB_ARCHIVE_PUBLISHED\'], \'true\'))',
	});
});

test('mobile script failures warn and stop the optional job before publishing a partial archive', { skip: process.platform === 'win32' }, async t => {
	const mobileCondition = '${{ if parameters.mobile }}';
	const webCondition = '${{ if not(parameters.mobile) }}';
	type Step = { script?: string; displayName: string; continueOnError?: boolean; condition?: string; [mobileCondition]?: Step[]; [webCondition]?: Step[] };
	const source = await readFile(new URL('../../azure-pipelines/web/product-build-web-job.yml', import.meta.url), 'utf8');
	const pipeline = load(source) as { jobs: { variables: { WEB_MOBILE_ARCHIVE_READY: string }; steps: Step[] }[] };
	const job = pipeline.jobs[0];
	const steps = job.steps.flatMap(step => step[mobileCondition] ?? []);
	const webSteps = job.steps.flatMap(step => step[webCondition] ?? []);
	const build = steps.find(step => step.displayName === 'Build and validate mobile web archive')!;
	const upload = steps.find(step => step.script?.includes('upload-cdn.ts --mobile'))!;
	assert.deepStrictEqual({
		initialReady: job.variables.WEB_MOBILE_ARCHIVE_READY,
		buildContinues: build.continueOnError,
		uploadContinues: upload.continueOnError,
		ordinaryBuildContinues: webSteps.find(step => step.displayName === 'Build')?.continueOnError,
		ordinaryUploadContinues: webSteps.find(step => step.displayName === 'Upload to CDN')?.continueOnError,
	}, { initialReady: 'false', buildContinues: undefined, uploadContinues: undefined, ordinaryBuildContinues: undefined, ordinaryUploadContinues: undefined });
	const directory = await mkdtemp(join(tmpdir(), 'mobile-publication-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const bin = join(directory, 'bin');
	await mkdir(bin);
	for (const command of ['pnpm', 'node', 'tar']) {
		await writeFile(join(bin, command), `#!/bin/sh\nif [ "${command}:$*" = "$FAIL_AT" ]; then exit 7; fi\n`, { mode: 0o755 });
	}
	const script = build.script!.replaceAll('$(Build.ArtifactStagingDirectory)', directory);
	const ready = '##vso[task.setvariable variable=WEB_MOBILE_ARCHIVE_READY]true';
	for (const failure of ['pnpm:run test-mobile', 'node:--test build/lib/test/mobileWebPublication.test.ts', 'pnpm:run bundle-mobile', `tar:--owner=0 --group=0 --transform=s,^out-mobile,vscode-web-mobile, -czf ${directory}/out/web/vscode-web-mobile.tar.gz out-mobile/out out-mobile/node_modules out-mobile/extensions out-mobile/mobile.json`, '']) {
		const result = spawnSync('bash', ['-c', script], {
			cwd: directory, encoding: 'utf8', env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, FAIL_AT: failure },
		});
		assert.deepStrictEqual({
			exit: result.status,
			ready: result.stdout.includes(ready),
			warning: result.stdout.includes('##vso[task.logissue type=warning]'),
		}, { exit: failure ? 7 : 0, ready: !failure, warning: !!failure }, failure);
	}
	const uploadScript = upload.script!.replaceAll(/\$\([A-Z_]+\)/g, 'test');
	const result = spawnSync('bash', ['-c', uploadScript], {
		cwd: directory, encoding: 'utf8', env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}`, FAIL_AT: 'node:build/azure-pipelines/upload-cdn.ts --mobile' },
	});
	assert.deepStrictEqual({ exit: result.status, warning: result.stdout.includes('##vso[task.logissue type=warning]') }, { exit: 7, warning: true });
});

test('asynchronous mobile extraction failures warn instead of terminating the shared publisher', async t => {
	const directory = await mkdtemp(join(tmpdir(), 'mobile-extraction-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	await writeFile(join(directory, 'corrupt.zip'), Buffer.from('504b0506000000000100010000000000000000000000', 'hex'));
	const zip = new yazl.ZipFile();
	zip.addBuffer(Buffer.from('mobile'), 'file.txt');
	zip.end();
	await pipelineStreams(zip.outputStream, createWriteStream(join(directory, 'valid.zip')));
	await mkdir(join(directory, 'blocked', 'file.txt'), { recursive: true });
	await writeFile(join(directory, 'blocked-parent'), '');
	const publisherUrl = new URL('../../azure-pipelines/common/publish.ts', import.meta.url).href;
	const gateUrl = new URL('../../azure-pipelines/common/publishGate.ts', import.meta.url).href;
	const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
		import assert from 'node:assert/strict';
		import { readFile } from 'node:fs/promises';
		import { join } from 'node:path';
		const { unzip } = await import(${JSON.stringify(publisherUrl)});
		const { runArtifactPublishOperation } = await import(${JSON.stringify(gateUrl)});
		const directory = ${JSON.stringify(directory)};
		const corrupt = () => unzip(join(directory, 'corrupt.zip'), join(directory, 'output'));
		const blocked = () => unzip(join(directory, 'valid.zip'), join(directory, 'blocked'));
		const blockedParent = () => unzip(join(directory, 'valid.zip'), join(directory, 'blocked-parent', 'output'));
		for (const operation of [corrupt, blocked, blockedParent]) {
			assert.deepStrictEqual(await runArtifactPublishOperation('vscode_web_linux_mobile_archive-unsigned', operation), { succeeded: false });
			await assert.rejects(runArtifactPublishOperation('vscode_web_linux_standalone_archive-unsigned', operation));
		}
		const files = await unzip(join(directory, 'valid.zip'), join(directory, 'output'));
		assert.deepStrictEqual(files, [join(directory, 'output', 'file.txt')]);
		assert.equal(await readFile(files[0], 'utf8'), 'mobile');
	`], { encoding: 'utf8', env: { ...process.env, SYSTEM_ACCESSTOKEN: 'unit-test' }, timeout: 30_000 });
	assert.equal(result.status, 0, result.stderr || result.error?.message);
});
