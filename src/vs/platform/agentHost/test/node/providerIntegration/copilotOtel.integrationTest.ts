/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CopilotClient, approveAll } from '@github/copilot-sdk';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { DeferredPromise, raceTimeout, timeout } from '../../../../../base/common/async.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { join } from '../../../../../base/common/path.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../log/common/log.js';
import type { IByokLmModelInfo } from '../../../common/agentHostByokLm.js';
import { ByokLmBridgeRegistry } from '../../../node/byokLmBridgeRegistry.js';
import { ByokLmProxyService } from '../../../node/copilot/byokLmProxyService.js';
import { createCopilotCliEnvironment } from '../../../node/copilot/copilotCliEnvironment.js';
import { assertExpectedFailure } from '../e2e/harness/expectedFailure.js';
import { createIsolatedProviderEnvironment } from '../providerTestEnvironment.js';

suite('Agent Host Provider Integration - Copilot OTel concurrency', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const batchSize = 12;
	const batchCount = 24;
	const toolCount = batchSize * batchCount;
	const progressTimeoutMs = 15_000;

	for (const otelEnabled of [false, true]) {
		test(`shell tools and concurrent session events complete with OTel ${otelEnabled ? 'enabled' : 'disabled'}`, async function () {
			this.timeout(180_000);
			const directory = await mkdtemp(join(tmpdir(), 'copilot-otel-concurrency-'));
			const disposables = store.add(new DisposableStore());
			const models = disposables.add(new Emitter<IByokLmModelInfo[]>());
			const registry = new ByokLmBridgeRegistry();
			const shell = isWindows ? 'powershell' : 'bash';
			let modelCalls = 0;
			disposables.add(registry.register('client', {
				onDidChangeModels: models.event,
				chat: async () => {
					const batch = modelCalls++;
					return {
						responseId: `otel-response-${batch}`,
						output: batch < batchCount ? Array.from({ length: batchSize }, (_, index) => ({
							type: 'function_call' as const,
							callId: `otel-tool-${batch}-${index}`,
							name: shell,
							argumentsJson: JSON.stringify({
								command: isWindows ? 'Write-Output otel-concurrency-probe' : 'printf otel-concurrency-probe',
								description: 'Print a fixed integration-test marker',
								mode: 'sync',
							}),
						})) : [{ type: 'message' as const, content: [{ type: 'text' as const, text: 'OTEL_CONCURRENCY_DONE' }] }],
					};
				},
			}));
			models.fire([{ vendor: 'test', id: 'otel-model' }]);
			const proxy = disposables.add(new ByokLmProxyService(new NullLogService(), registry));
			const handle = disposables.add(await proxy.start());
			const tracePath = join(directory, 'otel.jsonl');
			const client = new CopilotClient({
				mode: 'empty',
				baseDirectory: join(directory, 'copilot'),
				workingDirectory: directory,
				useLoggedInUser: false,
				env: createCopilotCliEnvironment(createIsolatedProviderEnvironment(directory, {
					PATH: process.env.PATH,
					SystemRoot: process.env.SystemRoot,
					WINDIR: process.env.WINDIR,
					ComSpec: process.env.ComSpec,
					PATHEXT: process.env.PATHEXT,
					COPILOT_TELEMETRY_ENABLED: 'false',
					COPILOT_OTEL_ENABLED: String(otelEnabled),
				})),
				...(otelEnabled ? { telemetry: { exporterType: 'file', filePath: tracePath, captureContent: false } } : {}),
			});
			let stopLogging = false;
			let logPumps: Promise<PromiseSettledResult<void>[]> = Promise.resolve([]);
			let completed = false;
			try {
				await client.start();
				const sessionId = 'otel-concurrency';
				const session = await client.createSession({
					sessionId,
					workingDirectory: directory,
					model: 'otel-model',
					availableTools: [shell],
					skipCustomInstructions: true,
					skipEmbeddingRetrieval: true,
					onPermissionRequest: approveAll,
					provider: {
						type: 'openai',
						wireApi: 'responses',
						baseUrl: handle.providerBaseUrl('test'),
						bearerToken: `${handle.nonce}.${sessionId}`,
					},
				});
				const errors: string[] = [];
				const tools: { success: boolean; hasOutput: boolean }[] = [];
				let toolStarts = 0;
				let logWrites = 0;
				disposables.add(toDisposable(session.on(event => {
					if (event.type === 'tool.execution_start') {
						toolStarts++;
					} else if (event.type === 'tool.execution_complete') {
						tools.push({ success: event.data.success, hasOutput: event.data.result?.content.includes('otel-concurrency-probe') === true });
					} else if (event.type === 'session.error') {
						errors.push(event.data.message);
					}
				})));
				await session.rpc.log({ message: 'OTel concurrency ready', ephemeral: true });
				const run = async () => {
					const eventFailure = new DeferredPromise<never>();
					logPumps = Promise.allSettled(Array.from({ length: 4 }, async (_, index) => {
						try {
							while (!stopLogging) {
								// Detect the 30-second lock stall without limiting platform-dependent shell startup time.
								const result = await raceTimeout(session.rpc.log({ message: `Concurrent event ${index}`, ephemeral: true }), progressTimeoutMs);
								assert.ok(result, 'session event delivery stalled while starting shell tools');
								logWrites++;
								// Yield between RPCs without removing contention with native tool-start telemetry.
								await timeout(1);
							}
						} catch (error) {
							void eventFailure.error(error);
							throw error;
						}
					}));
					const message = await Promise.race([
						session.sendAndWait({ prompt: 'Run the synthetic shell-tool workload.' }, 120_000),
						eventFailure.p,
					]);
					assert.ok(message, 'expected an assistant response after real shell-tool execution');
					stopLogging = true;
					const logResults = await raceTimeout(logPumps, 5000);
					assert.ok(logResults, 'concurrent session events did not drain');
					assert.deepStrictEqual({
						message: message.data.content,
						modelCalls,
						toolStarts,
						tools,
						errors,
						logErrors: logResults.filter(result => result.status === 'rejected'),
					}, {
						message: 'OTEL_CONCURRENCY_DONE',
						modelCalls: batchCount + 1,
						toolStarts: toolCount,
						tools: Array.from({ length: toolCount }, () => ({ success: true, hasOutput: true })),
						errors: [],
						logErrors: [],
					});
					assert.ok(logWrites >= 4, 'expected all concurrent event producers to run');
					completed = true;
				};
				if (otelEnabled) {
					await assertExpectedFailure('github/copilot-agent-runtime#25128',
						/^session event delivery stalled while starting shell tools$/, run);
				} else {
					await run();
				}
			} finally {
				stopLogging = true;
				try {
					if (completed) {
						const errors = await raceTimeout(client.stop(), 5000);
						if (errors === undefined) {
							await client.forceStop();
						}
						assert.deepStrictEqual(errors, [], 'native runtime did not shut down cleanly');
					} else {
						await client.forceStop();
					}
					assert.ok(await raceTimeout(logPumps, 5000), 'concurrent session event producers did not stop');
					if (otelEnabled) {
						const traces: { type: string; name?: string }[] = (await readFile(tracePath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
						assert.ok(traces.some(trace => trace.type === 'span'), 'expected an active native OTel pipeline');
						if (completed) {
							assert.ok(traces.some(trace => trace.type === 'span' && trace.name?.startsWith('execute_tool')), 'expected native tool spans from the enabled OTel pipeline');
						}
					} else if (completed) {
						await assert.rejects(readFile(tracePath, 'utf8'), { code: 'ENOENT' });
					}
				} finally {
					disposables.dispose();
					await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
				}
			}
		});
	}
});
