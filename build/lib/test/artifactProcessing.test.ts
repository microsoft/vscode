/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs';
import { createServer } from 'http';
import { tmpdir } from 'os';
import path from 'path';
import { suite, test } from 'node:test';
import { fileURLToPath } from 'url';
import { processArtifacts, validateProducerStages, type ArtifactProcessingOptions, type Timeline } from '../../azure-pipelines/common/artifactProcessing.ts';

interface TestArtifact {
	readonly name: string;
}

const stages = new Set(['Quality', 'Windows', 'macOS']);

function stage(name: string, result = 'succeeded', state = 'completed'): Timeline['records'][number] {
	return { name, type: 'Stage', state, result };
}

function timeline(windowsResult = 'succeeded', macState = 'completed'): Timeline {
	return { records: [stage('Quality'), stage('Windows', windowsResult), stage('macOS', 'succeeded', macState)] };
}

function createOptions(overrides: Partial<ArtifactProcessingOptions<TestArtifact>>): ArtifactProcessingOptions<TestArtifact> {
	return {
		stages,
		done: new Set<string>(),
		getState: async () => ({ timeline: timeline(), artifacts: [] }),
		prepareArtifact: async artifact => `${artifact.name}.zip`,
		publishArtifact: async () => { },
		wait: async () => { },
		log: () => { },
		logError: () => { },
		...overrides,
	};
}

suite('artifact processing', () => {
	test('publishes later Mac artifacts after Windows fails, before failing producer validation', async () => {
		const publication = Promise.withResolvers<void>();
		const finalPoll = Promise.withResolvers<void>();
		const events: string[] = [];
		const done = new Set<string>();
		let polls = 0;
		const processing = processArtifacts(createOptions({
			done,
			getState: async () => {
				polls++;
				assert(polls <= 3, 'Processing must finish once all stages and publications finish.');
				if (polls === 1) {
					return { timeline: timeline('failed', 'inProgress'), artifacts: [] };
				}
				if (polls === 3) {
					finalPoll.resolve();
				}
				return { timeline: timeline('failed'), artifacts: [{ name: 'mac-archive' }] };
			},
			prepareArtifact: async artifact => {
				events.push(`prepare ${artifact.name}`);
				return `${artifact.name}.zip`;
			},
			publishArtifact: async artifact => {
				events.push(`publishing ${artifact.name}`);
				await publication.promise;
				events.push(`published ${artifact.name}`);
			},
		}));

		await finalPoll.promise;
		assert.deepStrictEqual({ events, done: [...done] }, {
			events: ['prepare mac-archive', 'publishing mac-archive'],
			done: [],
		});

		publication.resolve();
		const result = await processing;
		events.push('processing succeeded');
		assert.throws(() => {
			events.push('validate producers');
			validateProducerStages(result, stages);
			events.push('release build');
		}, /Stage Windows did not succeed: failed/);
		assert.deepStrictEqual({ events, done: [...done] }, {
			events: ['prepare mac-archive', 'publishing mac-archive', 'published mac-archive', 'processing succeeded', 'validate producers'],
			done: ['mac-archive'],
		});
	});

	test('keeps artifact preparation serial while publications overlap', async () => {
		const firstPreparation = Promise.withResolvers<string>();
		const preparing = Promise.withResolvers<void>();
		const publishing = Promise.withResolvers<void>();
		const publications = Promise.withResolvers<void>();
		const events: string[] = [];
		const done = new Set<string>();
		const processing = processArtifacts(createOptions({
			done,
			getState: async () => ({ timeline: timeline(), artifacts: [{ name: 'first' }, { name: 'second' }] }),
			prepareArtifact: async artifact => {
				events.push(`prepare ${artifact.name}`);
				if (artifact.name === 'first') {
					preparing.resolve();
					return firstPreparation.promise;
				}
				return `${artifact.name}.zip`;
			},
			publishArtifact: async (artifact, filePath) => {
				events.push(`publish ${filePath}`);
				if (artifact.name === 'second') {
					publishing.resolve();
				}
				await publications.promise;
			},
		}));

		await preparing.promise;
		assert.deepStrictEqual(events, ['prepare first']);
		firstPreparation.resolve('first.zip');
		await publishing.promise;
		assert.deepStrictEqual({ events, done: [...done] }, {
			events: ['prepare first', 'publish first.zip', 'prepare second', 'publish second.zip'],
			done: [],
		});
		publications.resolve();
		await processing;
		assert.deepStrictEqual([...done], ['first', 'second']);
	});

	test('does not download or publish checkpointed artifacts again', async () => {
		const done = new Set(['existing']);
		const prepared: string[] = [];
		const published: string[] = [];
		await processArtifacts(createOptions({
			done,
			getState: async () => ({ timeline: timeline(), artifacts: [{ name: 'existing' }, { name: 'new' }] }),
			prepareArtifact: async artifact => {
				prepared.push(artifact.name);
				return artifact.name;
			},
			publishArtifact: async artifact => { published.push(artifact.name); },
		}));
		assert.deepStrictEqual({ prepared, published, done: [...done] }, {
			prepared: ['new'], published: ['new'], done: ['existing', 'new'],
		});
	});

	test('drains other publications and does not checkpoint a failed artifact', async () => {
		const failure = new Error('publication failed');
		const done = new Set<string>();
		const failures: unknown[] = [];
		let polls = 0;
		await assert.rejects(processArtifacts(createOptions({
			done,
			getState: async () => {
				polls++;
				assert(polls <= 3);
				return {
					timeline: timeline('failed', polls === 1 ? 'inProgress' : 'completed'),
					artifacts: polls === 1 ? [{ name: 'failed-artifact' }] : [{ name: 'failed-artifact' }, { name: 'mac-archive' }],
				};
			},
			publishArtifact: async artifact => {
				if (artifact.name === 'failed-artifact') {
					throw failure;
				}
			},
			logError: (_message, error) => { failures.push(error); },
		})), /Some artifacts failed to publish/);
		assert.deepStrictEqual({ failures, done: [...done] }, { failures: [failure], done: ['mac-archive'] });
	});

	test('propagates preparation failures for the processing task to retry', async () => {
		const done = new Set<string>();
		await assert.rejects(processArtifacts(createOptions({
			done,
			getState: async () => ({ timeline: timeline(), artifacts: [{ name: 'mac-archive' }] }),
			prepareArtifact: async () => { throw new Error('download failed'); },
		})), /download failed/);
		assert.deepStrictEqual([...done], []);
	});
});

suite('producer stage validation', () => {
	test('accepts successful stages and ignores disabled producers', () => {
		validateProducerStages({ records: [
			stage('Quality'),
			stage('Windows', 'succeededWithIssues'),
			stage('macOS'),
			stage('Linux', 'failed'),
		] }, stages);
	});

	for (const result of ['failed', 'canceled', 'skipped']) {
		test(`rejects an enabled producer that ${result}`, () => {
			assert.throws(() => validateProducerStages(timeline(result), stages), new RegExp(`Stage Windows did not succeed: ${result}`));
		});
	}

	test('rejects missing or newly running producers instead of allowing release', () => {
		assert.throws(() => validateProducerStages({ records: [stage('Quality'), stage('Windows')] }, stages), /Stage macOS is missing/);
		assert.throws(() => validateProducerStages(timeline('succeeded', 'inProgress'), stages), /Stage macOS has not completed/);
	});
});

suite('publication CLI and pipeline wiring', () => {
	for (const scenario of [
		{ name: 'validates successful producers', args: ['--validate-producer-stages'], response: timeline(), processing: false, code: 0, message: 'All producer stages succeeded.' },
		{ name: 'reports a terminal Windows failure without processing', args: ['--validate-producer-stages'], response: timeline('failed'), processing: false, code: 1, message: 'Stage Windows did not succeed: failed' },
		{ name: 'fails validation on a malformed timeline', args: ['--validate-producer-stages'], response: {}, processing: false, code: 1, message: 'Invalid pipeline timeline' },
		{ name: 'defers producer failure in processing-only mode', args: ['--process-artifacts'], response: timeline('failed'), processing: true, code: 0, message: 'Finished processing 0 discovered artifacts.' },
		{ name: 'preserves producer validation by default', args: [], response: timeline('failed'), processing: true, code: 1, message: 'Stage Windows did not succeed: failed' },
		{ name: 'accepts successful processing and validation by default', args: [], response: timeline(), processing: true, code: 0, message: 'All producer stages succeeded.' },
	]) {
		test(`CLI ${scenario.name}`, async t => {
			const workspace = mkdtempSync(path.join(tmpdir(), 'vscode-artifact-processing-'));
			t.after(() => rmSync(workspace, { recursive: true, force: true }));
			const requests: string[] = [];
			const server = createServer((request, response) => {
				requests.push(`${request.method} ${request.url}`);
				response.writeHead(200, { 'Content-Type': 'application/json' });
				response.end(JSON.stringify(request.url?.includes('/artifacts?') ? { value: [] } : scenario.response));
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
					fileURLToPath(new URL('../../azure-pipelines/common/publish.ts', import.meta.url)),
					...scenario.args,
				], {
					env: {
						...process.env,
						SYSTEM_ACCESSTOKEN: 'test-token',
						SYSTEM_STAGEATTEMPT: '2',
						PIPELINE_WORKSPACE: workspace,
						BUILDS_API_URL: `http://127.0.0.1:${address.port}/builds/468150/`,
						VSCODE_BUILD_STAGE_WINDOWS: 'True',
						VSCODE_BUILD_STAGE_MACOS: 'True',
						VSCODE_BUILD_STAGE_LINUX: 'False',
						VSCODE_BUILD_STAGE_ALPINE: 'False',
						VSCODE_BUILD_STAGE_WEB: 'False',
					},
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
				message: `${result.stdout}${result.stderr}`.includes(scenario.message),
				requests: requests.sort(),
				workspace: readdirSync(workspace),
			}, {
				code: scenario.code,
				message: true,
				requests: scenario.processing
					? ['GET /builds/468150/artifacts?api-version=6.0', 'GET /builds/468150/timeline?api-version=6.0']
					: ['GET /builds/468150/timeline?api-version=6.0'],
				workspace: scenario.processing ? ['artifacts_processed_2'] : [],
			}, result.stderr);
		});
	}

	test('keeps processing retryable and producer validation before the gated release', () => {
		const yaml = readFileSync(new URL('../../azure-pipelines/product-publish.yml', import.meta.url), 'utf8');
		const processingStart = yaml.indexOf('- pwsh: node build/azure-pipelines/common/publish.ts --process-artifacts');
		const validationStart = yaml.indexOf('- pwsh: node build/azure-pipelines/common/publish.ts --validate-producer-stages');
		const releaseStart = yaml.indexOf('- script: node build/azure-pipelines/common/releaseBuild.ts');
		assert(processingStart !== -1 && validationStart > processingStart && releaseStart > validationStart);
		assert.deepStrictEqual({
			processingRetries: yaml.slice(processingStart, validationStart).includes('retryCountOnTaskFailure: 3'),
			validationRetries: yaml.slice(validationStart, releaseStart).includes('retryCountOnTaskFailure'),
			validationIgnoresErrors: yaml.slice(validationStart, releaseStart).includes('continueOnError: true'),
			releaseRequiresSuccess: yaml.slice(releaseStart).includes('condition: and(succeeded(),'),
			checkpointAlwaysPublished: yaml.includes('condition: always()'),
		}, {
			processingRetries: true,
			validationRetries: false,
			validationIgnoresErrors: false,
			releaseRequiresSuccess: true,
			checkpointAlwaysPublished: true,
		});
	});
});
