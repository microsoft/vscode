/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { timeout } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IAccessibilityService } from '../../../../../../platform/accessibility/common/accessibility.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ColorScheme } from '../../../../../../platform/theme/common/theme.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestColorTheme } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { getGlyphMessageBit, GlyphSurface } from '../../../browser/attachments/chatImageGlyphSurface.js';
import { ChatImageReveal } from '../../../browser/attachments/chatImageReveal.js';
import { ImageSamples, ITextureFrame, RevealPace } from '../../../browser/attachments/chatImageTextures.js';

function halves(left: string, right: string): string {
	const canvas = dom.$<HTMLCanvasElement>('canvas', { width: 400, height: 240 });
	const context = canvas.getContext('2d')!;
	context.fillStyle = left;
	context.fillRect(0, 0, 200, 240);
	context.fillStyle = right;
	context.fillRect(200, 0, 200, 240);
	return canvas.toDataURL('image/png');
}

suite('ChatImageReveal', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let reducedMotion: boolean;
	let motionChanged: Emitter<void>;

	setup(() => {
		reducedMotion = false;
		motionChanged = store.add(new Emitter<void>());
	});

	async function render(theme = ColorScheme.DARK, width = 400, height = 240) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
			override onDidChangeReducedMotion = motionChanged.event;
			override isMotionReduced() { return reducedMotion; }
		}());
		instantiationService.stub(IThemeService, {
			getColorTheme: () => new TestColorTheme({}, theme),
			onDidColorThemeChange: Event.None,
		});
		const image = dom.$<HTMLImageElement>('img', { src: halves('#000', '#fff') });
		image.style.width = `${width}px`;
		image.style.height = `${height}px`;
		const host = dom.append(mainWindow.document.body, dom.$('div'));
		host.style.width = '760px';
		const container = dom.append(host, dom.$('div', undefined, image));
		store.add(toDisposable(() => host.remove()));
		const reveal = store.add(instantiationService.createInstance(ChatImageReveal, container, image, { container: host }));
		await image.decode();
		return { container, image, reveal, host, instantiationService };
	}

	function snapshot(container: HTMLElement, image: HTMLImageElement) {
		return {
			pending: container.classList.contains('pending'),
			revealing: container.classList.contains('revealing'),
			effects: container.querySelectorAll('canvas').length,
			imageOpacity: mainWindow.getComputedStyle(image).opacity,
		};
	}

	function seek(container: HTMLElement, fraction: number) {
		for (const animation of container.getAnimations({ subtree: true })) {
			animation.pause();
			animation.currentTime = Number(animation.effect?.getTiming().duration) * fraction;
		}
	}

	function nextFrame() {
		return new Promise<void>(resolve => store.add(dom.scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
	}

	async function seekVirtualTime(container: HTMLElement, pace: RevealPace, virtualTime: number): Promise<void> {
		let low = 0, high = pace.duration;
		for (let iteration = 0; iteration < 40; iteration++) {
			const middle = (low + high) / 2;
			if (pace.virtualAt(middle) < virtualTime) {
				low = middle;
			} else {
				high = middle;
			}
		}
		seek(container, (low + high) / 2 / pace.duration);
		await nextFrame();
	}

	test('the loading glyph band has a fixed width and remains painted until the image is ready', async () => {
		const { container, image } = await render();
		await nextFrame();
		await nextFrame();
		const field = container.querySelector<HTMLCanvasElement>('.chat-image-loading-glyphs')!;
		const pixels = field.getContext('2d')!.getImageData(0, 0, field.width, field.height).data;
		assert.deepStrictEqual({
			state: snapshot(container, image),
			size: [container.getBoundingClientRect().width, container.getBoundingClientRect().height],
			painted: pixels.some((value, index) => index % 4 === 3 && value > 0),
		}, {
			state: { pending: true, revealing: false, effects: 1, imageOpacity: '0' },
			size: [320, 50],
			painted: true,
		});
	});

	for (const [width, height] of [[200, 240], [400, 240], [200, 30]]) {
		test(`the default reveal immediately resizes to a ${width}x${height} image and yields to its original pixels`, async () => {
			const { container, image, reveal, host } = await render(ColorScheme.DARK, width, height);
			reveal.reveal();
			const field = container.querySelector<HTMLCanvasElement>('.chat-image-loading-glyphs')!;
			const duration = Number(container.getAnimations({ subtree: true })[0].effect?.getTiming().duration);
			const at = async (fraction: number) => {
				seek(container, fraction);
				await nextFrame();
				const bounds = container.getBoundingClientRect();
				return { width: bounds.width, height: bounds.height, image: Number(mainWindow.getComputedStyle(image).opacity), texture: Number(field.style.opacity) };
			};
			const start = await at(0);
			const early = await at(100 / duration);
			const middle = await at(0.5);
			const end = await at(1);
			reveal.dispose();
			assert.deepStrictEqual({
				start,
				resizingWithin100ms: early.width !== start.width && early.height !== start.height && early.image === 0 && early.texture === 1,
				middle,
				end,
				finished: snapshot(container, image),
				originClean: !host.classList.contains('chat-image-reveal-running') && !host.classList.contains('chat-image-reveal-pending'),
			}, {
				start: { width: 320, height: 50, image: 0, texture: 1 },
				resizingWithin100ms: true,
				middle: { width, height, image: 0, texture: 1 },
				end: { width, height, image: 1, texture: 0 },
				finished: { pending: false, revealing: false, effects: 0, imageOpacity: '1' },
				originClean: true,
			});
		});
	}

	for (const [width, height, loadingTime] of [[200, 240, 0], [400, 240, 1600], [319, 240, 2400], [320, 240, 3199], [321, 240, 3199], [200, 30, 1200]]) {
		test(`skips the loading sweep and resizes continuously (${width}x${height}, phase=${loadingTime})`, async () => {
			const { container, image, reveal, instantiationService } = await render(ColorScheme.DARK, width, height);
			reveal.dispose();
			container.style.width = '320px';
			container.style.height = '50px';
			const surface = store.add(instantiationService.createInstance(GlyphSurface, container));
			const timing = surface.getRevealTiming(320, loadingTime);
			const samples = ImageSamples.create(image, width, height, false);
			assert.ok(samples);
			let frame: ITextureFrame | undefined;
			surface.reveal({
				image, samples, fromWidth: 320, fromHeight: 50, timing,
				duration: timing.pace.duration,
				onFrame: value => frame = value,
			});
			const at = async (virtualTime: number) => {
				await seekVirtualTime(container, timing.pace, virtualTime);
				assert.ok(frame);
				return frame;
			};
			const resizeStart = await at(timing.loadingEnd);
			const readBand = () => surface.canvas.getContext('2d')!.getImageData(0, 0, surface.canvas.width, Math.round(50 * mainWindow.devicePixelRatio)).data;
			const settledBand = width === 320 ? readBand() : undefined;
			const resizeFrames: ITextureFrame[] = [];
			for (const elapsed of [1, 225, 450, 675, 899, 900]) {
				resizeFrames.push(await at(timing.loadingEnd + elapsed));
			}
			const progress = (value: number, from: number, to: number) => from === to ? 0 : (value - from) / (to - from);
			const synchronized = resizeFrames.every(frame => width === 320 ? frame.width === 320 : Math.abs(progress(frame.width, 320, width) - progress(frame.height, 50, height)) < 0.000001);
			const monotonic = resizeFrames.every((frame, index) => {
				const previous = index ? resizeFrames[index - 1] : resizeStart;
				return progress(frame.width, 320, width) >= progress(previous.width, 320, width)
					&& progress(frame.height, 50, height) >= progress(previous.height, 50, height)
					&& progress(frame.width, 320, width) <= 1
					&& progress(frame.height, 50, height) <= 1;
			});
			const near = (actual: ITextureFrame, expectedWidth: number, expectedHeight: number) => Math.abs(actual.width - expectedWidth) < 0.01 && Math.abs(actual.height - expectedHeight) < 0.01;
			const resizedBand = settledBand ? readBand() : undefined;
			assert.deepStrictEqual({
				sweepSkipped: timing.loadingEnd > 0 && timing.pace.virtualAt(0) === timing.loadingEnd,
				initialSize: near(resizeStart, 320, 50),
				smoothStart: near(resizeFrames[0], 320, 50),
				halfway: near(resizeFrames[2], (320 + width) / 2, (50 + height) / 2),
				smoothEnd: near(resizeFrames[4], width, height) && near(resizeFrames[5], width, height),
				synchronized,
				monotonic,
				imageWaitsForResize: resizeFrames.every(frame => frame.imageOpacity === 0 && frame.textureOpacity === 1),
				loadingDoesNotRestart: !settledBand || settledBand.every((value, index) => value === resizedBand![index]),
			}, {
				sweepSkipped: true, initialSize: true, smoothStart: true, halfway: true,
				smoothEnd: true, synchronized: true, monotonic: true, imageWaitsForResize: true, loadingDoesNotRestart: true,
			});
		});
	}

	test('the final frame preserves fractional CSS dimensions exactly', async () => {
		const { container, image, reveal } = await render(ColorScheme.DARK, 400.25, 240.5);
		reveal.reveal();
		seek(container, 1);
		await nextFrame();
		const bounds = () => {
			const frame = container.getBoundingClientRect();
			const imageBounds = image.getBoundingClientRect();
			return [frame.width, frame.height, imageBounds.width, imageBounds.height];
		};
		const before = bounds();
		reveal.dispose();
		assert.deepStrictEqual({ before, after: bounds() }, { before: [400.25, 240.5, 400.25, 240.5], after: [400.25, 240.5, 400.25, 240.5] });
	});

	test('the reveal starts at twice its final speed and reaches the exact endpoint', () => {
		const pace = new RevealPace(4500);
		assert.deepStrictEqual({
			start: pace.virtualAt(0),
			startSpeed: Math.round(pace.virtualAt(1)),
			endSpeed: Math.round(4500 - pace.virtualAt(pace.duration - 1)),
			end: pace.virtualAt(pace.duration),
			boundedDuration: pace.duration > 2250 && pace.duration < 4500,
		}, { start: 0, startSpeed: 2, endSpeed: 1, end: 4500, boundedDuration: true });
	});

	test('omitting a timeline prefix preserves the exact pace of every remaining stage', () => {
		const current = new RevealPace(6400);
		assert.deepStrictEqual([0, 1600, 3200, 6400].map(startAt => {
			const pace = new RevealPace(6400, startAt);
			const skippedDuration = current.duration - pace.duration;
			return {
				start: pace.virtualAt(0),
				end: pace.virtualAt(pace.duration),
				stagesPreserved: [0, 0.25, 0.5, 0.75, 1].every(progress =>
					Math.abs(pace.virtualAt(pace.duration * progress) - current.virtualAt(skippedDuration + pace.duration * progress)) < 0.000001),
			};
		}), [
			{ start: 0, end: 6400, stagesPreserved: true },
			{ start: 1600, end: 6400, stagesPreserved: true },
			{ start: 3200, end: 6400, stagesPreserved: true },
			{ start: 6400, end: 6400, stagesPreserved: true },
		]);
	});

	test('invalid timeline starts fail explicitly', () => {
		for (const start of [-1, 4501, Infinity, NaN]) {
			assert.throws(() => new RevealPace(4500, start), RangeError);
		}
	});

	test('the default skips the first wipe at 1x while preserving the later reveal timing', async () => {
		const { container, image, reveal, instantiationService } = await render();
		reveal.dispose();
		container.style.width = '320px';
		container.style.height = '50px';
		const surface = store.add(instantiationService.createInstance(GlyphSurface, container));
		const timing = surface.getRevealTiming(320, 1600);
		const previous = new RevealPace(timing.loadingEnd + 4500);
		const samples = ImageSamples.create(image, 400, 240, false);
		assert.ok(samples);
		let frame: ITextureFrame | undefined;
		surface.reveal({
			image, samples, fromWidth: 320, fromHeight: 50, timing,
			duration: timing.pace.duration,
			onFrame: value => frame = value,
		});
		const frames: ITextureFrame[] = [];
		for (const opening of [0, 450, 900, 4000, 4500]) {
			await seekVirtualTime(container, timing.pace, timing.loadingEnd + opening);
			assert.ok(frame);
			frames.push({
				width: Math.round(frame.width), height: Math.round(frame.height),
				imageOpacity: Math.round(frame.imageOpacity), textureOpacity: Math.round(frame.textureOpacity),
			});
		}
		assert.deepStrictEqual({
			startsAtExpansion: timing.pace.virtualAt(0) === timing.loadingEnd && timing.loadingEnd > 0,
			shorter: timing.pace.duration < previous.duration,
			laterTimelinePreserved: timing.pace.length === previous.length,
			frames,
		}, {
			startsAtExpansion: true,
			shorter: true,
			laterTimelinePreserved: true,
			frames: [
				{ width: 320, height: 50, imageOpacity: 0, textureOpacity: 1 },
				{ width: 360, height: 145, imageOpacity: 0, textureOpacity: 1 },
				{ width: 400, height: 240, imageOpacity: 0, textureOpacity: 1 },
				{ width: 400, height: 240, imageOpacity: 0, textureOpacity: 1 },
				{ width: 400, height: 240, imageOpacity: 1, textureOpacity: 0 },
			],
		});
	});

	test('time spent handling the image load does not extend the reveal deadline', async () => {
		const { container, image, reveal } = await render();
		const fresh = await render();
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const loadedAt = mainWindow.performance.now();
			await timeout(100);
			fresh.reveal.reveal();
			reveal.reveal(loadedAt);
			const duration = Number(container.getAnimations({ subtree: true })[0].effect?.getTiming().duration);
			const freshDuration = Number(fresh.container.getAnimations({ subtree: true })[0].effect?.getTiming().duration);
			await timeout(duration - 1);
			const beforeDeadline = container.classList.contains('revealing');
			await timeout(2);
			assert.deepStrictEqual({ shortenedBy: Math.round(freshDuration - duration), beforeDeadline, finished: snapshot(container, image) }, {
				shortenedBy: 100,
				beforeDeadline: true,
				finished: { pending: false, revealing: false, effects: 0, imageOpacity: '1' },
			});
		});
	});

	test('an expired load deadline shows the image immediately', async () => {
		const { container, image, reveal } = await render();
		reveal.reveal(mainWindow.performance.now() - 10000);
		assert.deepStrictEqual(snapshot(container, image), { pending: false, revealing: false, effects: 0, imageOpacity: '1' });
	});

	for (const columns of [7, 24, 28, 31, 32, 51, 64]) {
		test(`glyph digits wrap happy_coding! continuously across ${columns}-column rows`, () => {
			const greeting = 'happy_coding!'.repeat(4);
			let text = '';
			for (let index = 0; index < greeting.length * 8; index += 8) {
				let code = 0;
				for (let bit = 0; bit < 8; bit++) {
					const position = index + bit;
					code = code * 2 + getGlyphMessageBit(position % columns, Math.floor(position / columns), columns);
				}
				text += String.fromCharCode(code);
			}
			assert.strictEqual(text, greeting);
		});
	}

	test('the standard loading band starts with the greeting in reading order', () => {
		const rows = Array.from({ length: 5 }, (_, row) => {
			let text = '';
			for (let column = 0; column < 32; column += 8) {
				const bits = Array.from({ length: 8 }, (_, bit) => getGlyphMessageBit(column + bit, row, 32)).join('');
				text += String.fromCharCode(parseInt(bits, 2));
			}
			return text;
		});
		assert.deepStrictEqual(rows, ['happ', 'y_co', 'ding', '!hap', 'py_c']);
	});

	test('the palette holds the colors of the image', async () => {
		const image = dom.$<HTMLImageElement>('img', { src: halves('#ff0000', '#0000ff') });
		await image.decode();
		const palette = ImageSamples.create(image, 400, 240, false)!.palette;
		const colors = new Set<string>();
		for (let color = 0; color < palette.length; color += 3) {
			colors.add([palette[color], palette[color + 1], palette[color + 2]].map(Math.round).join(','));
		}
		assert.deepStrictEqual([...colors].sort(), ['0,0,255', '255,0,0']);
	});

	for (const theme of [ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT]) {
		test(`${theme} shows the loaded image without decorative effects`, async () => {
			const { container, image, reveal } = await render(theme);
			reveal.reveal();
			assert.deepStrictEqual(snapshot(container, image), { pending: false, revealing: false, effects: 0, imageOpacity: '1' });
		});
	}

	test('reduced motion skips the reveal without hiding the loaded image', async () => {
		reducedMotion = true;
		const { container, image, reveal } = await render();
		reveal.reveal();
		assert.deepStrictEqual(snapshot(container, image), { pending: false, revealing: false, effects: 0, imageOpacity: '1' });
	});

	test('changing reduced motion during a reveal finishes immediately', async () => {
		const { container, image, reveal } = await render();
		reveal.reveal();
		reducedMotion = true;
		motionChanged.fire();
		assert.deepStrictEqual(snapshot(container, image), { pending: false, revealing: false, effects: 0, imageOpacity: '1' });
	});

	test('disposing during a reveal removes its canvas and cancels completion', async () => {
		const { container, image, reveal } = await render();
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			reveal.reveal();
			const canvas = container.querySelector<HTMLCanvasElement>('canvas')!;
			reveal.dispose();
			const disposed = snapshot(container, image);
			await timeout(10000);
			assert.deepStrictEqual({ disposed, later: snapshot(container, image), canvasSize: [canvas.width, canvas.height] }, {
				disposed: { pending: false, revealing: false, effects: 0, imageOpacity: '1' },
				later: { pending: false, revealing: false, effects: 0, imageOpacity: '1' },
				canvasSize: [0, 0],
			});
		});
	});
});
