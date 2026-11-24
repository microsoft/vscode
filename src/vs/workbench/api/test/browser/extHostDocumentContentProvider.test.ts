/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI, UriComponents } from '../../../../base/common/uri.js';
import { ExtHostDocumentsAndEditors } from '../../common/extHostDocumentsAndEditors.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtHostDocumentContentProvider } from '../../common/extHostDocumentContentProviders.js';
import { Emitter } from '../../../../base/common/event.js';
import { MainThreadDocumentContentProvidersShape } from '../../common/extHost.protocol.js';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { CancellationError } from '../../../../base/common/errors.js';

suite('ExtHostDocumentContentProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const resource = URI.parse('foo:bar');
	let documentContentProvider: ExtHostDocumentContentProvider;
	let documentsAndEditors: ExtHostDocumentsAndEditors;
	let mainThreadContentProvider: MainThreadDocumentContentProvidersShape;
	const changes: [uri: UriComponents, value: string][] = [];

	setup(() => {

		changes.length = 0;

		mainThreadContentProvider = new class implements MainThreadDocumentContentProvidersShape {
			$registerTextContentProvider(handle: number, scheme: string): void {

			}
			$unregisterTextContentProvider(handle: number): void {

			}
			async $onVirtualDocumentChange(uri: UriComponents, value: string): Promise<void> {
				await timeout(10);
				changes.push([uri, value]);
			}
			dispose(): void {
				throw new Error('Method not implemented.');
			}
		};

		const ehContext = SingleProxyRPCProtocol(mainThreadContentProvider);
		documentsAndEditors = new ExtHostDocumentsAndEditors(ehContext, new NullLogService());
		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				isDirty: false,
				languageId: 'foo',
				uri: resource,
				versionId: 1,
				lines: ['foo'],
				EOL: '\n',
				encoding: 'utf8'
			}]
		});
		documentContentProvider = new ExtHostDocumentContentProvider(ehContext, documentsAndEditors, new NullLogService());
	});

	test('TextDocumentContentProvider drops onDidChange events when they happen quickly #179711', async () => {
		await runWithFakedTimers({}, async function () {

			const emitter = new Emitter<URI>();
			const contents = ['X', 'Y'];
			let counter = 0;

			let stack = 0;

			const d = documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
				onDidChange: emitter.event,
				async provideTextDocumentContent(_uri) {
					assert.strictEqual(stack, 0);
					stack++;
					try {
						await timeout(0);
						return contents[counter++ % contents.length];
					} finally {
						stack--;
					}
				}
			});

			emitter.fire(resource);
			emitter.fire(resource);

			await timeout(100);

			assert.strictEqual(changes.length, 2);
			assert.strictEqual(changes[0][1], 'X');
			assert.strictEqual(changes[1][1], 'Y');

			d.dispose();
		});
	});

	test('applies three rapid content updates in order', async () => {
		await runWithFakedTimers({}, async () => {
			const emitter = disposables.add(new Emitter<URI>());
			const contents = ['first', 'second', 'third'];
			let counter = 0;

			disposables.add(documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
				onDidChange: emitter.event,
				async provideTextDocumentContent() {
					const content = contents[counter++];
					await timeout(content === 'second' ? 20 : 0);
					return content;
				}
			}));

			emitter.fire(resource);
			emitter.fire(resource);
			emitter.fire(resource);

			await timeout(100);

			assert.deepStrictEqual(changes.map(([, value]) => value), contents);
		});
	});

	test('refreshes independent documents while another refresh is pending', async () => {
		await runWithFakedTimers({}, async () => {
			const firstResource = resource.with({ path: 'first' });
			const otherResource = resource.with({ path: 'other' });
			documentsAndEditors.$acceptDocumentsAndEditorsDelta({
				addedDocuments: [firstResource, otherResource].map(uri => ({
					isDirty: false,
					languageId: 'foo',
					uri,
					versionId: 1,
					lines: ['foo'],
					EOL: '\n',
					encoding: 'utf8'
				}))
			});
			const emitter = disposables.add(new Emitter<URI>());
			const firstContent = new DeferredPromise<string>();
			const slowContent = new DeferredPromise<string>();
			disposables.add(documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
				onDidChange: emitter.event,
				provideTextDocumentContent(uri) {
					if (uri.path === firstResource.path) {
						return firstContent.p;
					}
					return uri.path === resource.path ? slowContent.p : 'fast';
				}
			}));

			try {
				emitter.fire(firstResource);
				emitter.fire(resource);
				emitter.fire(otherResource);
				await firstContent.complete('first');
				await timeout(100);

				assert.deepStrictEqual(changes.filter(([uri]) => uri.path === otherResource.path).map(([, value]) => value), ['fast']);
			} finally {
				await firstContent.complete('first');
				await slowContent.complete('slow');
				await timeout(100);
			}
		});
	});

	test('continues queued refreshes after rejection and unchanged content', async () => {
		await runWithFakedTimers({}, async () => {
			const emitter = disposables.add(new Emitter<URI>());
			const contents = [undefined, 'foo', '', 'updated'];
			let counter = 0;
			disposables.add(documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
				onDidChange: emitter.event,
				async provideTextDocumentContent() {
					const content = contents[counter++];
					if (content === undefined) {
						throw new CancellationError();
					}
					return content;
				}
			}));

			for (const _ of contents) {
				emitter.fire(resource);
			}
			await timeout(100);

			assert.deepStrictEqual(changes.map(([, value]) => value), ['', 'updated']);
		});
	});

	test('ignores content returned after the document closes', async () => {
		await runWithFakedTimers({}, async () => {
			const emitter = disposables.add(new Emitter<URI>());
			const content = new DeferredPromise<string>();
			disposables.add(documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
				onDidChange: emitter.event,
				provideTextDocumentContent() {
					return content.p;
				}
			}));

			try {
				emitter.fire(resource);
				await timeout(0);
				documentsAndEditors.$acceptDocumentsAndEditorsDelta({ removedDocuments: [resource] });
			} finally {
				await content.complete('updated');
				await timeout(100);
			}

			assert.deepStrictEqual(changes, []);
		});
	});

	test('ignores change events after provider disposal', async () => {
		await runWithFakedTimers({}, async () => {
			const emitter = disposables.add(new Emitter<URI>());
			let calls = 0;
			const registration = disposables.add(documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
				onDidChange: emitter.event,
				provideTextDocumentContent() {
					calls++;
					return 'updated';
				}
			}));

			registration.dispose();
			emitter.fire(resource);
			await timeout(100);

			assert.strictEqual(calls, 0);
		});
	});

	test('ignores refreshes queued immediately before provider disposal', async () => {
		await runWithFakedTimers({}, async () => {
			const emitter = disposables.add(new Emitter<URI>());
			let calls = 0;
			const registration = disposables.add(documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
				onDidChange: emitter.event,
				provideTextDocumentContent() {
					calls++;
					return 'updated';
				}
			}));

			emitter.fire(resource);
			registration.dispose();
			await timeout(100);

			assert.deepStrictEqual({ calls, changes }, { calls: 0, changes: [] });
		});
	});

	for (const queueAnotherRefresh of [false, true]) {
		test(`finishes an in-flight refresh after provider disposal${queueAnotherRefresh ? ' without starting queued refreshes' : ''}`, async () => {
			await runWithFakedTimers({}, async () => {
				const emitter = disposables.add(new Emitter<URI>());
				const content = new DeferredPromise<string>();
				let calls = 0;
				const registration = disposables.add(documentContentProvider.registerTextDocumentContentProvider(resource.scheme, {
					onDidChange: emitter.event,
					provideTextDocumentContent() {
						calls++;
						return content.p;
					}
				}));

				try {
					emitter.fire(resource);
					await timeout(0);
					if (queueAnotherRefresh) {
						emitter.fire(resource);
					}
					registration.dispose();
				} finally {
					await content.complete('updated');
					await timeout(100);
				}

				assert.deepStrictEqual({ calls, changes: changes.map(([, value]) => value) }, { calls: 1, changes: ['updated'] });
			});
		});
	}
});
