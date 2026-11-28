/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { readFileSync } from 'fs';
import { timeout } from '../../../../../base/common/async.js';
import { FileAccess } from '../../../../../base/common/network.js';
import { join, resolve } from '../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';

suite('Webview service worker', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const version = 3;

	function readWorkerSource(): string {
		const compiledDir = FileAccess.asFileUri('vs/workbench/contrib/webview/test/node').fsPath;
		const sourceDir = resolve(compiledDir).replaceAll('\\', '/').replace('/out/vs/workbench/', '/src/vs/workbench/');
		return readFileSync(join(sourceDir, '../../browser/pre/service-worker.js'), 'utf8');
	}

	async function activateWorker(cacheStorage: Pick<CacheStorage, 'keys' | 'delete'>): Promise<number> {
		const activate = readWorkerSource().match(/sw\.addEventListener\('activate',[\s\S]*?\r?\n\}\);/)?.[0];
		assert.ok(activate);

		let claims = 0;
		let activation: Promise<void> | undefined;
		new Function('sw', 'caches', 'VERSION', activate)({
			clients: {
				claim: async () => { claims++; },
			},
			addEventListener: (_type: string, handler: (event: { waitUntil: (promise: Promise<void>) => void }) => void) => {
				handler({ waitUntil: promise => { activation = promise; } });
			},
		}, cacheStorage, version);

		assert.ok(activation);
		await activation;
		return claims;
	}

	test('removes only resource caches from older versions on activation', async () => {
		const currentCache = `vscode-resource-cache-${version}`;
		const newerCache = `vscode-resource-cache-${version + 1}`;
		const cacheNames = new Set([
			'vscode-resource-cache-1',
			'vscode-resource-cache-2',
			currentCache,
			newerCache,
			'extension-cache',
			'vscode-resource-cache-custom',
		]);
		const claims = await activateWorker({
			keys: async () => [...cacheNames],
			delete: async name => cacheNames.delete(name),
		});

		assert.deepStrictEqual({ caches: [...cacheNames], claims }, {
			caches: [currentCache, newerCache, 'extension-cache', 'vscode-resource-cache-custom'],
			claims: 1,
		});
	});

	for (const failure of ['keys', 'delete']) {
		test(`claims clients when cache ${failure} fails`, async () => {
			const claims = await activateWorker({
				keys: async () => {
					if (failure === 'keys') {
						throw new Error('Cache storage is unavailable');
					}
					return ['vscode-resource-cache-1'];
				},
				delete: async () => { throw new Error('Cache storage is unavailable'); },
			});

			assert.strictEqual(claims, 1);
		});
	}

	interface ResourceRequest {
		readonly id: number;
		readonly path: string;
	}

	interface TestWebview {
		/** The resource requests that the worker sent to the outer frame of the webview. */
		readonly requests: readonly ResourceRequest[];
		whenRequested(count: number): Promise<readonly ResourceRequest[]>;
		fetch(path: string): Promise<Response>;
		remove(): void;
	}

	/**
	 * Runs the whole worker as on Electron, where at most 32 resource requests
	 * wait for the host at a time.
	 */
	function startWorker() {
		const origin = 'vscode-webview://webview-origin';
		const location = new URL(`${origin}/service-worker.js?v=6&vscode-resource-base-authority=vscode-resource.vscode-cdn.net&remoteAuthority=&platform=electron`);
		const listeners = new Map<string, (event: object) => void>();
		const clients = new Set<{ readonly id: string; readonly url: string; readonly type: 'window'; postMessage(message: ResourceRequest): void }>();
		const self = {
			location,
			addEventListener: (type: string, listener: (event: object) => void) => listeners.set(type, listener),
			clients: {
				get: async (id: string) => [...clients].find(client => client.id === id),
				matchAll: async (options?: { type?: string }) => options?.type === 'worker' || options?.type === 'sharedworker' ? [] : [...clients],
			},
		};
		const caches = { open: async () => ({ match: async () => undefined }) };
		const quietConsole = { log: () => { }, error: () => { } };
		new Function('self', 'location', 'caches', 'console', 'performance', readWorkerSource())(self, location, caches, quietConsole, { mark: () => { } });

		const dispatch = (type: string, event: object) => listeners.get(type)?.(event);

		return {
			addWebview(id: string): TestWebview {
				const requests: ResourceRequest[] = [];
				let onDidRequest = () => { };
				const outerFrame = {
					id: `${id}-outer`,
					url: `${origin}/index.html?id=${id}`,
					type: 'window' as const,
					postMessage: (message: ResourceRequest) => {
						requests.push(message);
						onDidRequest();
					},
				};
				const innerFrame = { id: `${id}-inner`, url: `${origin}/fake.html?id=${id}`, type: 'window' as const, postMessage: () => { } };
				clients.add(outerFrame);
				clients.add(innerFrame);
				return {
					requests,
					whenRequested: async count => {
						while (requests.length < count) {
							await new Promise<void>(callback => onDidRequest = callback);
						}
						return requests.slice(0, count);
					},
					fetch: path => {
						let response: Promise<Response> | undefined;
						dispatch('fetch', {
							request: new Request(`https://file+.vscode-resource.vscode-cdn.net${path}`),
							clientId: innerFrame.id,
							respondWith: (value: Promise<Response>) => { response = value; },
						});
						assert.ok(response);
						return response;
					},
					remove: () => {
						clients.delete(outerFrame);
						clients.delete(innerFrame);
					},
				};
			},
			answer(request: ResourceRequest, status: 200 | 404): void {
				dispatch('message', {
					source: {},
					data: {
						channel: 'did-load-resource',
						data: { id: request.id, path: request.path, status, mime: 'text/javascript', stream: status === 200 ? new Blob(['content']).stream() : undefined },
					},
					waitUntil: () => { },
				});
			},
		};
	}

	test('stops waiting for the host once the frames a request was sent to are removed', () => runWithFakedTimers({}, async () => {
		const worker = startWorker();
		const removedWebview = worker.addWebview('removed');
		const otherWebview = worker.addWebview('other');

		// The requests of the removed webview take all slots, so the request of the other webview waits
		const responsesForRemovedWebview = Array.from({ length: 32 }, (_, i) => removedWebview.fetch(`/${i}.js`));
		await removedWebview.whenRequested(32);
		const responseForOtherWebview = otherWebview.fetch('/other.js');
		removedWebview.remove();

		const [requestOfOtherWebview] = await otherWebview.whenRequested(1);
		const msUntilOtherWebviewIsAsked = Date.now();
		worker.answer(requestOfOtherWebview, 200);

		assert.deepStrictEqual({
			statusesForRemovedWebview: [...new Set((await Promise.all(responsesForRemovedWebview)).map(response => response.status))],
			msUntilOtherWebviewIsAsked,
			statusForOtherWebview: (await responseForOtherWebview).status,
		}, {
			statusesForRemovedWebview: [404],
			msUntilOtherWebviewIsAsked: 250,
			statusForOtherWebview: 200,
		});
	}));

	test('does not send the requests of a webview that was removed while they waited for a slot', () => runWithFakedTimers({}, async () => {
		const worker = startWorker();
		const busyWebview = worker.addWebview('busy');
		const removedWebview = worker.addWebview('removed');

		const responsesForBusyWebview = Array.from({ length: 32 }, (_, i) => busyWebview.fetch(`/${i}.js`));
		const [firstRequestOfBusyWebview] = await busyWebview.whenRequested(32);
		const responseForRemovedWebview = removedWebview.fetch('/removed.js');
		await timeout(0); // The request now waits for a slot
		removedWebview.remove();
		worker.answer(firstRequestOfBusyWebview, 404);
		const statusForRemovedWebview = (await responseForRemovedWebview).status;

		// The slot that the request got must be free again
		responsesForBusyWebview.push(busyWebview.fetch('/next.js'));
		await busyWebview.whenRequested(33);
		const msUntilNextRequestIsSent = Date.now();

		assert.deepStrictEqual({
			requestsSentToRemovedWebview: removedWebview.requests.length,
			statusForRemovedWebview,
			msUntilNextRequestIsSent,
		}, {
			requestsSentToRemovedWebview: 0,
			statusForRemovedWebview: 404,
			msUntilNextRequestIsSent: 0,
		});

		for (const request of busyWebview.requests.slice(1)) {
			worker.answer(request, 404);
		}
		await Promise.all(responsesForBusyWebview);
	}));
});
