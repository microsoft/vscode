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
import { ResourceMap } from '../../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { dirname } from '../../../../../../../base/common/resources.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { mock } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { IAccessibilityService } from '../../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { CommandsRegistry } from '../../../../../../../platform/commands/common/commands.js';
import { IFileDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { IHoverService } from '../../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../../platform/hover/test/browser/nullHoverService.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { TestFileService, workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { ChatResourceGroupWidget } from '../../../../browser/widget/chatContentParts/chatResourceGroupWidget.js';
import { getGeneratedImageResultParts } from '../../../../browser/widget/chatContentParts/toolInvocationParts/chatGeneratedImageResultSubPart.js';
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

	test('saving separate generated images uses hashed names without changing their resource URIs', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
		instantiationService.stub(IFileService, fileService);
		const destination = URI.from({ scheme: Schemas.inMemory, path: '/saved' });
		await fileService.createFolder(destination);
		const suggested: string[] = [];
		instantiationService.stub(IFileDialogService, new class extends mock<IFileDialogService>() {
			override async defaultFilePath() { return destination; }
			override async pickFileToSave(resource: URI) { suggested.push(resource.path); return resource; }
		}());
		const command = CommandsRegistry.getCommand('chat.toolOutput.save')!;
		for (const [index, toolCallId] of ['image-call-1', 'image-call-2'].entries()) {
			const uri = URI.from({ scheme: Schemas.inMemory, path: `/source-${index}/generated-image.png` });
			await fileService.createFolder(dirname(uri));
			await fileService.writeFile(uri, VSBuffer.fromString(`image-${index}`));
			const parts = getGeneratedImageResultParts({ input: '', output: [{ type: 'ref', uri, mimeType: 'image/png' }] }, URI.parse('agent-host://local/session'), toolCallId);
			await instantiationService.invokeFunction(accessor => command.handler(accessor, { parts }));
		}
		const saved = await fileService.resolve(destination);
		const contents = await Promise.all((saved.children ?? []).map(async file => ({
			name: file.name,
			value: (await fileService.readFile(file.resource)).value.toString(),
		})));
		assert.deepStrictEqual({ suggested, contents: contents.sort((a, b) => a.name.localeCompare(b.name)) }, {
			suggested: ['/saved/generated-image-3c41e71d9ac9.png', '/saved/generated-image-dc4b1335ceec.png'],
			contents: [
				{ name: 'generated-image-3c41e71d9ac9.png', value: 'image-0' },
				{ name: 'generated-image-dc4b1335ceec.png', value: 'image-1' },
			],
		});
	});

	for (const { names, savedNames, caseSensitive = true } of [
		{ names: ['image.png', 'image.png'], savedNames: ['image.png', 'image-2.png'] },
		{ names: ['image.png', 'image.png', 'image-2.png'], savedNames: ['image.png', 'image-3.png', 'image-2.png'] },
		{ names: ['image', 'image'], savedNames: ['image', 'image-2'] },
		{ names: ['IMAGE.PNG', 'image.png'], savedNames: ['IMAGE.PNG', 'image.png'], caseSensitive: true },
		{ names: ['IMAGE.PNG', 'image.png'], savedNames: ['IMAGE.PNG', 'image-2.png'], caseSensitive: false },
	]) {
		test(`saving a gallery preserves every resource with duplicate names (${names.join(', ')}, caseSensitive=${caseSensitive})`, async () => {
			const fileService = store.add(new FileService(new NullLogService()));
			store.add(fileService.registerProvider(Schemas.inMemory, store.add(new class extends InMemoryFileSystemProvider {
				override get capabilities() {
					return caseSensitive ? super.capabilities : super.capabilities & ~FileSystemProviderCapabilities.PathCaseSensitive;
				}
			}())));
			instantiationService.stub(IFileService, fileService);
			const destination = URI.from({ scheme: Schemas.inMemory, path: '/saved' });
			await fileService.createFolder(destination);
			instantiationService.stub(IFileDialogService, new class extends mock<IFileDialogService>() {
				override async defaultFilePath() { return destination; }
				override async showOpenDialog() { return [destination]; }
			}());
			const parts: IChatCollapsibleIODataPart[] = [];
			for (const [index, name] of names.entries()) {
				const uri = URI.from({ scheme: Schemas.inMemory, path: `/source-${index}/${name}` });
				await fileService.createFolder(dirname(uri));
				await fileService.writeFile(uri, VSBuffer.fromString(`image-${index}`));
				parts.push({ kind: 'data', uri, mimeType: 'image/png' });
			}
			const command = CommandsRegistry.getCommand('chat.toolOutput.save');
			assert.ok(command);
			await instantiationService.invokeFunction(accessor => command.handler(accessor, { parts }));
			const saved = await fileService.resolve(destination);
			const contents = await Promise.all((saved.children ?? []).map(async file => ({
				name: file.name,
				value: (await fileService.readFile(file.resource)).value.toString(),
			})));
			assert.deepStrictEqual(contents.sort((a, b) => a.name.localeCompare(b.name)), savedNames.map((name, index) => ({
				name,
				value: `image-${index}`,
			})).sort((a, b) => a.name.localeCompare(b.name)));
		});
	}

	function render(parts: IChatCollapsibleIODataPart[], inline = true, animateImageReveal = false, imageDimensions?: ResourceMap<dom.IDimension>): ChatResourceGroupWidget {
		const host = dom.append(mainWindow.document.body, dom.$(animateImageReveal ? '.chat-image-generation-single' : 'div'));
		const container = dom.append(host, dom.$(inline ? '.chat-generated-image-result' : 'div'));
		const imageReveal = animateImageReveal ? { container: host } : undefined;
		const widget = store.add(instantiationService.createInstance(ChatResourceGroupWidget, parts, inline ? { imagePresentation: 'inline', showImageInHover: false, imageReveal, imageDimensions } : undefined));
		container.appendChild(widget.domNode);
		store.add(toDisposable(() => host.remove()));
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

	test('inline base64 images use the browser decoder without creating a JavaScript byte copy', async () => {
		const canvas = mainWindow.document.createElement('canvas');
		canvas.width = 1200;
		canvas.height = 600;
		const base64Value = canvas.toDataURL('image/png').split(',')[1];
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png', base64Value }]);
		const initial = snapshot(widget);
		const image = widget.domNode.querySelector<HTMLImageElement>('img')!;
		await image.decode();
		await retry(async () => assert.strictEqual(snapshot(widget).busy, 'false'), 10, 50);

		assert.deepStrictEqual({
			initial,
			browserSource: image.src === `data:image/png;base64,${base64Value}`,
			final: snapshot(widget),
			dimensions: [image.naturalWidth, image.naturalHeight],
			hoverImages: imageHovers.flatMap(hover => [...hover.querySelectorAll('img')]).length,
			status: widget.domNode.querySelector('.chat-attached-context-image-status')?.textContent,
		}, {
			initial: { images: 1, filePills: 0, warnings: 0, busy: 'true', error: false, hasSource: true },
			browserSource: true,
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
		// WebKit can finish decoding before the load handler updates the widget.
		await retry(async () => assert.ok(image.complete && image.naturalWidth > 0 && snapshot(widget).busy === 'false'), 10, 50);

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

	for (const [width, height] of [[800, 1600], [1600, 800]]) {
		test(`known image dimensions reserve responsive space until a ${width}x${height} image reloads`, async () => {
			const canvas = dom.$<HTMLCanvasElement>('canvas', { width, height });
			const base64Value = canvas.toDataURL('image/png').split(',')[1];
			const imageDimensions = new ResourceMap<dom.IDimension>();
			const first = render([{ kind: 'data', uri: resource, mimeType: 'image/png', base64Value }], true, false, imageDimensions);
			const firstImage = first.domNode.querySelector<HTMLImageElement>('img')!;
			await retry(async () => assert.ok(firstImage.complete && snapshot(first).busy === 'false'), 20, 50);
			first.dispose();

			const { content } = deferImageRead();
			const next = render([{ kind: 'data', uri: resource, mimeType: 'image/png' }], true, false, imageDimensions);
			const host = next.domNode.parentElement!;
			const image = next.domNode.querySelector<HTMLImageElement>('img')!;
			const bounds = () => {
				const rect = image.getBoundingClientRect();
				return [rect.width, rect.height];
			};
			host.style.width = '400px';
			const wide = bounds();
			host.style.width = '120px';
			const narrow = bounds();
			const pending = {
				reserved: narrow[0] > 0 && narrow[1] > 0,
				resized: narrow[0] < wide[0] && narrow[1] < wide[1],
				visibility: mainWindow.getComputedStyle(image).visibility,
				status: mainWindow.getComputedStyle(next.domNode.querySelector('.chat-attached-context-image-status')!).display,
				busy: snapshot(next).busy,
			};
			await content.complete(decodeBase64(base64Value));
			await retry(async () => assert.ok(image.complete && snapshot(next).busy === 'false'), 20, 50);
			assert.deepStrictEqual({
				pending,
				stableDimensions: bounds().every((value, index) => Math.abs(value - narrow[index]) <= 1),
				naturalDimensions: imageDimensions.get(resource),
				visibility: mainWindow.getComputedStyle(image).visibility,
				sizeHintCleared: image.style.width === '' && image.style.maxWidth === '' && image.style.aspectRatio === '',
			}, {
				pending: { reserved: true, resized: true, visibility: 'hidden', status: 'none', busy: 'true' },
				stableDimensions: true,
				naturalDimensions: { width, height },
				visibility: 'visible',
				sizeHintCleared: true,
			});
		});
	}

	test('a failed image reload clears remembered dimensions and shows its error', async () => {
		const imageDimensions = new ResourceMap<dom.IDimension>([[resource, { width: 800, height: 1200 }]]);
		const { content } = deferImageRead();
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png' }], true, false, imageDimensions);
		await content.error(new Error('The image is no longer available.'));
		await retry(async () => assert.strictEqual(snapshot(widget).error, true), 10, 50);
		const image = widget.domNode.querySelector<HTMLImageElement>('img')!;
		const status = widget.domNode.querySelector<HTMLElement>('.chat-attached-context-image-status')!;
		assert.deepStrictEqual({
			cached: imageDimensions.has(resource),
			sizeHintCleared: image.style.width === '' && image.style.maxWidth === '' && image.style.aspectRatio === '',
			visibleError: !!status.textContent && mainWindow.getComputedStyle(status).display !== 'none',
			hiddenImage: mainWindow.getComputedStyle(image).display === 'none',
		}, { cached: false, sizeHintCleared: true, visibleError: true, hiddenImage: true });
	});

	test('a changed referenced image replaces its remembered natural dimensions', async () => {
		const imageDimensions = new ResourceMap<dom.IDimension>([[resource, { width: 800, height: 1200 }]]);
		const { content } = deferImageRead();
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png' }], true, false, imageDimensions);
		await content.complete(decodeBase64(imageData));
		await retry(async () => assert.strictEqual(snapshot(widget).busy, 'false'), 20, 50);
		assert.deepStrictEqual(imageDimensions.get(resource), { width: 1, height: 1 });
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

	test('the glyph band stays pending until referenced image bytes load', async () => {
		const { content } = deferImageRead();
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png' }], true, true);
		const container = widget.domNode.parentElement!;
		container.classList.add('interactive-session');
		container.style.setProperty('--vscode-strokeThickness', '1px');
		const reveal = widget.domNode.querySelector('.chat-image-reveal')!;
		const image = reveal.querySelector<HTMLImageElement>('img')!;
		const initial = { pending: reveal.classList.contains('pending'), busy: snapshot(widget).busy, hasSource: !!image.getAttribute('src'), width: reveal.getBoundingClientRect().width };
		await content.complete(decodeBase64(imageData));
		await retry(async () => assert.ok(image.complete && image.naturalWidth > 0 && snapshot(widget).busy === 'false'), 10, 50);

		assert.deepStrictEqual({
			initial,
			loaded: { pending: reveal.classList.contains('pending'), busy: snapshot(widget).busy, sameImage: reveal.querySelector('img') === image },
		}, {
			initial: { pending: true, busy: 'true', hasSource: false, width: 320 },
			loaded: { pending: false, busy: 'false', sameImage: true },
		});
	});

	for (const width of [320, 760]) {
		test(`the glyph band stays painted while image bytes load and the reveal expands in a ${width}px container`, async () => {
			instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
				override isMotionReduced(): boolean { return false; }
			}());
			const { content } = deferImageRead();
			const imageDimensions = new ResourceMap<dom.IDimension>([[resource, { width: 400, height: 240 }]]);
			const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png' }], true, true, imageDimensions);
			const host = widget.domNode.parentElement!.parentElement!;
			host.style.width = `${width}px`;
			const reveal = widget.domNode.querySelector<HTMLElement>('.chat-image-reveal')!;
			const field = reveal.querySelector<HTMLCanvasElement>('.chat-image-loading-glyphs')!;
			const frame = () => new Promise<void>(resolve => store.add(dom.scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
			const bandState = () => {
				const bounds = reveal.getBoundingClientRect();
				const visible = bounds.width > 0 && bounds.width <= width && bounds.height > 0;
				let painted = false;
				if (visible && field.clientWidth && field.clientHeight) {
					const paintWidth = Math.min(field.width, Math.ceil(bounds.width * field.width / field.clientWidth));
					const paintHeight = Math.min(field.height, Math.ceil(bounds.height * field.height / field.clientHeight));
					const pixels = field.getContext('2d')!.getImageData(0, 0, paintWidth, paintHeight).data;
					painted = pixels.some((value, index) => index % 4 === 3 && value > 0);
				}
				return { visible, painted };
			};
			await frame();
			await frame();
			const waiting = bandState();
			const waitingHeight = reveal.getBoundingClientRect().height;
			const canvas = dom.$<HTMLCanvasElement>('canvas', { width: 400, height: 240 });
			const context = canvas.getContext('2d')!;
			context.fillStyle = '#4682b4';
			context.fillRect(0, 0, canvas.width, canvas.height);
			await content.complete(decodeBase64(canvas.toDataURL('image/png').split(',')[1]));
			await retry(async () => assert.ok(reveal.classList.contains('revealing')), 20, 50);
			const clock = field.getAnimations()[0];
			assert.ok(clock);
			clock.pause();
			const states = [];
			for (const fraction of [0, 0.05, 0.2, 0.5]) {
				clock.currentTime = Number(clock.effect?.getTiming().duration) * fraction;
				await frame();
				states.push(bandState());
			}
			assert.deepStrictEqual({
				waiting,
				waitingHeight,
				sameField: reveal.querySelector('.chat-image-loading-glyphs') === field,
				expansion: states,
			}, {
				waiting: { visible: true, painted: true },
				waitingHeight: 50,
				sameField: true,
				expansion: Array.from({ length: 4 }, () => ({ visible: true, painted: true })),
			});
		});
	}

	test('an image read failure removes the glyph band and keeps the error visible', async () => {
		const { content } = deferImageRead();
		const widget = render([{ kind: 'data', uri: resource, mimeType: 'image/png' }], true, true);
		await content.error(new Error('The generated image file is unavailable.'));
		await retry(async () => assert.strictEqual(snapshot(widget).error, true), 10, 50);
		const status = widget.domNode.querySelector<HTMLElement>('.chat-attached-context-image-status')!;

		assert.deepStrictEqual({
			error: snapshot(widget).error,
			pending: widget.domNode.querySelectorAll('.chat-image-reveal.pending, .chat-image-generation-line').length,
			effects: widget.domNode.querySelectorAll('.chat-image-loading-glyphs').length,
			visibleError: !!status.textContent && mainWindow.getComputedStyle(status).display !== 'none',
		}, { error: true, pending: 0, effects: 0, visibleError: true });
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
				warnings: [],
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
