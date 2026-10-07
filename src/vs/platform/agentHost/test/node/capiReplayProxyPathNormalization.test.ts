/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir, userInfo } from 'os';
import { join, posix, win32 } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CapiReplayProxy } from './e2e/harness/capiReplayProxy.js';
import { aggregateAnthropicSse, anthropicMessageToSse } from './e2e/harness/capiWireCodec.js';
import { scrubUserName } from './e2e/harness/userNameScrub.js';

suite('CapiReplayProxy path normalization', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('binds UUID-bearing attachment paths independently of platform separators', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-attachment-'));
		const fixturePath = join(directory, 'capture.yaml');
		const home = userInfo().homedir;
		const recordedPath = join(home, 'user-data', 'agentSessionData', '11111111-1111-4111-8111-111111111111', 'attachments', '22222222-2222-4222-8222-222222222222', 'embedded.txt');
		const observedPath = join(home, 'user-data', 'agentSessionData', '33333333-3333-4333-8333-333333333333', 'attachments', '44444444-4444-4444-8444-444444444444', 'embedded.txt');
		const request = (path: string) => JSON.stringify({
			model: 'claude-opus-5', system: 'system',
			messages: [{ role: 'user', content: `Read the attached file "${path}".` }],
		});
		const recorder = new CapiReplayProxy({
			fixturePath, mode: 'record', homeDir: home,
			recordingModelResponse: {
				status: 200, headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({
					content: [{ type: 'tool_use', id: 'toolu_attachment', name: 'view', input: { path: recordedPath } }],
					stopReason: 'tool_use',
				}),
			},
		});
		try {
			const response = await fetch(`${await recorder.start()}/v1/messages`, { method: 'POST', body: request(recordedPath) });
			await response.text();
			await recorder.stop();
			const replay = new CapiReplayProxy({ fixturePath, mode: 'replay', homeDir: home });
			try {
				const replayed = await fetch(`${await replay.start()}/v1/messages`, { method: 'POST', body: request(observedPath) });
				const message = aggregateAnthropicSse(await replayed.text());
				const block = message?.content[0];
				assert.ok(block?.type === 'tool_use' && typeof block.input === 'object' && block.input !== null);
				const path: unknown = Reflect.get(block.input, 'path');
				assert.strictEqual(path, `${home}/user-data/agentSessionData/33333333-3333-4333-8333-333333333333/attachments/44444444-4444-4444-8444-444444444444/embedded.txt`);
				replay.assertNoReplayMismatches();
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('only removes explicitly marked synthetic session tokens while forwarding recorded model requests', async () => {
		const { createServer } = await import('http');
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-synthetic-token-'));
		const fixturePath = join(directory, 'capture.yaml');
		const observed: { sessionToken: string | undefined; authorization: string | undefined }[] = [];
		const upstream = createServer((request, response) => {
			const header = request.headers['copilot-session-token'];
			observed.push({
				sessionToken: typeof header === 'string' ? header : undefined,
				authorization: request.headers.authorization,
			});
			request.resume();
			response.writeHead(200, { 'content-type': 'text/event-stream' });
			response.end(anthropicMessageToSse({ content: [{ type: 'text', text: 'LOCAL_UPSTREAM_REPLY' }], stopReason: 'end_turn' }));
		});
		let recorder: CapiReplayProxy | undefined;
		try {
			await new Promise<void>((resolve, reject) => {
				const onError = (error: Error) => reject(error);
				upstream.once('error', onError);
				upstream.listen(0, '127.0.0.1', () => {
					upstream.off('error', onError);
					resolve();
				});
			});
			const address = upstream.address();
			assert.ok(address && typeof address !== 'string');
			const proxy = new CapiReplayProxy({ fixturePath, mode: 'record', capiUpstreamUrl: `http://127.0.0.1:${address.port}` });
			recorder = proxy;
			const routing = { status: 200, headers: { 'content-type': 'application/json' }, body: '{"session_token":"marked-bootstrap"}' };
			assert.throws(() => proxy.setAncillaryResponse('POST', '/auto', routing, 'another-token'), /exactly match/);
			const registration = store.add(proxy.setAncillaryResponse('POST', '/auto', routing, 'marked-bootstrap'));
			const url = await proxy.start();
			registration.dispose();
			for (const token of ['marked-bootstrap', 'genuine-unmarked']) {
				const response = await fetch(`${url}/v1/messages`, {
					method: 'POST',
					headers: { 'authorization': 'primary-test-credential', 'copilot-session-token': token },
					body: JSON.stringify({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'Synthetic-token forwarding fixture' }] }),
				});
				await response.text();
			}
			assert.deepStrictEqual(observed, [
				{ sessionToken: undefined, authorization: 'primary-test-credential' },
				{ sessionToken: 'genuine-unmarked', authorization: 'primary-test-credential' },
			]);
			await recorder.stop();
			const contents = readFileSync(fixturePath, 'utf8');
			assert.ok(!contents.includes('primary-test-credential') && !contents.includes('genuine-unmarked'));
		} finally {
			await recorder?.stop();
			await new Promise<void>(resolve => {
				upstream.close(() => resolve());
				upstream.closeAllConnections();
			});
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('preserves retry controls but excludes credential headers from recorded error responses', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-retry-headers-'));
		const fixturePath = join(directory, 'capture.yaml');
		const request = JSON.stringify({ model: 'claude-opus-5', messages: [{ role: 'user', content: 'Retry control fixture' }] });
		const recorder = new CapiReplayProxy({
			fixturePath, mode: 'record',
			recordingModelResponse: {
				status: 429,
				headers: {
					'content-type': 'application/json',
					'retry-after': '0',
					'retry-after-ms': '1',
					'x-should-retry': 'false',
					'authorization': 'synthetic-do-not-persist',
				},
				body: JSON.stringify({ error: { message: 'RETRY_CONTROL_FIXTURE' } }),
			},
		});
		try {
			const response = await fetch(`${await recorder.start()}/v1/messages`, { method: 'POST', body: request });
			await response.text();
			await recorder.stop();
			assert.ok(!readFileSync(fixturePath, 'utf8').includes('synthetic-do-not-persist'));
			const replay = new CapiReplayProxy({ fixturePath, mode: 'replay' });
			try {
				const replayed = await fetch(`${await replay.start()}/v1/messages`, { method: 'POST', body: request });
				await replayed.text();
				assert.deepStrictEqual({
					status: replayed.status,
					retryAfter: replayed.headers.get('retry-after'),
					retryAfterMs: replayed.headers.get('retry-after-ms'),
					retry: replayed.headers.get('x-should-retry'),
					authorization: replayed.headers.get('authorization'),
				}, { status: 429, retryAfter: '0', retryAfterMs: '1', retry: 'false', authorization: null });
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('scopes ancillary overrides without intercepting model turns or preserving them across fixtures', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-ancillary-'));
		const fixturePath = join(directory, 'capture.yaml');
		const response = {
			status: 200, headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ selected_model: { id: 'claude-sonnet-5' }, session_token: 'synthetic-bootstrap-token' }),
		};
		const recorder = new CapiReplayProxy({ fixturePath, mode: 'record' });
		try {
			assert.throws(() => recorder.setAncillaryResponse('POST', '/v1/messages', response), /recognized ancillary endpoint/);
			assert.throws(() => recorder.setAncillaryResponse('POST', '/unknown', response), /recognized ancillary endpoint/);
			const override = store.add(recorder.setAncillaryResponse('POST', '/auto', response));
			const url = await recorder.start();
			const selected = await fetch(`${url}/auto`, { method: 'POST', body: '{}' });
			assert.deepStrictEqual({ status: selected.status, body: await selected.json() }, {
				status: 200, body: { selected_model: { id: 'claude-sonnet-5' }, session_token: 'synthetic-bootstrap-token' },
			});
			override.dispose();
			const fallback = await fetch(`${url}/auto`, { method: 'POST', body: '{}' });
			await fallback.text();
			assert.deepStrictEqual({
				status: fallback.status,
				requests: recorder.observedAncillaryRequests,
			}, {
				status: 500,
				requests: [{ method: 'POST', path: '/auto', body: '{}' }, { method: 'POST', path: '/auto', body: '{}' }],
			});
			await recorder.stop();
			assert.ok(!readFileSync(fixturePath, 'utf8').includes('synthetic-bootstrap-token'));

			const replay = new CapiReplayProxy({ fixturePath, mode: 'replay' });
			try {
				store.add(replay.setAncillaryResponse('POST', '/auto', response));
				replay.resetForReplay(fixturePath);
				const reset = await fetch(`${await replay.start()}/auto`, { method: 'POST', body: '{}' });
				await reset.text();
				assert.deepStrictEqual({ status: reset.status, requests: replay.observedAncillaryRequests.length }, {
					status: 500, requests: 1,
				});
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('rebinds whole saved-output references from nested live tool results', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-saved-output-'));
		const fixturePath = join(directory, 'capture.yaml');
		const recordedPath = join(tmpdir(), '1790000000000-copilot-tool-output-10000-11111111-1111-4111-8111-111111111111.txt');
		const observedPaths = [
			join(tmpdir(), '1790000009999-copilot-tool-output-20000-22222222-2222-4222-8222-222222222222.txt'),
			join(tmpdir(), 'copilot-33333333-3333-4333-8333-333333333333', '1790000009999-copilot-tool-output-20000-22222222-2222-4222-8222-222222222222.txt'),
		];
		const request = (path: string, toolCallId = 'toolu_output') => JSON.stringify({
			model: 'claude-opus-5', system: 'system',
			messages: [{
				role: 'user',
				content: [{
					type: 'tool_result', tool_use_id: toolCallId,
					content: JSON.stringify({ type: 'text', text: `Output too large. Saved to: ${path}` }),
				}],
			}],
		});
		const recorder = new CapiReplayProxy({
			fixturePath, mode: 'record', userName: userInfo().username,
			recordingModelResponse: {
				status: 200, headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({
					content: [{ type: 'tool_use', id: 'toolu_read', name: 'view', input: { path: recordedPath } }],
					stopReason: 'tool_use',
				}),
			},
		});
		try {
			const recorded = await fetch(`${await recorder.start()}/v1/messages`, { method: 'POST', body: request(recordedPath) });
			await recorded.text();
			await recorder.stop();
			const contents = readFileSync(fixturePath, 'utf8');
			assert.deepStrictEqual({
				placeholder: contents.includes('${saved_output_0}'),
				timestamp: contents.includes('1790000000000'),
				tempDirectory: contents.includes(tmpdir()),
			}, { placeholder: true, timestamp: false, tempDirectory: false });
			for (const observedPath of observedPaths) {
				const replay = new CapiReplayProxy({ fixturePath, mode: 'replay', userName: userInfo().username });
				try {
					const response = await fetch(`${await replay.start()}/v1/messages`, { method: 'POST', body: request(observedPath, 'toolcall_1') });
					const message = aggregateAnthropicSse(await response.text());
					const block = message?.content[0];
					assert.ok(block?.type === 'tool_use' && typeof block.input === 'object' && block.input !== null);
					const path: unknown = Reflect.get(block.input, 'path');
					assert.deepStrictEqual({ status: response.status, path }, {
						status: 200, path: observedPath.replaceAll('\\', '/'),
					});
					replay.assertNoReplayMismatches();
				} finally {
					await replay.stop();
				}
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('normalizes split fixture URLs after disposal and requires fresh replay bindings', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-url-'));
		const fixturePath = join(directory, 'capture.yaml');
		const recordedUrl = 'http://127.0.0.1:49101';
		const request = (url: string) => JSON.stringify({
			model: 'claude-opus-5', system: 'system',
			messages: [{ role: 'user', content: `Fetch ${url}/document` }],
		});
		const input = { url: `${recordedUrl}/document` };
		const inputJson = JSON.stringify(input);
		const delta = (partial: string) => `event: content_block_delta\ndata: ${JSON.stringify({
			type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: partial },
		})}\n\n`;
		const wholeBody = anthropicMessageToSse({
			content: [{ type: 'tool_use', id: 'toolu_url', name: 'web_fetch', input }],
			stopReason: 'tool_use',
		});
		const boundary = inputJson.indexOf('127.') + 2;
		const splitBody = wholeBody.replace(delta(inputJson), delta(inputJson.slice(0, boundary)) + delta(inputJson.slice(boundary)));
		assert.notStrictEqual(splitBody, wholeBody);
		const recorder = new CapiReplayProxy({
			fixturePath, mode: 'record',
			recordingModelResponse: {
				status: 200, headers: { 'content-type': 'text/event-stream' },
				body: splitBody,
			},
		});
		const recordedBinding = store.add(recorder.registerFixtureUrl('web', recordedUrl));
		try {
			const recorded = await fetch(`${await recorder.start()}/v1/messages`, { method: 'POST', body: request(recordedUrl) });
			await recorded.text();
			recordedBinding.dispose();
			await recorder.stop();
			const contents = readFileSync(fixturePath, 'utf8');
			assert.deepStrictEqual({
				placeholder: contents.includes('${url_web}/document'),
				originalUrl: contents.includes(recordedUrl),
			}, { placeholder: true, originalUrl: false });

			const replay = new CapiReplayProxy({ fixturePath, mode: 'replay' });
			try {
				const proxyUrl = await replay.start();
				const firstUrl = 'http://127.0.0.1:49202';
				const stale = store.add(replay.registerFixtureUrl('web', firstUrl));
				const urls: string[] = [];
				for (const fixtureUrl of [firstUrl, 'http://127.0.0.1:49303']) {
					replay.resetForReplay(fixturePath);
					store.add(replay.registerFixtureUrl('web', fixtureUrl));
					stale.dispose();
					const response = await fetch(`${proxyUrl}/v1/messages`, { method: 'POST', body: request(fixtureUrl) });
					const message = aggregateAnthropicSse(await response.text());
					const block = message?.content[0];
					assert.ok(block?.type === 'tool_use' && typeof block.input === 'object' && block.input !== null);
					const target: unknown = Reflect.get(block.input, 'url');
					assert.ok(typeof target === 'string');
					urls.push(target);
					replay.assertNoReplayMismatches();
				}
				assert.deepStrictEqual(urls, [`${firstUrl}/document`, 'http://127.0.0.1:49303/document']);

				replay.resetForReplay(fixturePath);
				const unbound = await fetch(`${proxyUrl}/v1/messages`, { method: 'POST', body: request(firstUrl) });
				await unbound.text();
				const error = replay.takeReplayError();
				assert.deepStrictEqual({
					status: unbound.status,
					missingBinding: /\bunbound fixture URL \$\{url_web\}/.test(error?.message ?? ''),
				}, { status: 500, missingBinding: true });
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	async function assertCopiedPluginPathReplay(pathStyle: typeof posix): Promise<void> {
		const testDirectory = mkdtempSync(join(tmpdir(), 'capi-replay-plugin-normalization-'));
		const fixturePath = join(testDirectory, 'capture.yaml');
		const homeDir = pathStyle.join(testDirectory, 'home');
		const pluginFile = (directory: string) => pathStyle.join(homeDir, 'user-data', 'agentPlugins', directory, '1', 'reference.txt');
		const request = (path: string) => JSON.stringify({
			model: 'claude-opus-5',
			system: 'system',
			messages: [{ role: 'user', content: `Read ${path}` }],
		});
		const recorder = new CapiReplayProxy({
			fixturePath,
			mode: 'record',
			homeDir,
			recordingModelResponse: {
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({
					content: [{ type: 'tool_use', id: 'toolu_1', name: 'view', input: { path: pluginFile('recorded-copy') } }],
					stopReason: 'tool_use',
				}),
			},
		});
		try {
			const response = await fetch(`${await recorder.start()}/v1/messages`, { method: 'POST', body: request(pluginFile('recorded-copy')) });
			await response.text();
			await recorder.stop();
			const replay = new CapiReplayProxy({ fixturePath, mode: 'replay', homeDir });
			try {
				const url = await replay.start();
				const paths: string[] = [];
				for (const directory of ['first-copy', 'second-copy']) {
					replay.resetForReplay(fixturePath);
					const response = await fetch(`${url}/v1/messages`, { method: 'POST', body: request(pluginFile(directory)) });
					const message = aggregateAnthropicSse(await response.text());
					const block = message?.content[0];
					assert.ok(block?.type === 'tool_use' && typeof block.input === 'object' && block.input !== null);
					const path: unknown = Reflect.get(block.input, 'path');
					assert.ok(typeof path === 'string');
					paths.push(pathStyle.normalize(path));
					replay.assertNoReplayMismatches();
				}
				assert.deepStrictEqual(paths, [pluginFile('first-copy'), pluginFile('second-copy')]);
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(testDirectory, { recursive: true, force: true });
		}
	}

	test('binds copied plugin paths from live requests and resets bindings between fixtures', async () => {
		await assertCopiedPluginPathReplay(posix);
		await assertCopiedPluginPathReplay(win32);
	});

	test('normalizes compacted shell output paths and rebinds them from live requests', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-shell-output-'));
		const fixturePath = join(directory, 'capture.yaml');
		const homeDir = '/tmp/host-home';
		const workDir = '/tmp/workspace';
		const paths = [
			'/tmp/with spaces/original-output-1234567890123-0123456789abcdef0123456789abcdef.txt',
			'C:\\Users\\test user\\Temp\\original-output-1234567890124-abcdef0123456789abcdef0123456789.txt',
			`${homeDir}/output/original-output-1234567890125-0123456789abcdef0123456789abcdef.txt`,
			`${workDir}/output/original-output-1234567890126-abcdef0123456789abcdef0123456789.txt`,
		];
		const request = (path: string) => JSON.stringify({
			model: 'claude-sonnet-5',
			system: 'system',
			messages: [{ role: 'user', content: `Original at ${path}; only use if exact omitted lines are needed.` }],
		});
		const recorder = new CapiReplayProxy({
			fixturePath,
			mode: 'record',
			recordingModelResponse: {
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({
					content: [{ type: 'tool_use', id: 'toolu_1', name: 'view', input: { path: paths[0] } }],
					stopReason: 'tool_use',
				}),
			},
		});
		try {
			await (await fetch(`${await recorder.start()}/v1/messages`, { method: 'POST', body: request(paths[0]) })).text();
			await recorder.stop();
			const fixture = readFileSync(fixturePath, 'utf8');
			assert.ok(fixture.includes('${shell_output_0}') && !fixture.includes('original-output-'));
			const replay = new CapiReplayProxy({ fixturePath, mode: 'replay', homeDir, workDir, userName: 'test user' });
			try {
				const url = await replay.start();
				for (const path of paths) {
					replay.resetForReplay(fixturePath);
					const response = await fetch(`${url}/v1/messages`, { method: 'POST', body: request(path) });
					const content = aggregateAnthropicSse(await response.text())?.content;
					assert.deepStrictEqual(content?.map(block => block.type === 'tool_use' ? block.input : undefined), [{ path }]);
					replay.assertNoReplayMismatches();
				}
			} finally {
				await replay.stop();
			}
		} finally {
			await recorder.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('expands workdir file URI placeholders as file URIs', async () => {
		const directory = mkdtempSync(join(tmpdir(), 'capi-replay-workdir-uri-'));
		const fixturePath = join(directory, 'capture.yaml');
		const workDir = 'C:\\Temp\\workspace folder';
		writeFileSync(fixturePath, [
			'version: 1',
			'dialect: anthropic',
			'exchanges:',
			'  - request:',
			'      model: claude-sonnet-5',
			'      system: ${system}',
			'      messages:',
			'        - role: user',
			'          content: attach',
			'    response:',
			'      content:',
			'        - type: tool_use',
			'          id: toolu_1',
			'          name: set_workspace',
			'          input:',
			'            workspaceFolder: file://${workdir}',
			'      stopReason: tool_use',
		].join('\n'));
		const replay = new CapiReplayProxy({ fixturePath, mode: 'replay', workDir });
		try {
			const response = await fetch(`${await replay.start()}/v1/messages`, {
				method: 'POST',
				body: JSON.stringify({
					model: 'claude-sonnet-5',
					system: 'system',
					messages: [{ role: 'user', content: 'attach' }],
				}),
			});
			const content = aggregateAnthropicSse(await response.text())?.content;
			assert.deepStrictEqual(content?.map(block => block.type === 'tool_use' ? block.input : undefined), [{
				workspaceFolder: URI.file(workDir).toString(),
			}]);
			replay.assertNoReplayMismatches();
		} finally {
			await replay.stop();
			rmSync(directory, { recursive: true, force: true });
		}
	});

	test('normalizes truncated harness workspaces from session titles', async () => {
		const testDirectory = mkdtempSync(join(tmpdir(), 'capi-replay-path-normalization-'));
		const fixturePath = join(testDirectory, 'capture.yaml');
		const userName = userInfo().username;
		const recordedWorkspace = join(tmpdir(), 'ahp-server-tools-sessions-list-6Al4co');
		const truncatedWorkspace = scrubUserName(recordedWorkspace.slice(0, -2), userName);
		const truncatedWorkspaceUri = scrubUserName(URI.file(recordedWorkspace).toString().slice(0, -2), userName);
		const unrelatedCurrentWorkspace = join(tmpdir(), 'ahp-current-workspace-AbC12D');
		const proxy = new CapiReplayProxy({
			fixturePath,
			mode: 'record',
			workDir: unrelatedCurrentWorkspace,
			homeDir: userInfo().homedir,
			userName,
			recordingModelResponse: {
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: anthropicMessageToSse({
					content: [
						{ type: 'text', text: `${join(unrelatedCurrentWorkspace, 'child.txt')}\nnext` },
						{
							type: 'tool_use',
							id: 'toolu_2',
							name: 'Read',
							input: { file_path: join(unrelatedCurrentWorkspace, 'child.txt') },
						},
					],
					stopReason: 'tool_use',
				}),
			},
		});

		try {
			const url = await proxy.start();
			const title = `Call list_sessions with workspace "${truncatedWorkspace}" or "${truncatedWorkspaceUri}"`;
			const response = await fetch(`${url}/v1/messages`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					model: 'claude-opus-5',
					system: 'system',
					messages: [{
						role: 'user',
						content: [{
							type: 'tool_result',
							tool_use_id: 'toolu_1',
							content: JSON.stringify({ sessions: [{ title }] }),
						}],
					}],
				}),
			});
			assert.strictEqual(response.status, 200);
			await response.text();
			await proxy.stop();

			const fixture = readFileSync(fixturePath, 'utf8');
			assert.deepStrictEqual({
				workdirPlaceholders: fixture.match(/\$\{workdir\}/g)?.length,
				hasPortableToolInput: fixture.includes('file_path: ${workdir}/child.txt'),
				hasCorruptedNewline: fixture.includes('${workdir}/n'),
				hasTempDirectory: fixture.includes(tmpdir()),
				hasScrubbedTempDirectory: fixture.includes(scrubUserName(tmpdir(), userName)),
				hasRandomSuffix: fixture.includes('6Al4'),
			}, {
				workdirPlaceholders: 4,
				hasPortableToolInput: true,
				hasCorruptedNewline: false,
				hasTempDirectory: false,
				hasScrubbedTempDirectory: false,
				hasRandomSuffix: false,
			});
		} finally {
			await proxy.stop();
			rmSync(testDirectory, { recursive: true, force: true });
		}
	});
});
