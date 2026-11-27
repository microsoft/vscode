/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { suite, test } from 'vitest';
import { ChatResponseStreamImpl } from '../../../../util/common/chatResponseStreamImpl';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../util/common/test/testUtils';
import { DeferredPromise, timeout } from '../../../../util/vs/base/common/async';
import { CancellationToken, CancellationTokenSource } from '../../../../util/vs/base/common/cancellation';
import { Emitter } from '../../../../util/vs/base/common/event';
import { DisposableStore } from '../../../../util/vs/base/common/lifecycle';
import { ResponseStreamWithLinkification } from '../../common/responseStreamWithLinkification';
import { createMockWorkspaceService, createTestLinkifierService } from './util';

suite('Response stream linkifier lifetime', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('each response owns its disposable contributed linkifiers', () => {
		const store = new DisposableStore();
		try {
			const service = createTestLinkifierService();
			let created = 0;
			let disposed = 0;
			store.add(service.registerGlobalLinkifier({
				create: () => {
					created++;
					return {
						linkify: async () => undefined,
						dispose: () => disposed++,
					};
				},
			}));
			for (let i = 0; i < 37; i++) {
				const linkifier = service.createLinkifier({ requestId: undefined, references: [] }, [{
					create: () => ({ linkify: async () => undefined, dispose: () => disposed++ }),
				}]);
				linkifier.dispose();
				linkifier.dispose();
			}
			assert.deepStrictEqual({ created, disposed }, { created: 37, disposed: 74 });
		} finally {
			store.dispose();
		}
	});

	for (const outcome of ['success', 'cancel', 'output error', 'request error', 'request error without finalization'] as const) {
		test(`releases contributed listeners after response ${outcome}`, async () => {
			const store = new DisposableStore();
			try {
				const event = store.add(new Emitter<void>());
				const service = createTestLinkifierService();
				let tokenSource: CancellationTokenSource;
				let entered: DeferredPromise<void>;
				store.add(service.registerGlobalLinkifier({
					create: () => {
						const contribution = new DisposableStore();
						contribution.add(event.event(() => { }));
						return {
							linkify: async () => {
								entered.complete();
								if (outcome === 'cancel') {
									tokenSource.cancel();
								}
								return undefined;
							},
							dispose: () => contribution.dispose(),
						};
					},
				}));
				for (let i = 0; i < 37; i++) {
					tokenSource = store.add(new CancellationTokenSource());
					entered = new DeferredPromise<void>();
					const progress = new ChatResponseStreamImpl(() => {
						if (outcome === 'output error') {
							throw new Error('output failed');
						}
					}, () => { });
					const stream = new ResponseStreamWithLinkification({ requestId: undefined, references: [] }, progress, [], tokenSource.token, service, createMockWorkspaceService());
					assert.strictEqual(event.hasListeners(), true);
					stream.markdown('response text ');
					if (outcome === 'request error' || outcome === 'request error without finalization') {
						const request = new DisposableStore();
						request.add(stream);
						await entered.p;
						request.dispose();
						if (outcome === 'request error without finalization') {
							await timeout(0);
						} else {
							await assert.rejects(stream.finalize(), /Canceled/);
						}
					} else if (outcome === 'success') {
						await stream.finalize();
					} else {
						await assert.rejects(stream.finalize(), outcome === 'cancel' ? /Canceled/ : /output failed/);
					}
					assert.strictEqual(event.hasListeners(), false);
				}
			} finally {
				store.dispose();
			}
		});
	}

	test('disposed linkifiers do not invoke more contributed linkifiers', async () => {
		const service = createTestLinkifierService();
		let calls = 0;
		const registration = service.registerGlobalLinkifier({ create: () => ({ linkify: async () => { calls++; return undefined; } }) });
		try {
			const linkifier = service.createLinkifier({ requestId: undefined, references: [] });
			linkifier.dispose();
			await assert.rejects(linkifier.append('response ', CancellationToken.None), /Canceled/);
			assert.strictEqual(calls, 0);
		} finally {
			registration.dispose();
		}
	});
});
