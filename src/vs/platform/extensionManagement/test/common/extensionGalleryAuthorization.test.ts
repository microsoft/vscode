/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { IChannel, IChannelServer, IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { IRequestContext, IRequestOptions } from '../../../../base/parts/request/common/request.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IExtensionGalleryManifest, IExtensionGalleryManifestService } from '../../common/extensionGalleryManifest.js';
import { ExtensionGalleryAuthenticationError, requestWithExtensionGalleryAuthorization } from '../../common/extensionGalleryManifestService.js';
import { ExtensionGalleryAuthorizationChannel, ExtensionGalleryManifestIPCService } from '../../common/extensionGalleryManifestServiceIpc.js';
import { NullLogService } from '../../../log/common/log.js';
import product from '../../../product/common/product.js';
import { IRequestService } from '../../../request/common/request.js';
import { RequestChannel, RequestChannelClient } from '../../../request/common/requestIpc.js';

suite('Extension gallery authorization', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const url = 'https://marketplace.example.com/extensionquery';
	const manifest: IExtensionGalleryManifest = { version: '1', resources: [], capabilities: { extensionQuery: {} } };

	function fixture(statuses: number[], responseUrl: string | undefined = url) {
		let accessToken: string | undefined = 'resource-1';
		const requests: IRequestOptions[] = [];
		const refreshes: { target: string; token: string }[] = [];
		let refresh = async () => {
			accessToken = 'resource-2';
			return true;
		};
		const service = new class extends mock<IExtensionGalleryManifestService>() {
			override async getAccessToken(target: string) {
				return new URL(target).origin === new URL(url).origin ? accessToken : undefined;
			}
			override async refreshAccessToken(target: string, token: string) {
				refreshes.push({ target, token });
				return refresh();
			}
		}();
		const requestService = new class extends mock<IRequestService>() {
			override async request(options: IRequestOptions): Promise<IRequestContext> {
				requests.push(options);
				return {
					url: responseUrl,
					requestHasAuthorization: !!options.headers?.Authorization,
					res: { statusCode: statuses[Math.min(requests.length - 1, statuses.length - 1)], headers: {} },
					stream: bufferToStream(VSBuffer.fromString('{}')),
				};
			}
		}();
		return { service, requestService, requests, refreshes, setToken: (token: string | undefined) => accessToken = token, setRefresh: (fn: () => Promise<boolean>) => refresh = fn };
	}

	test('replays a read-only query once with the replacement token', async () => {
		const f = fixture([401, 200]);
		const headers = Object.freeze({ Accept: 'application/json' });
		const result = await requestWithExtensionGalleryAuthorization(f.requestService, f.service, { url, type: 'POST', data: '{}', headers, callSite: 'test' }, CancellationToken.None, true);
		result.stream.destroy();

		assert.deepStrictEqual({
			status: result.res.statusCode,
			requests: f.requests.map(request => ({ type: request.type, data: request.data, authorization: request.headers?.Authorization })),
			refreshes: f.refreshes, headers,
		}, {
			status: 200,
			requests: [{ type: 'POST', data: '{}', authorization: 'Bearer resource-1' }, { type: 'POST', data: '{}', authorization: 'Bearer resource-2' }],
			refreshes: [{ target: url, token: 'resource-1' }], headers: { Accept: 'application/json' },
		});
	});

	test('persistent unauthorized responses do not loop or become empty success', async () => {
		const f = fixture([401, 401]);
		await assert.rejects(requestWithExtensionGalleryAuthorization(f.requestService, f.service, { url, callSite: 'test' }, CancellationToken.None, true), ExtensionGalleryAuthenticationError);
		assert.deepStrictEqual({ requests: f.requests.length, refreshes: f.refreshes.length }, { requests: 2, refreshes: 1 });
	});

	test('statistics writes renew for future requests but are not replayed', async () => {
		const f = fixture([401, 200]);
		await assert.rejects(requestWithExtensionGalleryAuthorization(f.requestService, f.service, { url, type: 'POST', callSite: 'test' }, CancellationToken.None, false), ExtensionGalleryAuthenticationError);
		assert.deepStrictEqual({ requests: f.requests.length, refreshes: f.refreshes.length }, { requests: 1, refreshes: 1 });
	});

	for (const scenario of ['anonymous', 'foreign target', 'foreign redirect', 'unknown response URL', 'stripped authorization', 'forbidden'] as const) {
		test(`does not renew for ${scenario}`, async () => {
			const f = fixture([scenario === 'forbidden' ? 403 : 401], scenario === 'foreign redirect' ? 'https://cdn.example.com/asset' : url);
			if (scenario === 'anonymous') {
				f.setToken(undefined);
			}
			const target = scenario === 'foreign target' ? 'https://cdn.example.com/asset' : url;
			const requestService = scenario === 'unknown response URL' || scenario === 'stripped authorization' ? new class extends mock<IRequestService>() {
				override async request(): Promise<IRequestContext> {
					return {
						url: scenario === 'stripped authorization' ? url : undefined,
						requestHasAuthorization: false,
						res: { statusCode: 401, headers: {} }, stream: bufferToStream(VSBuffer.fromString('')),
					};
				}
			}() : f.requestService;
			const result = await requestWithExtensionGalleryAuthorization(requestService, f.service, { url: target, callSite: 'test' }, CancellationToken.None, true);
			result.stream.destroy();
			assert.deepStrictEqual({ status: result.res.statusCode, refreshes: f.refreshes.length }, { status: scenario === 'forbidden' ? 403 : 401, refreshes: 0 });
		});
	}

	test('request IPC preserves the final URL before checking a redirected 401', async () => {
		const f = fixture([401], 'https://cdn.example.com/asset');
		const server = new RequestChannel(f.requestService);
		const client = new RequestChannelClient({
			call: <T>(command: string, args?: unknown, token?: CancellationToken): Promise<T> => server.call('client', command, args, token),
			listen: <T>() => Event.None as Event<T>,
		});
		const result = await requestWithExtensionGalleryAuthorization(client, f.service, { url, callSite: 'test' }, CancellationToken.None, true);
		result.stream.destroy();
		assert.deepStrictEqual({ finalUrl: result.url, refreshes: f.refreshes.length, requests: f.requests.length }, {
			finalUrl: 'https://cdn.example.com/asset', refreshes: 0, requests: 1,
		});
	});

	test('does not replay when renewal cannot replace the token', async () => {
		const f = fixture([401, 200]);
		f.setRefresh(async () => true);
		await assert.rejects(requestWithExtensionGalleryAuthorization(f.requestService, f.service, { url, callSite: 'test' }, CancellationToken.None, true), ExtensionGalleryAuthenticationError);
		assert.strictEqual(f.requests.length, 1);
	});

	test('cancelling one request does not wait for or cancel shared renewal', async () => {
		const f = fixture([401, 200]);
		const started = new DeferredPromise<void>();
		const pending = new DeferredPromise<boolean>();
		f.setRefresh(() => { started.complete(); return pending.p; });
		const source = store.add(new CancellationTokenSource());
		const request = requestWithExtensionGalleryAuthorization(f.requestService, f.service, { url, callSite: 'test' }, source.token, true);
		await started.p;
		source.cancel();
		await assert.rejects(request, isCancellationError);
		await pending.complete(false);
		assert.strictEqual(f.requests.length, 1);
	});

	function replica(authority: IExtensionGalleryManifestService) {
		let receiver!: IServerChannel<string>;
		const server: IChannelServer<string> = { registerChannel: (_name, channel) => receiver = channel };
		const authorizationChannel = new ExtensionGalleryAuthorizationChannel(authority);
		let connected = true;
		const routed: string[] = [];
		const service = store.add(new ExtensionGalleryManifestIPCService(server, context => connected ? {
			call: <T>(command: string, args?: { targetUrl?: unknown; accessToken?: unknown }) => {
				routed.push(context);
				return authorizationChannel.call<T>('replica', command, args);
			},
			listen: <T>() => Event.None as Event<T>,
		} satisfies IChannel : undefined, new NullLogService(), { _serviceBrand: undefined, ...product }));
		return {
			service, routed,
			publish: (catalog: IExtensionGalleryManifest | null, token: string | undefined, owner = 'window-1') =>
				receiver.call<void>(owner, 'setExtensionGalleryManifest', [catalog, token, 'https://marketplace.example.com']),
			disconnect: () => connected = false,
		};
	}

	test('replicas install token-only snapshots without manifest/status notifications', async () => {
		const f = fixture([200]);
		const r = replica(f.service);
		await r.publish(manifest, 'resource-1');
		let catalogs = 0;
		let statuses = 0;
		store.add(r.service.onDidChangeExtensionGalleryManifest(() => catalogs++));
		store.add(r.service.onDidChangeExtensionGalleryManifestStatus(() => statuses++));
		await r.publish({ ...manifest }, 'resource-2');

		assert.deepStrictEqual({ catalogs, statuses, token: await r.service.getAccessToken(url) }, { catalogs: 0, statuses: 0, token: 'resource-2' });
		await r.publish({ ...manifest, version: '2' }, 'resource-2');
		await r.publish(null, 'must-not-survive');
		assert.deepStrictEqual({ catalogs, statuses, token: await r.service.getAccessToken(url) }, { catalogs: 2, statuses: 1, token: undefined });
	});

	test('replicas route renewal to the latest snapshot owner and handle disconnection', async () => {
		const f = fixture([200]);
		const r = replica(f.service);
		await r.publish(manifest, 'resource-1');
		await r.publish(manifest, 'resource-1', 'window-2');
		const renewed = await r.service.refreshAccessToken(url, 'resource-1');
		const foreign = await r.service.refreshAccessToken('https://cdn.example.com/asset', 'resource-1');
		r.disconnect();
		const disconnected = await r.service.refreshAccessToken(url, 'resource-1');
		assert.deepStrictEqual({ renewed, foreign, disconnected, owners: r.routed }, { renewed: true, foreign: false, disconnected: false, owners: ['window-2'] });
	});
});
