/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { DeferredPromise, retry, timeout } from '../../../../../../../base/common/async.js';
import { decodeBase64, VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Disposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { TestFileService, workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatResourceGroupWidget } from '../../../../browser/widget/chatContentParts/chatResourceGroupWidget.js';
import { IChatCollapsibleIODataPart } from '../../../../browser/widget/chatContentParts/chatToolInputOutputContentPart.js';
import '../../../../browser/widget/media/chat.css';

suite('ChatResourceGroupWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a79cAAAAASUVORK5CYII=';
	const resource = URI.file('/generated/image.png');
	let instantiationService: ReturnType<typeof workbenchInstantiationService>;
	let imageHovers: HTMLElement[];

	setup(() => {
		instantiationService = workbenchInstantiationService(undefined, store);
		imageHovers = [];
		instantiationService.stub(IHoverService, {
			...NullHoverService,
			setupDelayedHover: (target, hoverOptions) => {
				const options = typeof hoverOptions === 'function' ? hoverOptions() : hoverOptions;
				if (target.classList.contains('image-attachment') && dom.isHTMLElement(options.content)) {
					imageHovers.push(options.content);
				}
				return Disposable.None;
			},
		});
	});

	function render(parts: IChatCollapsibleIODataPart[], inline = true): ChatResourceGroupWidget {
		const widget = store.add(instantiationService.createInstance(ChatResourceGroupWidget, parts, inline ? { imagePresentation: 'inline', showImageInHover: false } : undefined));
		const container = dom.append(mainWindow.document.body, dom.$(inline ? '.chat-generated-image-result' : 'div'));
		container.appendChild(widget.domNode);
		store.add(toDisposable(() => container.remove()));
		return widget;
	}

	function deferImageRead() {
		const content = new DeferredPromise<VSBuffer>();
		const fileService = store.add(new class extends TestFileService {
			override async readFile(uri: URI) {
				const file = await super.readFile(uri);
				return { ...file, value: await content.p };
			}
		}());
		instantiationService.stub(IFileService, fileService);
		return { content, fileService };
	}

	function snapshot(widget: ChatResourceGroupWidget) {
		const attachment = widget.domNode.querySelector('.image-attachment');
		const image = attachment?.querySelector('img');
		return {
			images: widget.domNode.querySelectorAll('img.chat-attached-context-pill-image').length,
			filePills: widget.domNode.querySelectorAll('.chat-attached-context-attachment:not(.image-attachment)').length,
			warnings: widget.domNode.querySelectorAll('.codicon-warning, .codicon-warning-compact').length,
			busy: attachment?.getAttribute('aria-busy'),
			error: attachment?.classList.contains('image-load-error'),
			hasSource: !!image?.getAttribute('src'),
		};
	}

	test('inline images start loading synchronously without decoding a thumbnail', async () => {
		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 600;
		const base64Value = canvas.toDataURL('image/png').split(',')[1];
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png', base64Value }]);
		const initial = snapshot(widget);
		const image = widget.domNode.querySelector<HTMLImageElement>('img')!;
		await image.decode();
		await timeout(0);

		assert.deepStrictEqual({
			initial,
			final: snapshot(widget),
			dimensions: [image.naturalWidth, image.naturalHeight],
			hoverImages: imageHovers.flatMap(hover => [...hover.querySelectorAll('img')]).length,
			status: widget.domNode.querySelector('.chat-attached-context-image-status')?.textContent,
		}, {
			initial: { images: 1, filePills: 0, warnings: 0, busy: 'true', error: false, hasSource: true },
			final: { images: 1, filePills: 0, warnings: 0, busy: 'false', error: false, hasSource: true },
			dimensions: [1200, 600],
			hoverImages: 0,
			status: undefined,
		});
	});

	test('referenced images stay in a loading state and retain their image node when bytes arrive', async () => {
		const { content, fileService } = deferImageRead();
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png' }]);
		const initial = snapshot(widget);
		const image = widget.domNode.querySelector<HTMLImageElement>('img')!;
		const loadingBorder = mainWindow.getComputedStyle(widget.domNode.querySelector('.image-attachment')!).borderColor;
		await content.complete(decodeBase64(imageData));
		await retry(async () => assert.ok(image.complete && image.naturalWidth > 0), 10, 50);

		assert.deepStrictEqual({
			initial,
			loadingBorder,
			final: snapshot(widget),
			sameImage: widget.domNode.querySelector('img') === image,
			reads: fileService.readOperations.map(read => read.resource.toString()),
		}, {
			initial: { images: 1, filePills: 0, warnings: 0, busy: 'true', error: false, hasSource: false },
			loadingBorder: 'rgba(0, 0, 0, 0)',
			final: { images: 1, filePills: 0, warnings: 0, busy: 'false', error: false, hasSource: true },
			sameImage: true,
			reads: [resource.toString()],
		});
	});

	test('a slow referenced image does not delay embedded images in the same gallery', async () => {
		const { content } = deferImageRead();
		const widget = render([
			{ kind: 'data', uri: resource, mimeType: 'image/png' },
			{ kind: 'data', uri: URI.file('/generated/embedded.png'), mimeType: 'image/png', base64Value: imageData },
		]);
		const images = [...widget.domNode.querySelectorAll<HTMLImageElement>('img')];
		assert.strictEqual(images.length, 2);
		await images[1].decode();
		const beforeReferenceLoads = images.map(image => image.complete && image.naturalWidth > 0);
		await content.complete(decodeBase64(imageData));
		await retry(async () => assert.ok(images[0].complete && images[0].naturalWidth > 0), 10, 50);

		assert.deepStrictEqual({
			beforeReferenceLoads,
			sameImages: [...widget.domNode.querySelectorAll('img')].every((image, index) => image === images[index]),
		}, { beforeReferenceLoads: [false, true], sameImages: true });
	});

	test('a missing referenced image reports a genuine load failure with its details', async () => {
		const { content } = deferImageRead();
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png' }]);
		await content.error(new Error('The generated image file is unavailable.'));
		await timeout(0);

		assert.deepStrictEqual({
			state: snapshot(widget),
			label: widget.domNode.querySelector('.image-attachment')?.ariaLabel,
			status: widget.domNode.querySelector('.chat-attached-context-image-status')?.textContent,
			hover: imageHovers[0].textContent,
		}, {
			state: { images: 1, filePills: 0, warnings: 0, busy: 'false', error: true, hasSource: false },
			label: 'Unable to load image: image.png',
			status: 'Unable to load image: image.png',
			hover: 'Unable to load image: image.png\nThe generated image file is unavailable.',
		});
	});

	for (const base64Value of ['invalid!base64', 'aW1hZ2U=', '']) {
		test(`invalid inline image data shows a load error, not a file pill (${JSON.stringify(base64Value)})`, async () => {
			const warnings: string[] = [];
			instantiationService.stub(ILogService, new class extends NullLogService {
				override warn(message: string) { warnings.push(message); }
			}());
			const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png', base64Value }]);
			await retry(async () => assert.ok(widget.domNode.querySelector('.image-load-error')), 10, 50);

			assert.deepStrictEqual({
				filePills: snapshot(widget).filePills,
				busy: snapshot(widget).busy,
				status: widget.domNode.querySelector('.chat-attached-context-image-status')?.textContent,
				warnings,
			}, {
				filePills: 0,
				busy: 'false',
				status: 'Unable to load image: image.png',
				warnings: base64Value === 'invalid!base64' ? ['Unable to decode generated image'] : [],
			});
		});
	}

	test('disposing an inline image releases its object URL and load listeners', async () => {
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png', value: decodeBase64(imageData).buffer }]);
		const image = widget.domNode.querySelector<HTMLImageElement>('img')!;
		await image.decode();
		const url = image.src;
		assert.deepStrictEqual([...new Uint8Array(await (await fetch(url)).arrayBuffer())], [...decodeBase64(imageData).buffer]);
		widget.dispose();
		const disposedMarkup = widget.domNode.innerHTML;
		image.dispatchEvent(new Event('load'));
		image.dispatchEvent(new Event('error'));
		assert.strictEqual(widget.domNode.innerHTML, disposedMarkup);
		await assert.rejects(() => fetch(url), TypeError);
	});

	test('disposing during a referenced image read prevents late rendering', async () => {
		const { content } = deferImageRead();
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png' }]);
		widget.dispose();
		const disposedMarkup = widget.domNode.innerHTML;
		await content.complete(decodeBase64(imageData));
		await timeout(0);
		assert.strictEqual(widget.domNode.innerHTML, disposedMarkup);
	});

	test('ordinary tool resources keep their deferred attachment thumbnails', async () => {
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png', base64Value: imageData }], false);
		const initial = snapshot(widget);
		await retry(async () => {
			const image = widget.domNode.querySelector<HTMLImageElement>('img');
			assert.ok(image?.complete && image.naturalWidth > 0);
		}, 20, 50);

		assert.deepStrictEqual({
			initialFilePills: initial.filePills,
			initialImages: initial.images,
			finalImages: snapshot(widget).images,
			hoverImages: imageHovers.flatMap(hover => [...hover.querySelectorAll('img')]).length,
		}, { initialFilePills: 1, initialImages: 0, finalImages: 1, hoverImages: 1 });
	});
});
