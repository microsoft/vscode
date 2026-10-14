/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent } from '../../../../../platform/files/common/files.js';
import { ImageCarouselEditor } from '../../browser/imageCarouselEditor.js';
import { ICarouselImage } from '../../browser/imageCarouselTypes.js';

interface ImageCarouselEditorTestAccessor {
	_blobUrlCache: Map<string, string>;
	_blobUrlCacheGeneration: number;
	_loadBlobUrl(image: ICarouselImage): Promise<string>;
	_revokeCachedBlobUrls(): void;
}

suite('ImageCarouselEditor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const sandbox = sinon.createSandbox();

	teardown(() => {
		sandbox.restore();
	});

	test('reuses and revokes a concurrently loaded blob URL', async () => {
		const resource = URI.file('/image.svg');
		const readFileResult = new DeferredPromise<IFileContent>();
		const readFile = sandbox.stub().returns(readFileResult.p);
		const createObjectURL = sandbox.stub(URL, 'createObjectURL');
		createObjectURL.onFirstCall().returns('blob:first');
		createObjectURL.onSecondCall().returns('blob:second');
		const revokeObjectURL = sandbox.stub(URL, 'revokeObjectURL');
		const editor = Object.assign(Object.create(ImageCarouselEditor.prototype), {
			_blobUrlCache: new Map(),
			_blobUrlCacheGeneration: 0,
			_fileService: { readFile },
		}) as ImageCarouselEditorTestAccessor;
		const image: ICarouselImage = { id: 'image', mimeType: 'image/svg+xml', name: 'image.svg', uri: resource };

		const firstUrl = editor._loadBlobUrl(image);
		const secondUrl = editor._loadBlobUrl(image);
		await readFileResult.complete({ resource, value: VSBuffer.fromString('<svg></svg>') } as IFileContent);

		assert.strictEqual(await firstUrl, 'blob:first');
		assert.strictEqual(await secondUrl, 'blob:first');
		assert.strictEqual(readFile.callCount, 2);
		assert.strictEqual(createObjectURL.callCount, 1);
		editor._revokeCachedBlobUrls();
		assert.deepStrictEqual(revokeObjectURL.args, [['blob:first']]);
	});

	test('ignores a load completed after cache cleanup', async () => {
		const resource = URI.file('/image.svg');
		const staleReadFileResult = new DeferredPromise<IFileContent>();
		const currentReadFileResult = new DeferredPromise<IFileContent>();
		const readFile = sandbox.stub();
		readFile.onFirstCall().returns(staleReadFileResult.p);
		readFile.onSecondCall().returns(currentReadFileResult.p);
		const createObjectURL = sandbox.stub(URL, 'createObjectURL').returns('blob:current');
		const revokeObjectURL = sandbox.stub(URL, 'revokeObjectURL');
		const editor = Object.assign(Object.create(ImageCarouselEditor.prototype), {
			_blobUrlCache: new Map(),
			_blobUrlCacheGeneration: 0,
			_fileService: { readFile },
		}) as ImageCarouselEditorTestAccessor;
		const image: ICarouselImage = { id: 'image', mimeType: 'image/svg+xml', name: 'image.svg', uri: resource };

		const staleUrl = editor._loadBlobUrl(image);
		editor._revokeCachedBlobUrls();
		const currentUrl = editor._loadBlobUrl(image);
		await currentReadFileResult.complete({ resource, value: VSBuffer.fromString('<svg>current</svg>') } as IFileContent);
		await staleReadFileResult.complete({ resource, value: VSBuffer.fromString('<svg>stale</svg>') } as IFileContent);

		assert.deepStrictEqual({
			staleUrl: await staleUrl,
			currentUrl: await currentUrl,
			cachedUrls: [...editor._blobUrlCache.values()],
			createObjectURLCallCount: createObjectURL.callCount,
		}, {
			staleUrl: '',
			currentUrl: 'blob:current',
			cachedUrls: ['blob:current'],
			createObjectURLCallCount: 1,
		});
		editor._revokeCachedBlobUrls();
		assert.deepStrictEqual(revokeObjectURL.args, [['blob:current']]);
	});
});
