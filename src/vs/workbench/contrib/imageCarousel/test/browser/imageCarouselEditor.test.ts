/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ImageCarouselEditor } from '../../browser/imageCarouselEditor.js';
import { ICarouselImage } from '../../browser/imageCarouselTypes.js';

interface ImageCarouselEditorTestAccessor {
	_blobUrlCache: Map<string, string>;
	_blobUrlCacheGeneration: number;
	_loadBlobUrl(image: ICarouselImage): Promise<string>;
	_revokeCachedBlobUrls(): void;
	_currentIndex: number;
	downloadCurrentImage(): Promise<void>;
}

suite('ImageCarouselEditor', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const sandbox = sinon.createSandbox();

	teardown(() => {
		sandbox.restore();
	});

	for (const source of ['memory', 'resource', 'resizedPreview'] as const) {
		(isWeb ? test.skip : test)(`downloads the selected image even if navigation changes during the save dialog (source: ${source})`, async () => {
			const target = URI.file('/saved/image.gif');
			const resource = URI.parse('vscode-agent-host://remote/image.gif');
			const bytes = VSBuffer.wrap(new Uint8Array([1, 2, 3]));
			const saveResult = new DeferredPromise<URI | undefined>();
			const showSaveDialog = sandbox.stub().returns(saveResult.p);
			const readFile = sandbox.stub().resolves({ value: bytes });
			const writeFile = sandbox.stub().resolves();
			const error = sandbox.stub();
			const editor = Object.assign(Object.create(ImageCarouselEditor.prototype), {
				_currentIndex: 1,
				_flatImages: [
					{ image: { id: 'first', name: 'first.png', mimeType: 'image/png', data: VSBuffer.fromString('other image') } },
					{
						image: {
							id: 'selected', name: 'selected', mimeType: 'image/gif',
							...(source === 'memory' ? { data: bytes } : { uri: resource }),
							...(source === 'resizedPreview' ? { data: VSBuffer.fromString('resized preview bytes') } : {}),
						}
					},
				],
				_fileService: upcastPartial<IFileService>({ readFile, writeFile }),
				_fileDialogService: upcastPartial<IFileDialogService>({ defaultFilePath: async () => URI.file('/downloads'), showSaveDialog }),
				_notificationService: upcastPartial<INotificationService>({ error }),
			}) as ImageCarouselEditorTestAccessor;

			const download = editor.downloadCurrentImage();
			editor._currentIndex = 0;
			await saveResult.complete(target);
			await download;

			assert.deepStrictEqual({
				suggested: showSaveDialog.firstCall.args[0].defaultUri,
				reads: readFile.args,
				writes: writeFile.args,
				errors: error.args,
			}, {
				suggested: URI.file('/downloads/selected.gif'),
				reads: source === 'memory' ? [] : [[resource]],
				writes: [[target, bytes]],
				errors: [],
			});
		});
	}

	(isWeb ? test.skip : test)('reports download failures', async () => {
		const error = sandbox.stub();
		const editor = Object.assign(Object.create(ImageCarouselEditor.prototype), {
			_currentIndex: 0,
			_flatImages: [{ image: { id: 'image', name: 'image.png', mimeType: 'image/png', uri: URI.file('/missing.png') } }],
			_fileService: upcastPartial<IFileService>({ readFile: async () => { throw new Error('Image unavailable'); } }),
			_fileDialogService: upcastPartial<IFileDialogService>({
				defaultFilePath: async () => URI.file('/downloads'),
				showSaveDialog: async () => URI.file('/downloads/image.png'),
			}),
			_notificationService: upcastPartial<INotificationService>({ error }),
		}) as ImageCarouselEditorTestAccessor;

		await editor.downloadCurrentImage();

		assert.deepStrictEqual(error.args, [['Failed to download image.png: Image unavailable']]);
	});

	for (const available of [true, false]) {
		(isWeb ? test.skip : test)(`downloads URL attachments from the image reader, not the buffered preview (available: ${available})`, async () => {
			const source = URI.parse('https://example.com/image.jpg');
			const original = VSBuffer.fromString('original JPEG bytes');
			const readFile = sandbox.stub().rejects(new Error('ENOPRO'));
			const readImage = sandbox.stub().resolves(available ? original : undefined);
			const writeFile = sandbox.stub().resolves();
			const error = sandbox.stub();
			const target = URI.file('/downloads/image.jpg');
			const editor = Object.assign(Object.create(ImageCarouselEditor.prototype), {
				_currentIndex: 0,
				_flatImages: [{ image: { id: 'image', name: 'image.jpg', mimeType: 'image/jpeg', uri: source, data: VSBuffer.fromString('resized PNG preview') } }],
				_fileService: upcastPartial<IFileService>({ readFile, writeFile }),
				_fileDialogService: upcastPartial<IFileDialogService>({
					defaultFilePath: async () => URI.file('/downloads'),
					showSaveDialog: async () => target,
				}),
				_webContentExtractorService: upcastPartial<ISharedWebContentExtractorService>({ readImage }),
				_notificationService: upcastPartial<INotificationService>({ error }),
			}) as ImageCarouselEditorTestAccessor;

			await editor.downloadCurrentImage();

			assert.deepStrictEqual({
				fileReads: readFile.args,
				imageReads: readImage.args.map(([resource]) => resource),
				writes: writeFile.args,
				errors: error.args,
			}, {
				fileReads: [],
				imageReads: [source],
				writes: available ? [[target, original]] : [],
				errors: available ? [] : [['Failed to download image.jpg: Unable to read image data from the URL.']],
			});
		});
	}

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
