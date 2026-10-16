/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuMenuDelegate, IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { getNextZoomLevel, getPreviousZoomLevel, ImageViewer, ImageViewerContextMenuId, ImageViewerScale } from '../../browser/imageViewer.js';

function createImageDataUrl(width: number, height: number): string {
	const canvas = $<HTMLCanvasElement>('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d')!;
	context.fillStyle = 'rgb(200, 50, 50)';
	context.fillRect(0, 0, width, height);
	return canvas.toDataURL('image/png');
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

	setup(() => {
		container = $('div');
		container.style.width = '400px';
		container.style.height = '400px';
		mainWindow.document.body.appendChild(container);
		contextMenuDelegates = [];
		clipboardService = new RecordingClipboardService();
	});

	teardown(() => {
		container.remove();
	});

	function createViewer(): ImageViewer {
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(IClipboardService, clipboardService);
		instantiationService.stub(IContextMenuService, {
			showContextMenu: (delegate: IContextMenuMenuDelegate) => {
				contextMenuDelegates.push(delegate);
			},
		});

		const viewer = store.add(instantiationService.createInstance(ImageViewer, {}));
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

	test('copies the image as a PNG', async () => {
		const viewer = createViewer();
		await viewer.setSource(createImageDataUrl(40, 20), { alt: 'red' });

		// The clipboard write must start before `copyImage` yields, since some browsers only
		// allow clipboard writes while the triggering user gesture is being handled
		const copy = viewer.copyImage();
		clipboardService.events.push('returned');
		await copy;

		const copied = clipboardService.writtenImage;
		const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		assert.deepStrictEqual({ events: clipboardService.events, signature: copied && Array.from(copied.subarray(0, pngSignature.length)) }, { events: ['writeImage', 'returned'], signature: pngSignature });
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
