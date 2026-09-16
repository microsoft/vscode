/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { suite, test } from 'node:test';
import { fileURLToPath } from 'url';
import { checkProductArtifactRetry } from '../../azure-pipelines/common/checkProductArtifactRetry.ts';

const artifactNames = [
	'vscode_client_win32_x64_setup',
	'vscode_client_win32_x64_user-setup',
	'vscode_client_win32_x64_archive',
	'vscode_server_win32_x64_archive',
	'vscode_web_win32_x64_archive',
	'agent_sdk_win32_x64_tarballs',
];

suite('product artifact retry', () => {
	test('does not query artifacts on the first job attempt', async () => {
		await checkProductArtifactRetry(1, artifactNames, async () => {
			assert.fail('The first attempt must not query existing artifacts.');
		});
	});

	test('allows retries before any product output is associated', async () => {
		await checkProductArtifactRetry(2, artifactNames, async () => ({ value: [] }));
	});

	test('ignores diagnostics and outputs from other jobs', async () => {
		const names = [
			'logs-windows-x64-1',
			'crash-dump-windows-x64-1',
			'node-modules-windows-x64-1',
			'vscode_client_win32_arm64_setup',
			'vscode_cli_win32_x64_cli',
			'unsigned_vscode_cli_win32_x64_cli',
			'vscode_client_darwin_x64_archive',
		];
		await checkProductArtifactRetry(3, artifactNames, async () => ({
			value: names.map((name, index) => ({ id: index + 1, name, source: 'another-job' }))
		}));
	});

	for (const name of artifactNames) {
		test(`blocks partial publication of ${name}`, async () => {
			await assert.rejects(checkProductArtifactRetry(2, artifactNames, async () => ({
				value: [{ id: 1823927, name, source: 'original-job' }]
			})), error => {
				assert(error instanceof Error);
				assert.match(error.message, /Cannot rebuild product job attempt 2/);
				assert(error.message.includes(`${name} (artifact 1823927, producer job original-job)`));
				return true;
			});
		});
	}

	test('does not treat a complete set of existing outputs as safe to rebuild', async () => {
		await assert.rejects(checkProductArtifactRetry(4, artifactNames, async () => ({
			value: artifactNames.map((name, index) => ({ id: index + 1, name, source: 'original-job' }))
		})), /Rebuilding and signing may produce different bytes/);
	});

	test('reports unavailable producer metadata without accepting the artifact', async () => {
		await assert.rejects(checkProductArtifactRetry(2, artifactNames, async () => ({
			value: [{ id: 1, name: artifactNames[0] }]
		})), /producer job not recorded/);
	});

	test('compares canonical names case insensitively', async () => {
		await assert.rejects(checkProductArtifactRetry(2, artifactNames, async () => ({
			value: [{ id: 1, name: artifactNames[0].toUpperCase(), source: null }]
		})), /Cannot rebuild product job/);
	});

	test('fails closed on artifact API errors', async () => {
		await assert.rejects(checkProductArtifactRetry(2, artifactNames, async () => {
			throw new Error('Unexpected status code: 403');
		}), /Unexpected status code: 403/);
	});

	test('fails closed on malformed artifact responses', async () => {
		for (const response of [null, {}, { value: null }, { value: {} }, { value: [null] }, { value: [{ id: 1 }] }]) {
			await assert.rejects(checkProductArtifactRetry(2, artifactNames, async () => response), /Invalid build artifacts response/);
		}
	});

	test('rejects invalid job attempts and empty output declarations', async () => {
		for (const attempt of [0, -1, NaN, 1.5]) {
			await assert.rejects(checkProductArtifactRetry(attempt, artifactNames), /System.JobAttempt must be a positive integer/);
		}
		await assert.rejects(checkProductArtifactRetry(2, []), /Expected the canonical product artifact names/);
	});

	for (const scenario of [
		{ name: 'allows an empty artifact list', status: 200, response: { value: [] }, code: 0, error: '' },
		{ name: 'blocks an existing product artifact', status: 200, response: { value: [{ id: 1823927, name: artifactNames[0], source: 'original-job' }] }, code: 1, error: 'producer job original-job' },
		{ name: 'fails closed on access denied', status: 403, response: {}, code: 1, error: 'Unexpected status code: 403' },
		{ name: 'fails closed on a malformed response', status: 200, response: {}, code: 1, error: 'Invalid build artifacts response' },
	]) {
		test(`CLI ${scenario.name}`, async t => {
			const requests: { method: string | undefined; url: string | undefined; authorization: string | undefined }[] = [];
			const server = createServer((request, response) => {
				requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
				response.writeHead(scenario.status, { 'Content-Type': 'application/json' });
				response.end(JSON.stringify(scenario.response));
			});
			t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', resolve);
			});
			const address = server.address();
			assert(address && typeof address === 'object');

			const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
				execFile(process.execPath, [
					fileURLToPath(new URL('../../azure-pipelines/common/checkProductArtifactRetry.ts', import.meta.url)),
					...artifactNames
				], {
					env: {
						...process.env,
						SYSTEM_JOBATTEMPT: '2',
						SYSTEM_ACCESSTOKEN: 'test-token',
						BUILDS_API_URL: `http://127.0.0.1:${address.port}/builds/468150/`
					}
				}, (error, stdout, stderr) => {
					const code = error ? error.code : 0;
					if (typeof code !== 'number') {
						reject(error);
					} else {
						resolve({ code, stdout, stderr });
					}
				});
			});

			assert.deepStrictEqual({
				code: result.code,
				checkStarted: result.stdout.includes('PRODUCT_ARTIFACT_RETRY_CHECK_FAILED]true'),
				checkPassed: result.stdout.includes('PRODUCT_ARTIFACT_RETRY_CHECK_FAILED]false'),
				reportsExpectedError: scenario.error ? result.stderr.includes(scenario.error) : result.stderr.length === 0,
				requests,
			}, {
				code: scenario.code,
				checkStarted: true,
				checkPassed: scenario.code === 0,
				reportsExpectedError: true,
				requests: [{ method: 'GET', url: '/builds/468150/artifacts?api-version=6.0', authorization: 'Bearer test-token' }],
			});
		});
	}

	test('checks every canonical Windows output before dependency installation', () => {
		const job = readFileSync(new URL('../../azure-pipelines/win32/product-build-win32.yml', import.meta.url), 'utf8');
		const compile = readFileSync(new URL('../../azure-pipelines/win32/steps/product-build-win32-compile.yml', import.meta.url), 'utf8');
		const declared = [...job.matchAll(/artifactName: (?<name>(?:vscode_|agent_sdk_)\S+)/g)].map(match => match.groups!.name);
		const command = /node build\/azure-pipelines\/common\/checkProductArtifactRetry\.ts(?<args>[\s\S]*?)\s+displayName:/.exec(job);
		assert(command);
		assert.deepStrictEqual(command.groups!.args.trim().split(/\s+/), declared);
		assert.deepStrictEqual(declared.map(name => name.replace('$(VSCODE_ARCH)', 'x64')), artifactNames);
		assert(compile.indexOf('${{ parameters.preBuildSteps }}') > compile.indexOf('- task: NodeTool@0'));
		assert(compile.indexOf('${{ parameters.preBuildSteps }}') < compile.indexOf('exec { npm ci }'));
		assert(job.includes("condition: and(succeeded(), gt(variables['System.JobAttempt'], 1))"));
		assert.strictEqual(job.match(/ne\(variables\['PRODUCT_ARTIFACT_RETRY_CHECK_FAILED'\], 'true'\)/g)?.length, 3);
	});
});
