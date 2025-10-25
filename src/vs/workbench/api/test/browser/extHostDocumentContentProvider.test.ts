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
import { timeout } from '../../../../base/common/async.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';

suite('ExtHostDocumentContentProvider', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const resource = URI.parse('foo:bar');
	let documentContentProvider: ExtHostDocumentContentProvider;
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
		const documentsAndEditors = new ExtHostDocumentsAndEditors(ehContext, new NullLogService());
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


});
