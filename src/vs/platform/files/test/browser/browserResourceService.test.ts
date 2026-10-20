/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { FileAccess } from '../../../../base/common/network.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { BrowserResourceService } from '../../browser/browserResourceService.js';
import { IFileContent, IFileService } from '../../common/files.js';

suite('BrowserResourceService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('browser-resource-test://connection/project/style.css?metadata=original#section');

	function createService(provider?: (id: string, resource: URI) => URI, read?: () => Promise<VSBuffer>) {
		const reads: URI[] = [];
		const fileService = new class extends mock<IFileService>() {
			override async readFile(uri: URI): Promise<IFileContent> {
				reads.push(uri);
				return {
					resource: uri, name: 'style.css', mtime: 0, ctime: 0, size: 3, etag: '',
					readonly: true, locked: false, executable: false,
					value: read ? await read() : VSBuffer.fromString('css'),
				};
			}
		}();
		const service = store.add(new BrowserResourceService(provider, fileService));
		return { service, reads };
	}

	const provider = (id: string, original: URI) => URI.from({
		scheme: 'https', authority: 'workbench.test', path: '/resource', query: new URLSearchParams({ resourceId: id }).toString(), fragment: original.fragment,
	});

	test('opts in schemes without changing other browser resources', async () => {
		const { service, reads } = createService(provider);
		const http = URI.parse('https://example.com/image.png');
		assert.deepStrictEqual({
			file: service.resolve(resource),
			http: service.resolve(http),
			browserHttp: FileAccess.uriToBrowserUri(http).toString(),
			unknown: await service.read('unknown'),
			reads,
		}, { file: undefined, http: undefined, browserHttp: http.toString(), unknown: undefined, reads: [] });
	});

	test('FileAccess uses a window-issued ID and preserves the full filesystem URI on reads', async () => {
		const { service, reads } = createService(provider);
		store.add(service.registerScheme(resource.scheme));
		const browserUri = FileAccess.uriToBrowserUri(resource);
		const id = new URLSearchParams(browserUri.query).get('resourceId')!;
		const result = await service.read(id);
		const resolved = await FileAccess.resolveBrowserUri(resource)!;
		resolved.dispose();
		assert.deepStrictEqual({
			browserScheme: browserUri.scheme,
			fragment: browserUri.fragment,
			stable: resolved.object.toString() === browserUri.toString(),
			content: result?.content.toString(),
			mime: result?.mimeType,
			reads: reads.map(uri => uri.toString()),
		}, { browserScheme: 'https', fragment: 'section', stable: true, content: 'css', mime: 'text/css', reads: [resource.toString()] });
	});

	test('IDs are scoped to their issuing window and revoked when the scheme is unregistered', async () => {
		const { service, reads } = createService(provider);
		const registration = store.add(service.registerScheme(resource.scheme));
		const browserUri = FileAccess.uriToBrowserUri(resource);
		const id = new URLSearchParams(browserUri.query).get('resourceId')!;
		const otherWindow = createService(provider);
		const otherRead = await otherWindow.service.read(id);
		registration.dispose();
		assert.deepStrictEqual({
			otherRead, revokedRead: await service.read(id), restored: FileAccess.uriToBrowserUri(resource).toString(), reads,
		}, { otherRead: undefined, revokedRead: undefined, restored: resource.toString(), reads: [] });
	});

	test('web fallback shares object URLs and releases them after the last consumer', async () => {
		const { service, reads } = createService();
		store.add(service.registerScheme(resource.scheme));
		const [first, second] = await Promise.all([FileAccess.resolveBrowserUri(resource)!, FileAccess.resolveBrowserUri(resource)!]);
		store.add(first);
		store.add(second);
		first.dispose();
		await timeout(0);
		const response = await fetch(second.object.toString(true));
		assert.deepStrictEqual({
			same: first.object.toString() === second.object.toString(),
			body: await response.text(), mime: response.headers.get('content-type'), reads: reads.length,
		}, { same: true, body: 'css', mime: 'text/css', reads: 1 });
		second.dispose();
		await timeout(0);
		await assert.rejects(fetch(second.object.toString(true)));
	});

	test('service disposal releases object URLs and registered browser mappings', async () => {
		const { service } = createService();
		store.add(service.registerScheme(resource.scheme));
		const reference = store.add(await service.resolve(resource)!);
		service.dispose();
		await timeout(0);
		await assert.rejects(fetch(reference.object.toString(true)));
		assert.strictEqual(FileAccess.resolveBrowserUri(resource), undefined);
	});

	test('disposal while reading does not create an object URL', async () => {
		const pending = new DeferredPromise<VSBuffer>();
		const { service } = createService(undefined, () => pending.p);
		store.add(service.registerScheme(resource.scheme));
		const resolving = service.resolve(resource)!;
		service.dispose();
		await pending.complete(VSBuffer.fromString('css'));
		await assert.rejects(resolving, /Canceled/);
	});

	test('read failures are propagated rather than cached as successful resources', async () => {
		const { service, reads } = createService(undefined, async () => { throw new Error('Access denied'); });
		store.add(service.registerScheme(resource.scheme));
		await assert.rejects(service.resolve(resource)!, /Access denied/);
		await timeout(0);
		await assert.rejects(service.resolve(resource)!, /Access denied/);
		assert.strictEqual(reads.length, 2);
	});
});
