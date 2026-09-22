/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { suite, test, type TestContext } from 'node:test';
import { load } from 'js-yaml';
import { clearNoticeBaselineTag } from '../../azure-pipelines/common/tagNoticeBaseline.ts';

const baselineName = 'ThirdPartyNotices.generated.txt';
const metadataName = 'notice-meta.txt';
const tagCommand = '##vso[build.addbuildtag]cg-notice-baseline';
const scriptPath = path.join(import.meta.dirname, '../../azure-pipelines/common/tagNoticeBaseline.ts');

function fixture(context: TestContext, metadata = 'build_id: 467032\nsource_commit: original\n') {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vscode-notice-baseline-'));
	context.after(() => fs.rmSync(root, { recursive: true, force: true }));
	const staged = path.join(root, 'staged');
	const downloaded = path.join(root, 'downloaded');
	for (const directory of [staged, downloaded]) {
		fs.mkdirSync(directory);
		fs.writeFileSync(path.join(directory, baselineName), Buffer.alloc(1025, 'x'));
		fs.writeFileSync(path.join(directory, metadataName), metadata);
	}
	return {
		staged,
		downloaded,
		run: () => spawnSync(process.execPath, [scriptPath, staged, downloaded], { encoding: 'utf8' }),
	};
}

suite('CG NOTICE baseline tagging', () => {
	test('clears only the current build baseline tag before replacement', async () => {
		const requests: { url: string; method: string | undefined; authorization: string | null; body: string; bounded: boolean }[] = [];
		const fetcher: typeof fetch = async (input, init) => {
			requests.push({
				url: input.toString(),
				method: init?.method,
				authorization: new Headers(init?.headers).get('Authorization'),
				body: String(init?.body),
				bounded: init?.signal instanceof AbortSignal,
			});
			return Response.json(['unrelated-tag']);
		};
		await clearNoticeBaselineTag({
			collectionUri: 'https://dev.azure.com/organization',
			projectId: 'project',
			buildId: '467180',
			token: 'test-token',
		}, fetcher);
		assert.deepStrictEqual(requests, [{
			url: 'https://dev.azure.com/organization/project/_apis/build/builds/467180/tags?api-version=7.1',
			method: 'PATCH',
			authorization: 'Bearer test-token',
			body: '{"tagsToRemove":["cg-notice-baseline"]}',
			bounded: true,
		}]);
	});

	for (const status of [401, 403, 429, 500]) {
		test(`surfaces HTTP ${status} when invalidating an old baseline tag`, async () => {
			await assert.rejects(clearNoticeBaselineTag({
				collectionUri: 'https://dev.azure.com/organization/',
				projectId: 'project',
				buildId: '467180',
				token: 'test-token',
			}, async () => new Response(null, { status })), new RegExp(`HTTP ${status}`));
		});
	}

	test('surfaces a failed tag-invalidation request', async () => {
		await assert.rejects(clearNoticeBaselineTag({
			collectionUri: 'https://dev.azure.com/organization/',
			projectId: 'project',
			buildId: '467180',
			token: 'test-token',
		}, async () => { throw new Error('request aborted'); }), /request aborted/);
	});

	test('tags a published baseline just above the size threshold', context => {
		const data = fixture(context);
		const result = data.run();
		assert.deepStrictEqual({
			status: result.status,
			stdout: result.stdout.trim(),
			stderr: result.stderr,
		}, { status: 0, stdout: tagCommand, stderr: '' });
	});

	test('tags a carried-forward baseline without changing its provenance', context => {
		const metadata = 'build_id: 467032\nsource_commit: original\ncarried_forward_by_build: 467180\n';
		const data = fixture(context, metadata);
		const result = data.run();
		assert.deepStrictEqual({
			status: result.status,
			stdout: result.stdout.trim(),
			stagedMetadata: fs.readFileSync(path.join(data.staged, metadataName), 'utf8'),
			publishedMetadata: fs.readFileSync(path.join(data.downloaded, metadataName), 'utf8'),
		}, { status: 0, stdout: tagCommand, stagedMetadata: metadata, publishedMetadata: metadata });
	});

	for (const size of [0, 1, 1024]) {
		test(`does not tag a ${size}-byte CG base`, context => {
			const data = fixture(context);
			for (const directory of [data.staged, data.downloaded]) {
				fs.writeFileSync(path.join(directory, baselineName), Buffer.alloc(size));
			}
			const result = data.run();
			assert.deepStrictEqual({
				status: result.status,
				tagged: result.stdout.includes(tagCommand),
				reportsError: result.stderr.includes('must be larger than 1024 bytes'),
			}, { status: 1, tagged: false, reportsError: true });
		});
	}

	test('does not tag scanner-only output', context => {
		const data = fixture(context);
		fs.unlinkSync(path.join(data.downloaded, baselineName));
		fs.writeFileSync(path.join(data.downloaded, 'ThirdPartyNotices.new.txt'), Buffer.alloc(4096));
		const result = data.run();
		assert.deepStrictEqual({
			status: result.status,
			tagged: result.stdout.includes(tagCommand),
			reportsError: result.stderr.includes('ENOENT'),
		}, { status: 1, tagged: false, reportsError: true });
	});

	for (const name of [baselineName, metadataName]) {
		test(`does not tag a missing published ${name}`, context => {
			const data = fixture(context);
			fs.unlinkSync(path.join(data.downloaded, name));
			const result = data.run();
			assert.deepStrictEqual({
				status: result.status,
				tagged: result.stdout.includes(tagCommand),
				reportsError: result.stderr.includes('ENOENT'),
			}, { status: 1, tagged: false, reportsError: true });
		});

		test(`does not tag a stale or corrupted published ${name}`, context => {
			const data = fixture(context);
			const filePath = path.join(data.downloaded, name);
			const content = fs.readFileSync(filePath);
			content[0] ^= 1;
			fs.writeFileSync(filePath, content);
			const result = data.run();
			assert.deepStrictEqual({
				status: result.status,
				tagged: result.stdout.includes(tagCommand),
				reportsError: result.stderr.includes(`published ${name} does not match`),
			}, { status: 1, tagged: false, reportsError: true });
		});
	}

	test('does not tag a truncated download', context => {
		const data = fixture(context);
		fs.truncateSync(path.join(data.downloaded, baselineName), 1024);
		const result = data.run();
		assert.deepStrictEqual({
			status: result.status,
			tagged: result.stdout.includes(tagCommand),
			reportsError: result.stderr.includes('does not match'),
		}, { status: 1, tagged: false, reportsError: true });
	});

	test('requires nonempty provenance even when both copies match', context => {
		const data = fixture(context, '');
		const result = data.run();
		assert.deepStrictEqual({
			status: result.status,
			tagged: result.stdout.includes(tagCommand),
			reportsError: result.stderr.includes('notice-meta.txt must be larger than 0 bytes'),
		}, { status: 1, tagged: false, reportsError: true });
	});

	test('requires staged files, not just a leftover download', context => {
		const data = fixture(context);
		fs.unlinkSync(path.join(data.staged, baselineName));
		const result = data.run();
		assert.deepStrictEqual({
			status: result.status,
			tagged: result.stdout.includes(tagCommand),
			reportsError: result.stderr.includes('ENOENT'),
		}, { status: 1, tagged: false, reportsError: true });
	});

	test('requires both directory arguments', () => {
		const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
		assert.deepStrictEqual({
			status: result.status,
			tagged: result.stdout.includes(tagCommand),
			reportsError: result.stderr.includes('Usage:'),
		}, { status: 1, tagged: false, reportsError: true });
	});

	test('uses native tag-filtered selection and verifies publication before tagging', () => {
		interface Step {
			displayName: string;
			task?: string;
			script?: string;
			inputs?: Record<string, string | boolean>;
			condition?: string;
			continueOnError?: boolean;
			timeoutInMinutes?: number;
			retryCountOnTaskFailure?: number;
		}
		const pipeline = load(fs.readFileSync(path.join(import.meta.dirname, '../../azure-pipelines/product-quality-checks.yml'), 'utf8')) as {
			jobs: { job: string; timeoutInMinutes: number; steps: Step[] }[];
		};
		const quality = pipeline.jobs.find(job => job.job === 'Quality')!;
		const generation = quality.steps.find(step => step.task === 'notice@0')!;
		assert.deepStrictEqual({
			jobTimeout: quality.timeoutInMinutes,
			taskTimeout: generation.timeoutInMinutes,
			retries: generation.retryCountOnTaskFailure,
			continueOnError: generation.continueOnError,
		}, { jobTimeout: 30, taskTimeout: 20, retries: 3, continueOnError: true });
		const cacheDownloads = quality.steps.filter(step => step.task === 'DownloadBuildArtifacts@1' && step.inputs?.buildType === 'specific');
		assert.deepStrictEqual(cacheDownloads.map(step => ({
			selection: step.inputs?.buildVersionToDownload,
			branch: step.inputs?.branchName,
			tag: step.inputs?.tags,
			allowPartial: step.inputs?.allowPartiallySucceededBuilds,
			buildId: step.inputs?.buildId,
		})), [
			{ selection: 'latestFromBranch', branch: '$(Build.SourceBranch)', tag: 'cg-notice-baseline', allowPartial: true, buildId: undefined },
			{ selection: 'latestFromBranch', branch: 'refs/heads/main', tag: 'cg-notice-baseline', allowPartial: true, buildId: undefined },
		]);

		const uploadIndex = quality.steps.findIndex(step => step.displayName === 'Upload CG NOTICE artifact (fresh or carried-forward)');
		const fallback = quality.steps.find(step => step.displayName === 'Cache: apply NOTICE fallback if CG failed')!;
		const upload = quality.steps[uploadIndex];
		assert.deepStrictEqual({
			fallbackCondition: fallback.condition,
			fallbackContinueOnError: fallback.continueOnError,
			uploadCondition: upload.condition,
			uploadContinueOnError: upload.continueOnError,
		}, {
			fallbackCondition: `and(succeeded(), eq(lower(variables['VSCODE_CIBUILD']), 'false'), ne(variables.CG_NOTICE_OK, 'true'))`,
			fallbackContinueOnError: true,
			uploadCondition: `and(succeeded(), eq(lower(variables['VSCODE_CIBUILD']), 'false'), or(eq(variables.CG_NOTICE_OK, 'true'), in(variables.NOTICE_FROM_CACHE, 'branch', 'main')))`,
			uploadContinueOnError: true,
		});
		const mergeIndex = quality.steps.findIndex(step => step.displayName === 'Build merged NOTICE (scan extensions + merge into .new.txt)');
		const sourcemapIndex = quality.steps.findIndex(step => step.displayName === 'Upload sourcemaps to Azure');
		const readbackIndex = quality.steps.findIndex(step => step.displayName === 'Verify published CG NOTICE baseline');
		const tagIndex = quality.steps.findIndex(step => step.displayName === 'Tag verified CG NOTICE baseline');
		const readback = quality.steps[readbackIndex];
		const tag = quality.steps[tagIndex];
		const stagedCondition = `and(succeeded(), eq(lower(variables['VSCODE_CIBUILD']), 'false'), eq(variables.CG_NOTICE_STAGED, 'true'))`;
		assert.ok(uploadIndex >= 0 && uploadIndex < mergeIndex && mergeIndex < sourcemapIndex && sourcemapIndex < readbackIndex && readbackIndex < tagIndex);
		assert.deepStrictEqual({
			buildType: readback.inputs?.buildType,
			clean: readback.inputs?.cleanDestinationFolder,
			checkFiles: readback.inputs?.checkDownloadedFiles,
			files: String(readback.inputs?.itemPattern).trim().split('\n'),
			readbackCondition: readback.condition,
			tagCondition: tag.condition,
			continueOnError: [readback.continueOnError, tag.continueOnError],
			readbackTimeout: readback.timeoutInMinutes,
		}, {
			buildType: 'current',
			clean: true,
			checkFiles: true,
			files: ['**/ThirdPartyNotices.generated.txt', '**/notice-meta.txt'],
			readbackCondition: stagedCondition,
			tagCondition: stagedCondition,
			continueOnError: [true, true],
			readbackTimeout: 1,
		});
		assert.ok(quality.steps[uploadIndex].script?.startsWith('set -eu\n'));
		const uploadScript = quality.steps[uploadIndex].script!;
		assert.ok(uploadScript.indexOf('tagNoticeBaseline.ts --clear') >= 0
			&& uploadScript.indexOf('tagNoticeBaseline.ts --clear') < uploadScript.indexOf('##vso[artifact.upload'));
		assert.ok(quality.steps[uploadIndex].script?.trimEnd().endsWith('echo "##vso[task.setvariable variable=CG_NOTICE_STAGED]true"'));
		assert.ok(tag.script?.includes('tagNoticeBaseline.ts "$(Build.ArtifactStagingDirectory)" "$(Agent.TempDirectory)/cg-notice-baseline/notice_output"'));
	});
});
