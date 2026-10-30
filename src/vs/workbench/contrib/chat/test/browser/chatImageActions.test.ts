/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { stub } from 'sinon';
import { $, EventType } from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { URI } from '../../../../../base/common/uri.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { TestClipboardService } from '../../../../../platform/clipboard/test/common/testClipboardService.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { INotification, INotificationService } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { ISharedWebContentExtractorService, NullSharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IWebWorkerService } from '../../../../../platform/webWorker/browser/webWorkerService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { hookUpResourceContextMenu } from '../../browser/attachments/chatAttachmentWidgets.js';
import { createChatImageCopyActions } from '../../browser/chatImageActions.js';

suite('Chat image copy actions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let clipboard: TestClipboardService;
	let notifications: INotification[];
	let menu: Parameters<IContextMenuService['showContextMenu']>[0] | undefined;

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, store);
		clipboard = new TestClipboardService();
		notifications = [];
		menu = undefined;
		instantiationService.stub(IClipboardService, clipboard);
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override notify(notification: INotification) {
				notifications.push(notification);
				return super.notify(notification);
			}
		}());
		instantiationService.stub(IWebWorkerService, new class extends mock<IWebWorkerService>() {
			override createWorkerClient(): never {
				throw new Error('No worker in this test');
			}
		}());
		instantiationService.stub(IRequestService, upcastPartial<IRequestService>({}));
		instantiationService.stub(ISharedWebContentExtractorService, new NullSharedWebContentExtractorService());
		instantiationService.stub(ILabelService, upcastPartial<ILabelService>({ getUriLabel: resource => resource.path }));
		instantiationService.stub(IContextMenuService, upcastPartial<IContextMenuService>({
			showContextMenu: delegate => { menu = delegate; }
		}));
	});

	function imageSource(type = 'image/png', width = 24, height = 16): string {
		const canvas = $<HTMLCanvasElement>('canvas');
		canvas.width = width;
		canvas.height = height;
		canvas.getContext('2d')!.fillRect(0, 0, width, height);
		return canvas.toDataURL(type);
	}

	async function createImage(type = 'image/png'): Promise<HTMLImageElement> {
		const image = $<HTMLImageElement>('img', { src: imageSource(type), alt: 'Test image' });
		await image.decode();
		return image;
	}

	function actions(widget: HTMLElement, resource?: URI, readData?: () => Promise<Uint8Array>, mimeType?: string) {
		return instantiationService.invokeFunction(accessor => createChatImageCopyActions(accessor, widget, resource, readData, mimeType));
	}

	async function copiedSize() {
		const data = clipboard.writtenImage;
		if (!data) {
			return undefined;
		}
		const bitmap = await createImageBitmap(new Blob([data as Uint8Array<ArrayBuffer>]));
		try {
			return { signature: Array.from(data.subarray(0, 8)), width: bitmap.width, height: bitmap.height };
		} finally {
			bitmap.close();
		}
	}

	for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
		test(`copies ${type} as a full-size PNG, not its displayed thumbnail`, async () => {
			const image = await createImage(type);
			image.width = 3;
			image.height = 2;
			await actions(image)()[0].run();
			assert.deepStrictEqual({ image: await copiedSize(), errors: notifications }, {
				image: { signature: [137, 80, 78, 71, 13, 10, 26, 10], width: 24, height: 16 }, errors: [],
			});
		});
	}

	test('starts the clipboard write before image encoding yields', async () => {
		const events: string[] = [];
		instantiationService.stub(IClipboardService, new class extends TestClipboardService {
			override writeImage(data: Uint8Array | Promise<Uint8Array>) {
				events.push('writeImage');
				return super.writeImage(data);
			}
		}());
		const image = await createImage();
		const pending = actions(image)()[0].run();
		events.push('returned');
		await pending;
		assert.deepStrictEqual(events, ['writeImage', 'returned']);
	});

	test('copies original attachment bytes rather than the thumbnail', async () => {
		const data = await (await fetch(imageSource('image/jpeg', 40, 30))).arrayBuffer();
		const widget = $('div', undefined, await createImage());
		await actions(widget, undefined, async () => new Uint8Array(data))()[0].run();
		const size = await copiedSize();
		assert.deepStrictEqual({ width: size?.width, height: size?.height }, { width: 40, height: 30 });
	});

	test('copies a main-realm Markdown image adopted into an auxiliary document', async () => {
		const image = await createImage();
		const iframe = $<HTMLIFrameElement>('iframe');
		store.add(toDisposable(() => iframe.remove()));
		mainWindow.document.body.appendChild(iframe);
		iframe.contentDocument!.body.appendChild(image);
		await image.decode();
		const copyAction = actions(image)()[0];
		await copyAction.run();
		assert.deepStrictEqual({ enabled: copyAction.enabled, image: await copiedSize(), errors: notifications }, {
			enabled: true, image: { signature: [137, 80, 78, 71, 13, 10, 26, 10], width: 24, height: 16 }, errors: [],
		});
	});

	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>';
	for (const mimeType of ['image/svg+xml', 'image/svg']) {
		test(`copies ${mimeType} from an original-byte provider`, async () => {
			await actions($('div'), undefined, async () => VSBuffer.fromString(svg).buffer, mimeType)()[0].run();
			assert.deepStrictEqual({ image: await copiedSize(), errors: notifications }, {
				image: { signature: [137, 80, 78, 71, 13, 10, 26, 10], width: 40, height: 30 }, errors: [],
			});
		});
	}

	test('copies cross-origin SVG bytes through the privileged shared process', async () => {
		const image = await createImage();
		const url = 'https://example.com/image-without-cors-or-extension';
		const currentSrc = stub(image, 'currentSrc').get(() => url);
		store.add(toDisposable(() => currentSrc.restore()));
		const requests: string[] = [];
		instantiationService.stub(ISharedWebContentExtractorService, upcastPartial<ISharedWebContentExtractorService>({
			readImageWithMetadata: async uri => {
				requests.push(uri.toString());
				return { data: VSBuffer.fromString(svg), mimeType: 'image/svg+xml' };
			}
		}));
		await actions(image)()[0].run();
		assert.deepStrictEqual({ image: await copiedSize(), requests, errors: notifications }, {
			image: { signature: [137, 80, 78, 71, 13, 10, 26, 10], width: 40, height: 30 }, requests: [url], errors: [],
		});
	});

	test('preserves the Content-Type of SVGs fetched without a privileged service', async () => {
		const image = await createImage();
		const currentSrc = stub(image, 'currentSrc').get(() => 'https://example.com/image');
		store.add(toDisposable(() => currentSrc.restore()));
		instantiationService.stub(IRequestService, upcastPartial<IRequestService>({
			request: async () => ({ res: { statusCode: 200, headers: { 'content-type': 'image/svg+xml; charset=utf-8' } }, stream: bufferToStream(VSBuffer.fromString(svg)) })
		}));
		await actions(image)()[0].run();
		assert.deepStrictEqual({ image: await copiedSize(), errors: notifications }, {
			image: { signature: [137, 80, 78, 71, 13, 10, 26, 10], width: 40, height: 30 }, errors: [],
		});
	});

	test('explains the browser limitation when cross-origin reads are unavailable', async () => {
		const image = await createImage();
		const currentSrc = stub(image, 'currentSrc').get(() => 'https://example.com/image');
		store.add(toDisposable(() => currentSrc.restore()));
		instantiationService.stub(IRequestService, upcastPartial<IRequestService>({
			request: async () => { throw new TypeError('Failed to fetch'); }
		}));
		await actions(image)()[0].run();
		assert.deepStrictEqual({ image: clipboard.writtenImage, errors: notifications.map(notification => notification.message) }, {
			image: undefined,
			errors: ['Failed to copy image: Unable to read the image. In a browser, the image server must allow cross-origin access. Try opening the chat in the desktop application. Failed to fetch'],
		});
	});

	test('copies remote image bytes through the request service without a tainted canvas', async () => {
		const image = await createImage();
		const bytes = new Uint8Array(await (await fetch(image.src)).arrayBuffer());
		const url = 'https://raw.githubusercontent.com/example/image.png';
		const currentSrc = stub(image, 'currentSrc').get(() => url);
		store.add(toDisposable(() => currentSrc.restore()));
		const requests: string[] = [];
		instantiationService.stub(IRequestService, upcastPartial<IRequestService>({
			request: async options => {
				requests.push(options.url!);
				return { res: { statusCode: 200, headers: {} }, stream: bufferToStream(VSBuffer.wrap(bytes)) };
			}
		}));
		await actions(image)()[0].run();
		assert.deepStrictEqual({ image: await copiedSize(), requests, errors: notifications }, {
			image: { signature: [137, 80, 78, 71, 13, 10, 26, 10], width: 24, height: 16 }, requests: [url], errors: [],
		});
	});

	test('disables copying until a rendered image has loaded', async () => {
		const image = $<HTMLImageElement>('img');
		const getActions = actions(image);
		const before = getActions()[0].enabled;
		image.src = imageSource();
		await image.decode();
		assert.deepStrictEqual([before, getActions()[0].enabled], [false, true]);
	});

	test('reports image decoding errors without writing an empty image', async () => {
		await actions($('div'), undefined, async () => new Uint8Array([1, 2, 3]))()[0].run();
		assert.deepStrictEqual({
			image: clipboard.writtenImage,
			errors: notifications.map(notification => String(notification.message).startsWith('Failed to copy image:')),
		}, { image: undefined, errors: [true] });
	});

	test('reports remote fetch failures without writing an empty image', async () => {
		const image = await createImage();
		const currentSrc = stub(image, 'currentSrc').get(() => 'https://raw.githubusercontent.com/example/missing.png');
		store.add(toDisposable(() => currentSrc.restore()));
		instantiationService.stub(IRequestService, upcastPartial<IRequestService>({
			request: async () => ({ res: { statusCode: 404, headers: {} }, stream: bufferToStream(VSBuffer.alloc(0)) })
		}));
		await actions(image)()[0].run();
		assert.deepStrictEqual({ image: clipboard.writtenImage, errors: notifications.map(notification => notification.message) }, {
			image: undefined, errors: ['Failed to copy image: Image request failed (404).'],
		});
	});

	for (const resource of [URI.file('/workspace/my image.png'), URI.parse('vscode-remote://ssh-remote+host/workspace/my%20image.png'), toAgentHostUri(URI.file('/workspace/my image.png'), 'test')]) {
		test(`copies a readable ${resource.scheme} image path`, async () => {
			const copyActions = actions($('div'), resource)();
			await copyActions[1].run();
			assert.deepStrictEqual({ labels: copyActions.map(action => action.label), path: await clipboard.readText() }, {
				labels: ['Copy Image', 'Copy Image Path'], path: resource.path,
			});
		});
	}

	test('does not offer a disk path for embedded or synthetic resources', () => {
		assert.deepStrictEqual([undefined, URI.parse('data:image/png;base64,abc'), URI.parse('vscode-chat-response-resource://session/image.png')].map(resource => actions($('div'), resource)().map(action => action.label)), [['Copy Image'], ['Copy Image'], ['Copy Image']]);
	});

	test('opens image menus with mouse and keyboard without the response menu also opening', async () => {
		const widget = await createImage();
		store.add(instantiationService.invokeFunction(accessor => hookUpResourceContextMenu(accessor, widget, undefined, MenuId.ChatImageContext, createChatImageCopyActions(accessor, widget))));
		const requests = [
			new mainWindow.MouseEvent(EventType.CONTEXT_MENU, { bubbles: true, cancelable: true }),
			new mainWindow.KeyboardEvent(EventType.KEY_DOWN, { keyCode: 121, shiftKey: true, bubbles: true, cancelable: true }),
			new mainWindow.KeyboardEvent(EventType.KEY_DOWN, { key: 'ContextMenu', keyCode: 93, bubbles: true, cancelable: true }),
		];
		const results = [];
		for (const event of requests) {
			widget.dispatchEvent(event);
			await Promise.resolve();
			results.push({ prevented: event.defaultPrevented, actions: menu?.getActions?.().map(action => action.label) });
			menu = undefined;
		}
		assert.deepStrictEqual(results, requests.map(() => ({ prevented: true, actions: ['Copy Image'] })));
	});

	test('disposes image menu listeners with the rendered image', async () => {
		const image = await createImage();
		const listeners = instantiationService.invokeFunction(accessor => hookUpResourceContextMenu(accessor, image, undefined, MenuId.ChatImageContext, createChatImageCopyActions(accessor, image)));
		listeners.dispose();
		image.dispatchEvent(new mainWindow.MouseEvent(EventType.CONTEXT_MENU, { bubbles: true, cancelable: true }));
		await Promise.resolve();
		assert.strictEqual(menu, undefined);
	});

	for (const detachHover of [false, true]) {
		test(`restores focus to ${detachHover ? 'the attachment when its hover closes' : 'the connected hover image'}`, async () => {
			const attachment = $('div', { tabIndex: 0 });
			const image = await createImage();
			image.tabIndex = 0;
			store.add(toDisposable(() => { attachment.remove(); image.remove(); }));
			mainWindow.document.body.append(attachment, image);
			image.focus();
			store.add(instantiationService.invokeFunction(accessor => hookUpResourceContextMenu(accessor, image, undefined, MenuId.ChatImageContext, actions(image), attachment)));
			image.dispatchEvent(new mainWindow.KeyboardEvent(EventType.KEY_DOWN, { key: 'ContextMenu', bubbles: true, cancelable: true }));
			await Promise.resolve();
			assert.ok(menu);
			if (detachHover) {
				image.remove();
			}
			menu.onHide?.(true);
			assert.strictEqual(mainWindow.document.activeElement, detachHover ? attachment : image);
		});
	}
});
