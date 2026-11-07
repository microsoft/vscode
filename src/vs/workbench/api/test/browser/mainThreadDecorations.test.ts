/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { extUri } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestThemeService } from '../../../../platform/theme/test/common/testThemeService.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { DecorationsService } from '../../../services/decorations/browser/decorationsService.js';
import { MainThreadDecorations } from '../../browser/mainThreadDecorations.js';
import { DecorationReply, DecorationRequest, ExtHostDecorationsShape } from '../../common/extHost.protocol.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

suite('MainThreadDecorations', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.parse('test:/decoration.txt');

	function createDecorations(proxy: ExtHostDecorationsShape) {
		const service = store.add(new DecorationsService(
			new class extends mock<IUriIdentityService>() {
				override extUri = extUri;
			},
			new TestThemeService()
		));
		const mainThread = store.add(new MainThreadDecorations(SingleProxyRPCProtocol(proxy), service));
		return { service, mainThread };
	}

	test('unregistering a provider cancels its pending extension request', async () => {
		const started = new DeferredPromise<CancellationToken>();
		const reply = new DeferredPromise<DecorationReply>();
		const { service, mainThread } = createDecorations(new class extends mock<ExtHostDecorationsShape>() {
			override $provideDecorations(_handle: number, _requests: DecorationRequest[], token: CancellationToken) {
				started.complete(token);
				return reply.p;
			}
		});
		mainThread.$registerDecorationProvider(1, 'Test');
		service.getDecoration(uri, false);
		const token = await started.p;
		try {
			mainThread.$unregisterDecorationProvider(1);
			assert.strictEqual(token.isCancellationRequested, true);
		} finally {
			await reply.complete({});
			await timeout(0);
		}
	});

	test('unregistering before a batch is sent does not invoke the extension', async () => {
		let calls = 0;
		const { service, mainThread } = createDecorations(new class extends mock<ExtHostDecorationsShape>() {
			override async $provideDecorations() {
				calls++;
				return {};
			}
		});
		mainThread.$registerDecorationProvider(1, 'Test');
		service.getDecoration(uri, false);
		mainThread.$unregisterDecorationProvider(1);
		await timeout(0);
		assert.strictEqual(calls, 0);
	});

	test('disposal releases local request listeners even if the extension never replies', async () => {
		const started = new DeferredPromise<CancellationToken>();
		const { service, mainThread } = createDecorations(new class extends mock<ExtHostDecorationsShape>() {
			override $provideDecorations(_handle: number, _requests: DecorationRequest[], token: CancellationToken) {
				started.complete(token);
				return new Promise<DecorationReply>(() => { });
			}
		});
		mainThread.$registerDecorationProvider(1, 'Test');
		service.getDecoration(uri, false);
		const token = await started.p;
		mainThread.dispose();
		await timeout(0);
		assert.strictEqual(token.isCancellationRequested, true);
		// The suite's disposable tracker also verifies the local request listener was released.
	});

	test('a rejected extension request releases callers and allows a retry', async () => {
		let calls = 0;
		const { service, mainThread } = createDecorations(new class extends mock<ExtHostDecorationsShape>() {
			override async $provideDecorations() {
				if (++calls === 1) {
					throw new Error('Extension request failed');
				}
				return {};
			}
		});
		mainThread.$registerDecorationProvider(1, 'Test');
		service.getDecoration(uri, false);
		await timeout(0);
		service.getDecoration(uri, false);
		await timeout(0);
		assert.strictEqual(calls, 2);
	});

	test('successful batches still provide decorations for each requested resource', async () => {
		const { service, mainThread } = createDecorations(new class extends mock<ExtHostDecorationsShape>() {
			override async $provideDecorations(_handle: number, requests: DecorationRequest[]): Promise<DecorationReply> {
				return Object.fromEntries(requests.map(request => [request.id, [false, URI.revive(request.uri).path, 'T', { id: 'test.color' }]]));
			}
		});
		mainThread.$registerDecorationProvider(1, 'Test');
		const otherUri = URI.parse('test:/other.txt');
		service.getDecoration(uri, false);
		service.getDecoration(otherUri, false);
		await timeout(0);
		const first = store.add(service.getDecoration(uri, false)!);
		const second = store.add(service.getDecoration(otherUri, false)!);
		assert.deepStrictEqual([first.tooltip, second.tooltip], ['/decoration.txt', '/other.txt']);
	});

	test('disposing one provider does not cancel another provider or accept a late result', async () => {
		const tokens = new Map<number, CancellationToken>();
		const requests = new Map<number, DecorationRequest[]>();
		const firstReply = new DeferredPromise<DecorationReply>();
		const secondReply = new DeferredPromise<DecorationReply>();
		const { service, mainThread } = createDecorations(new class extends mock<ExtHostDecorationsShape>() {
			override $provideDecorations(handle: number, batch: DecorationRequest[], token: CancellationToken) {
				tokens.set(handle, token);
				requests.set(handle, batch);
				return handle === 1 ? firstReply.p : secondReply.p;
			}
		});
		mainThread.$registerDecorationProvider(1, 'First');
		mainThread.$registerDecorationProvider(2, 'Second');
		service.getDecoration(uri, false);
		await timeout(0);
		mainThread.$unregisterDecorationProvider(1);
		await firstReply.complete({ [requests.get(1)![0].id]: [true, 'Stale', 'S', { id: 'test.color' }] });
		await secondReply.complete({ [requests.get(2)![0].id]: [false, 'Live', 'L', { id: 'test.color' }] });
		await timeout(0);
		const decoration = store.add(service.getDecoration(uri, false)!);
		assert.deepStrictEqual({
			firstCancelled: tokens.get(1)!.isCancellationRequested,
			secondCancelled: tokens.get(2)!.isCancellationRequested,
			tooltip: decoration.tooltip,
			parent: service.getDecoration(URI.parse('test:/'), true)
		}, { firstCancelled: true, secondCancelled: false, tooltip: 'Live', parent: undefined });
		await timeout(0);
	});

	test('overlapping batches can finish out of order', async () => {
		const batches = [new DeferredPromise<DecorationRequest[]>(), new DeferredPromise<DecorationRequest[]>()];
		const replies = [new DeferredPromise<DecorationReply>(), new DeferredPromise<DecorationReply>()];
		let calls = 0;
		const { service, mainThread } = createDecorations(new class extends mock<ExtHostDecorationsShape>() {
			override $provideDecorations(_handle: number, requests: DecorationRequest[]) {
				const index = calls++;
				batches[index].complete(requests);
				return replies[index].p;
			}
		});
		mainThread.$registerDecorationProvider(1, 'Test');
		service.getDecoration(uri, false);
		const firstBatch = await batches[0].p;
		const otherUri = URI.parse('test:/other.txt');
		service.getDecoration(otherUri, false);
		const secondBatch = await batches[1].p;
		await replies[1].complete({ [secondBatch[0].id]: [false, 'Second', 'S', { id: 'test.color' }] });
		await timeout(0);
		const second = store.add(service.getDecoration(otherUri, false)!);
		await replies[0].complete({ [firstBatch[0].id]: [false, 'First', 'F', { id: 'test.color' }] });
		await timeout(0);
		const first = store.add(service.getDecoration(uri, false)!);
		assert.deepStrictEqual([first.tooltip, second.tooltip], ['First', 'Second']);
	});

	test('replacing a provider handle disposes its previous entry', async () => {
		const started = new DeferredPromise<CancellationToken>();
		const reply = new DeferredPromise<DecorationReply>();
		const { service, mainThread } = createDecorations(new class extends mock<ExtHostDecorationsShape>() {
			override $provideDecorations(_handle: number, _requests: DecorationRequest[], token: CancellationToken) {
				started.complete(token);
				return reply.p;
			}
		});
		mainThread.$registerDecorationProvider(1, 'First');
		service.getDecoration(uri, false);
		const token = await started.p;
		try {
			mainThread.$registerDecorationProvider(1, 'Replacement');
			assert.strictEqual(token.isCancellationRequested, true);
		} finally {
			await reply.complete({});
			await timeout(0);
		}
	});
});
