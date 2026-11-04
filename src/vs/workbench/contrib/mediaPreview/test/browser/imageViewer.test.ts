/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { IAnchor } from '../../../../../base/browser/ui/contextview/contextview.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IWebWorkerClient, Proxied } from '../../../../../base/common/worker/webWorker.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IWebWorkerService } from '../../../../../platform/webWorker/browser/webWorkerService.js';
import { ImageEncoderWorker } from '../../browser/imageEncoderWorker.js';
import { getNextZoomLevel, getPreviousZoomLevel, IImageViewerOptions, ImageViewer, ImageViewerContextMenuId, ImageViewerScale } from '../../browser/imageViewer.js';

function createImageDataUrl(width: number, height: number, type = 'image/png'): string {
	const canvas = $<HTMLCanvasElement>('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d')!;
	context.fillStyle = 'rgb(200, 50, 50)';
	context.fillRect(0, 0, width, height);
	return canvas.toDataURL(type);
}

function toBytes(dataUrl: string): Uint8Array {
	return Uint8Array.from(atob(dataUrl.split(',')[1]), c => c.charCodeAt(0));
}

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function getSignature(data: Uint8Array | undefined): number[] | undefined {
	return data && Array.from(data.subarray(0, pngSignature.length));
}

/**
 * Runs the image encoder worker's code in-process, or fails like an unavailable worker.
 */
class TestWebWorkerService extends mock<IWebWorkerService>() {
	created = 0;
	fail = false;

	override createWorkerClient<T extends object>(): IWebWorkerClient<T> {
		this.created++;
		const encoder = new ImageEncoderWorker();
		const fail = this.fail;
		const client: Pick<IWebWorkerClient<ImageEncoderWorker>, 'dispose'> & { proxy: Pick<Proxied<ImageEncoderWorker>, '$encodePng'> } = {
			proxy: {
				$encodePng: bitmap => fail ? Promise.reject(new Error('Worker unavailable')) : encoder.$encodePng(bitmap),
			},
			dispose: () => { },
		};
		return client as unknown as IWebWorkerClient<T>;
	}
}

class RecordingClipboardService extends TestClipboardService {
	readonly events: string[] = [];

	override writeImage(data: Uint8Array | Promise<Uint8Array>): Promise<void> {
		this.events.push('writeImage');
		return super.writeImage(data);
	}
}

suite('ImageViewer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let container: HTMLElement;
	let contextMenuDelegates: IContextMenuMenuDelegate[];
	let clipboardService: RecordingClipboardService;
	let webWorkerService: TestWebWorkerService;

	setup(() => {
		container = $('div');
		container.style.width = '400px';
		container.style.height = '400px';
		mainWindow.document.body.appendChild(container);
		contextMenuDelegates = [];
		clipboardService = new RecordingClipboardService();
		webWorkerService = new TestWebWorkerService();
	});

	teardown(() => {
		container.remove();
	});

	function createViewer(options: IImageViewerOptions = {}): ImageViewer {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IClipboardService, clipboardService);
		instantiationService.stub(IWebWorkerService, webWorkerService);
		instantiationService.stub(IContextMenuService, {
			showContextMenu: (delegate: IContextMenuMenuDelegate) => {
				contextMenuDelegates.push(delegate);
			},
		});

		const viewer = store.add(instantiationService.createInstance(ImageViewer, options));
		container.appendChild(viewer.element);
		return viewer;
	}

	test('steps through the predefined zoom levels', () => {
		assert.deepStrictEqual({
			next: [0.05, 0.1, 0.95, 1, 2.5, 20, 25].map(getNextZoomLevel),
			previous: [0.05, 0.1, 0.95, 1, 2.5, 20, 25].map(getPreviousZoomLevel),
		}, {
			next: [0.1, 0.2, 1, 1.5, 3, 20, 20],
			previous: [0.1, 0.1, 0.9, 0.9, 2, 15, 20],
		});
	});

	test('zooms from fit, pixelates large zoom levels, and resets to fit', async () => {
		const viewer = createViewer();
		const scales: ImageViewerScale[] = [];
		store.add(viewer.onDidChangeScale(scale => scales.push(scale)));

		const loaded = await viewer.setSource(createImageDataUrl(40, 20), { alt: 'red' });
		const image = viewer.element.querySelector('img')!;
		const snapshot = () => ({
			scale: viewer.scale,
			zoomed: viewer.element.classList.contains('zoomed'),
			pixelated: image.classList.contains('pixelated'),
		});

		const states = [snapshot()];
		viewer.zoomIn();
		states.push(snapshot());
		viewer.setScale(5);
		states.push(snapshot());
		viewer.setScale('fit');
		states.push(snapshot());
		viewer.zoomOut();
		states.push(snapshot());

		assert.deepStrictEqual({ loaded, naturalSize: viewer.naturalSize, alt: image.alt, states, scales }, {
			loaded: true,
			naturalSize: { width: 40, height: 20 },
			alt: 'red',
			states: [
				{ scale: 'fit', zoomed: false, pixelated: false },
				{ scale: 1.5, zoomed: true, pixelated: false },
				{ scale: 5, zoomed: true, pixelated: true },
				{ scale: 'fit', zoomed: false, pixelated: false },
				{ scale: 0.9, zoomed: true, pixelated: false },
			],
			scales: [1.5, 5, 'fit', 0.9],
		});
	});

	test('restores the zoom from a view state', async () => {
		const viewer = createViewer();
		await viewer.setSource(createImageDataUrl(40, 20), { alt: 'red' });
		viewer.setScale(3);
		const viewState = viewer.getViewState();

		await viewer.setSource(createImageDataUrl(40, 20), { alt: 'red' });
		const scaleAfterNewSource = viewer.scale;
		await viewer.setSource(createImageDataUrl(40, 20), { alt: 'red', viewState });

		assert.deepStrictEqual({ scaleAfterNewSource, restoredScale: viewer.scale }, { scaleAfterNewSource: 'fit', restoredScale: 3 });
	});

	test('does not zoom or show a context menu for images that fail to load', async () => {
		const viewer = createViewer();
		const loaded = await viewer.setSource('data:image/png;base64,AAAA', { alt: 'broken' });
		viewer.zoomIn();
		viewer.element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));

		assert.deepStrictEqual({ loaded, hasImage: viewer.hasImage, scale: viewer.scale, contextMenus: contextMenuDelegates.length }, {
			loaded: false,
			hasImage: false,
			scale: 'fit',
			contextMenus: 0,
		});
	});

	test('shows the image context menu with the viewer as argument', async () => {
		const viewer = createViewer();
		await viewer.setSource(createImageDataUrl(40, 20), { alt: 'red' });

		const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
		viewer.element.dispatchEvent(event);

		assert.deepStrictEqual(contextMenuDelegates.map(delegate => ({
			menuId: delegate.menuId,
			arg: delegate.menuActionOptions?.arg,
			shouldForwardArgs: delegate.menuActionOptions?.shouldForwardArgs,
		})), [{ menuId: ImageViewerContextMenuId, arg: viewer, shouldForwardArgs: true }]);
		assert.strictEqual(event.defaultPrevented, true);
	});

	test('shows the image context menu from the keyboard when the focus target has focus', async () => {
		// Like the carousel, the focus target contains the viewer and other controls
		const focusTarget = $('div');
		const button = $('button');
		focusTarget.appendChild(button);
		container.appendChild(focusTarget);
		const viewer = createViewer({ focusTarget });
		focusTarget.appendChild(viewer.element);
		await viewer.setSource(createImageDataUrl(40, 20), { alt: 'red' });

		const pressShiftF10 = (target: HTMLElement) => {
			const init: KeyboardEventInit = { key: 'F10', code: 'F10', keyCode: 121, shiftKey: true, bubbles: true, cancelable: true };
			const keyDown = new KeyboardEvent('keydown', init);
			target.dispatchEvent(keyDown);
			target.dispatchEvent(new KeyboardEvent('keyup', init));
			const viewerRect = viewer.element.getBoundingClientRect();
			const menus = contextMenuDelegates.map(delegate => {
				const anchor = delegate.getAnchor() as IAnchor;
				const anchoredInViewer = anchor.x >= viewerRect.left && anchor.x <= viewerRect.right && anchor.y >= viewerRect.top && anchor.y <= viewerRect.bottom;
				return { arg: delegate.menuActionOptions?.arg, anchoredInViewer };
			});
			contextMenuDelegates.length = 0;
			return { menus, defaultPrevented: keyDown.defaultPrevented };
		};

		assert.deepStrictEqual({
			focusTarget: pressShiftF10(focusTarget),
			otherControl: pressShiftF10(button),
		}, {
			focusTarget: { menus: [{ arg: viewer, anchoredInViewer: true }], defaultPrevented: true },
			otherControl: { menus: [], defaultPrevented: false },
		});
	});

	test('copies the image as a PNG', async () => {
		const viewer = createViewer();
		await viewer.setSource(createImageDataUrl(40, 20), { alt: 'red' });

		// The clipboard write must start before `copyImage` yields, since some browsers only
		// allow clipboard writes while the triggering user gesture is being handled
		const copy = viewer.copyImage();
		clipboardService.events.push('returned');
		await copy;

		assert.deepStrictEqual({ events: clipboardService.events, signature: getSignature(clipboardService.writtenImage) }, { events: ['writeImage', 'returned'], signature: pngSignature });
	});

	test('copies PNG sources as is and encodes other images in a worker', async () => {
		const viewer = createViewer();
		const copy = async (src: string, mimeType: string, read: () => Promise<Uint8Array>) => {
			await viewer.setSource(src, { alt: 'image', data: { mimeType, read } });
			const workersBefore = webWorkerService.created;
			await viewer.copyImage();
			return { workers: webWorkerService.created - workersBefore, signature: getSignature(clipboardService.writtenImage), written: clipboardService.writtenImage };
		};

		const pngUrl = createImageDataUrl(40, 20);
		const png = toBytes(pngUrl);
		const jpegUrl = createImageDataUrl(40, 20, 'image/jpeg');
		const jpeg = toBytes(jpegUrl);

		const pngCopy = await copy(pngUrl, 'image/png', async () => png);
		const jpegCopy = await copy(jpegUrl, 'image/jpeg', async () => jpeg);
		const mislabeledCopy = await copy(jpegUrl, 'image/png', async () => jpeg);
		webWorkerService.fail = true;
		const fallbackCopy = await copy(jpegUrl, 'image/jpeg', async () => jpeg);

		assert.deepStrictEqual({
			png: { workers: pngCopy.workers, sameBytes: pngCopy.written === png },
			jpeg: { workers: jpegCopy.workers, signature: jpegCopy.signature },
			mislabeled: { workers: mislabeledCopy.workers, signature: mislabeledCopy.signature },
			fallback: { workers: fallbackCopy.workers, signature: fallbackCopy.signature },
		}, {
			png: { workers: 0, sameBytes: true },
			jpeg: { workers: 1, signature: pngSignature },
			mislabeled: { workers: 1, signature: pngSignature },
			fallback: { workers: 1, signature: pngSignature },
		});
	});

	test('copies the image on the native copy event when focused', async () => {
		const copyOnNativeEvent = async (viewer: ImageViewer, focusTarget: HTMLElement) => {
			await viewer.setSource(createImageDataUrl(40, 20), { alt: 'red' });
			focusTarget.tabIndex = 0;
			focusTarget.focus();
			const event = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
			viewer.element.dispatchEvent(event);
			const copied = clipboardService.events.length > 0;
			clipboardService.events.length = 0;
			return { copied, defaultPrevented: event.defaultPrevented };
		};

		const viewer = createViewer();
		const preview = await copyOnNativeEvent(viewer, viewer.element);

		const unfocused = createViewer();
		await unfocused.setSource(createImageDataUrl(40, 20), { alt: 'red' });
		const unfocusedEvent = new ClipboardEvent('copy', { bubbles: true, cancelable: true });
		unfocused.element.dispatchEvent(unfocusedEvent);

		const parent = $('div');
		container.appendChild(parent);
		const carouselViewer = createViewer({ focusTarget: parent });
		parent.appendChild(carouselViewer.element);
		const carousel = await copyOnNativeEvent(carouselViewer, parent);

		assert.deepStrictEqual({
			preview,
			unfocused: { copied: clipboardService.events.length > 0, defaultPrevented: unfocusedEvent.defaultPrevented },
			carousel,
		}, {
			preview: { copied: true, defaultPrevented: true },
			unfocused: { copied: false, defaultPrevented: false },
			carousel: { copied: true, defaultPrevented: true },
		});
	});

	test('a cancelled pending source does not replace the current image', async () => {
		const viewer = createViewer();
		await viewer.setSource(createImageDataUrl(40, 20), { alt: 'current' });
		const pending = viewer.setSource(createImageDataUrl(10, 10), { alt: 'stale' });
		viewer.cancelPendingSource();

		assert.deepStrictEqual({ loaded: await pending, naturalSize: viewer.naturalSize }, {
			loaded: false,
			naturalSize: { width: 40, height: 20 },
		});
	});

	test('a newer source supersedes a pending one', async () => {
		const viewer = createViewer();
		const first = viewer.setSource(createImageDataUrl(40, 20), { alt: 'first' });
		const second = viewer.setSource(createImageDataUrl(10, 10), { alt: 'second' });

		assert.deepStrictEqual({ first: await first, second: await second, naturalSize: viewer.naturalSize }, {
			first: false,
			second: true,
			naturalSize: { width: 10, height: 10 },
		});
	});
});
