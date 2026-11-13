/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { $, Dimension } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileContent, IFileService } from '../../../../../platform/files/common/files.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ISharedWebContentExtractorService, NullSharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IWebWorkerService } from '../../../../../platform/webWorker/browser/webWorkerService.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup } from '../../../../services/editor/common/editorGroupsService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IWebviewService } from '../../../webview/browser/webview.js';
import { ImageCarouselEditor, ImageCarouselMarkingUpContext } from '../../browser/imageCarouselEditor.js';
import { ImageCarouselEditorInput } from '../../browser/imageCarouselEditorInput.js';
import { ICarouselImage, IImageCarouselMarkUp, IImageCarouselMarkUpResult } from '../../browser/imageCarouselTypes.js';

interface ImageCarouselEditorTestAccessor {
	_flatImages: { readonly image: ICarouselImage }[];
	_blobUrlCache: Map<ICarouselImage, { readonly url: string; readonly blob: Blob }>;
	_blobUrlCacheGeneration: number;
	_loadBlobUrl(image: ICarouselImage): Promise<string>;
	_revokeCachedBlobUrls(): void;
	_currentIndex: number;
	downloadCurrentImage(): Promise<void>;
}

suite('ImageCarouselEditor', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
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

	(isWeb ? test.skip : test)('suggests a name with the extension of the image\'s format, which a markup can change', async () => {
		const suggested: string[] = [];
		for (const [name, mimeType] of [['selected', 'image/gif'], ['photo.jpg', 'image/jpeg'], ['photo.jpg', 'image/png']]) {
			const showSaveDialog = sandbox.stub().resolves(undefined);
			const editor = Object.assign(Object.create(ImageCarouselEditor.prototype), {
				_currentIndex: 0,
				_flatImages: [{ image: { id: 'image', name, mimeType, data: VSBuffer.fromString('image') } }],
				_fileDialogService: upcastPartial<IFileDialogService>({ defaultFilePath: async () => URI.file('/downloads'), showSaveDialog }),
				_notificationService: upcastPartial<INotificationService>({ error: sandbox.stub() }),
			}) as ImageCarouselEditorTestAccessor;
			await editor.downloadCurrentImage();
			suggested.push(showSaveDialog.firstCall.args[0].defaultUri.path);
		}
		assert.deepStrictEqual(suggested, ['/downloads/selected.gif', '/downloads/photo.jpg', '/downloads/photo.png']);
	});

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

	suite('markup', () => {

		function createEditor() {
			const instantiationService = workbenchInstantiationService(undefined, store);
			instantiationService.stub(IWebviewService, {});
			instantiationService.stub(IWebWorkerService, {});
			instantiationService.stub(IClipboardService, {});
			instantiationService.stub(ISharedWebContentExtractorService, new NullSharedWebContentExtractorService());
			const closed: EditorInput[] = [];
			const group = new class extends mock<IEditorGroup>() {
				override windowId = mainWindow.vscodeWindowId;
				override async closeEditor(editor?: EditorInput): Promise<boolean> {
					closed.push(editor!);
					return true;
				}
			}();
			const parent = $('div');
			mainWindow.document.body.appendChild(parent);
			store.add(toDisposable(() => parent.remove()));
			const editor = store.add(instantiationService.createInstance(ImageCarouselEditor, group));
			editor.create(parent);
			editor.layout(new Dimension(600, 400));
			const contextKeyService = instantiationService.get(IContextKeyService);
			return { editor, parent, closed, isMarkingUp: () => contextKeyService.getContextKeyValue(ImageCarouselMarkingUpContext.key) };
		}

		/** A markup that applies `marked` when it is finished. */
		function createMarkUp(marked: VSBuffer) {
			const containers: HTMLElement[] = [];
			const result = new DeferredPromise<IImageCarouselMarkUpResult | undefined>();
			const markUp = (container: HTMLElement): IImageCarouselMarkUp => {
				containers.push(container);
				return { result: result.p, focus: () => { }, finish: () => void result.complete({ data: marked, mimeType: 'image/jpeg' }), dispose: () => { } };
			};
			return { markUp, containers, result };
		}

		(isWeb ? test.skip : test)('marks up an image instead of previewing it, and then previews the changed image', async () => {
			const { editor, parent, isMarkingUp } = createEditor();
			const { markUp, containers, result } = createMarkUp(VSBuffer.fromString('marked'));
			const input = store.add(new ImageCarouselEditorInput({
				id: 'collection', title: 'Images', sections: [{
					title: '', images: [
						{ id: 'other', name: 'other.png', mimeType: 'image/png', data: VSBuffer.fromString('other') },
						{ id: 'attached', name: 'attached.png', mimeType: 'image/png', data: VSBuffer.fromString('attached'), uri: URI.file('/attached.png'), markUp },
					]
				}]
			}, 1));
			await editor.setInput(input, undefined, {}, CancellationToken.None);
			const actions = () => [...parent.querySelectorAll('.image-actions .action-label')].map(action => ({ name: action.getAttribute('aria-label'), text: action.textContent }));
			const slideshow = parent.querySelector<HTMLElement>('.slideshow-container')!;
			const offered = actions();
			editor.previous();
			const notOffered = actions();
			editor.next();
			parent.querySelector<HTMLElement>('.image-actions .action-label[aria-label="Mark Up"]')!.click();
			const marking = { slideshow: slideshow.style.display, markUps: containers.length, inEditor: parent.contains(containers[0]), isMarkingUp: isMarkingUp() };
			editor.finishMarkUp();
			await result.p;
			const image = (editor as unknown as ImageCarouselEditorTestAccessor)._flatImages[1].image;
			assert.deepStrictEqual({
				offered, notOffered, marking,
				after: { slideshow: slideshow.style.display, markUp: !!parent.querySelector('.image-carousel-mark-up'), isMarkingUp: isMarkingUp(), image: { data: image.data?.toString(), mimeType: image.mimeType, uri: image.uri } },
			}, {
				// Mark Up shows its label after Download, which keeps its place.
				offered: [{ name: 'Download', text: '' }, { name: 'Mark Up', text: 'Mark Up' }],
				notOffered: [{ name: 'Download', text: '' }],
				marking: { slideshow: 'none', markUps: 1, inEditor: true, isMarkingUp: true },
				// The preview shows, and downloads, what the markup changed.
				after: { slideshow: '', markUp: false, isMarkingUp: false, image: { data: 'marked', mimeType: 'image/jpeg', uri: undefined } },
			});
		});

		(isWeb ? test.skip : test)('keeps the changes of a markup to its own image, also when another image has the same id', async () => {
			const { editor } = createEditor();
			const { markUp, result } = createMarkUp(VSBuffer.fromString('marked'));
			// The same file, attached to a request and to the input, has the same id in both sections.
			const id = URI.file('/same.png').toString();
			await editor.setInput(store.add(new ImageCarouselEditorInput({
				id: 'collection', title: 'Images', sections: [
					{ title: 'Request', images: [{ id, name: 'same.png', mimeType: 'image/png', data: VSBuffer.fromString('sent') }] },
					{ title: 'Input', images: [{ id, name: 'same.png', mimeType: 'image/png', data: VSBuffer.fromString('attached'), markUp }] },
				]
			}, 1)), undefined, {}, CancellationToken.None);
			editor.markUpCurrentImage();
			editor.finishMarkUp();
			await result.p;
			const accessor = editor as unknown as ImageCarouselEditorTestAccessor;
			const shown = await Promise.all(accessor._flatImages.map(async ({ image }) => {
				await accessor._loadBlobUrl(image);
				return accessor._blobUrlCache.get(image)?.blob.text();
			}));
			assert.deepStrictEqual(shown, ['sent', 'marked']);
		});

		(isWeb ? test.skip : test)('opens only the markup when asked to, and closes once it ends or its editor goes away', async () => {
			const { editor, parent, closed } = createEditor();
			const finished = createMarkUp(VSBuffer.fromString('finished'));
			const replaced = createMarkUp(VSBuffer.fromString('replaced'));
			const markUpOnly = (markUp: (container: HTMLElement) => IImageCarouselMarkUp) => store.add(new ImageCarouselEditorInput({
				id: 'collection', title: 'Edit Screenshot', sections: [{ title: '', images: [{ id: 'screenshot', name: 'Screenshot', mimeType: 'image/png', data: VSBuffer.fromString('screenshot'), markUp }] }],
			}, 0, true));
			const first = markUpOnly(finished.markUp);
			await editor.setInput(first, undefined, {}, CancellationToken.None);
			const shown = !!parent.querySelector('.image-carousel-mark-up');
			editor.finishMarkUp();
			await finished.result.p;

			// An editor that goes away still keeps the changes of its markup.
			await editor.setInput(markUpOnly(replaced.markUp), undefined, {}, CancellationToken.None);
			editor.clearInput();
			assert.deepStrictEqual({ shown, closed: closed.map(input => input === first), replaced: await replaced.result.p }, {
				shown: true,
				closed: [true],
				replaced: { data: VSBuffer.fromString('replaced'), mimeType: 'image/jpeg' },
			});
		});

		(isWeb ? test.skip : test)('keeps the changes of a markup that applies them asynchronously when the preview goes away', async () => {
			const { editor, parent } = createEditor();
			const saved = new DeferredPromise<void>();
			const result = new DeferredPromise<IImageCarouselMarkUpResult | undefined>();
			let disposed = false;
			// Like the screenshot tool's, this markup discards the changes that it has not applied when it is disposed.
			const markUp = (): IImageCarouselMarkUp => ({
				result: result.p,
				focus: () => { },
				finish: () => void saved.p.then(() => result.complete({ data: VSBuffer.fromString('marked'), mimeType: 'image/png' })),
				dispose: () => {
					disposed = true;
					void result.complete(undefined);
				},
			});
			await editor.setInput(store.add(new ImageCarouselEditorInput({
				id: 'collection', title: 'Images', sections: [{ title: '', images: [{ id: 'image', name: 'image.png', mimeType: 'image/png', data: VSBuffer.fromString('image'), markUp }] }],
			}, 0)), undefined, {}, CancellationToken.None);
			editor.markUpCurrentImage();
			editor.clearInput();
			const whileApplying = { shown: !!parent.querySelector('.image-carousel-mark-up'), disposed };
			await saved.complete();
			const applied = await result.p;
			assert.deepStrictEqual({ whileApplying, applied: applied?.data.toString(), disposed }, {
				whileApplying: { shown: false, disposed: false },
				applied: 'marked',
				disposed: true,
			});
		});
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

		const cached = [...editor._blobUrlCache.values()];
		assert.deepStrictEqual({
			staleUrl: await staleUrl,
			currentUrl: await currentUrl,
			cachedUrls: cached.map(entry => entry.url),
			cachedContents: await Promise.all(cached.map(entry => entry.blob.text())),
			createObjectURLCallCount: createObjectURL.callCount,
		}, {
			staleUrl: '',
			currentUrl: 'blob:current',
			cachedUrls: ['blob:current'],
			cachedContents: ['<svg>current</svg>'],
			createObjectURLCallCount: 1,
		});
		editor._revokeCachedBlobUrls();
		assert.deepStrictEqual(revokeObjectURL.args, [['blob:current']]);
	});
});
