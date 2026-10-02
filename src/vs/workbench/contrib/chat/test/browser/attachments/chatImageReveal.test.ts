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
import { getGlyphMessageBit } from '../../../browser/attachments/chatImageGlyphSurface.js';
import { ChatImageReveal } from '../../../browser/attachments/chatImageReveal.js';
import { ImageSamples, RevealPace } from '../../../browser/attachments/chatImageTextures.js';

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
		return { container, image, reveal, host };
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

	for (const width of [200, 400]) {
		test(`the band changes width before opening into a ${width}px image and yields to the original pixels`, async () => {
			const { container, image, reveal, host } = await render(ColorScheme.DARK, width);
			reveal.reveal();
			const field = container.querySelector<HTMLCanvasElement>('.chat-image-loading-glyphs')!;
			const at = async (fraction: number) => {
				seek(container, fraction);
				await nextFrame();
				const bounds = container.getBoundingClientRect();
				return { width: bounds.width, height: bounds.height, image: Number(mainWindow.getComputedStyle(image).opacity), texture: Number(field.style.opacity) };
			};
			const start = await at(0);
			const widening = await at(0.05);
			const middle = await at(0.5);
			const end = await at(1);
			reveal.dispose();
			assert.deepStrictEqual({
				start,
				resizesBeforeOpening: widening.height === 50 && widening.width > Math.min(width, 320) && widening.width < Math.max(width, 320),
				middle,
				end,
				finished: snapshot(container, image),
				originClean: !host.classList.contains('chat-image-reveal-running') && !host.classList.contains('chat-image-reveal-pending'),
			}, {
				start: { width: 320, height: 50, image: 0, texture: 1 },
				resizesBeforeOpening: true,
				middle: { width, height: 240, image: 0, texture: 1 },
				end: { width, height: 240, image: 1, texture: 0 },
				finished: { pending: false, revealing: false, effects: 0, imageOpacity: '1' },
				originClean: true,
			});
		});
	}

	test('a band already matching the image width opens directly to its height', async () => {
		const { container, reveal } = await render(ColorScheme.DARK, 320);
		reveal.reveal();
		seek(container, 0.05);
		await nextFrame();
		const bounds = container.getBoundingClientRect();
		assert.deepStrictEqual({ width: bounds.width, opening: bounds.height > 50 && bounds.height < 240 }, { width: 320, opening: true });
	});

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

	test('time spent handling the image load does not extend the reveal deadline', async () => {
		const { container, image, reveal } = await render();
		await runWithFakedTimers({ useFakeTimers: true }, async () => {
			const duration = new RevealPace(4960).duration;
			const loadedAt = mainWindow.performance.now();
			await timeout(100);
			reveal.reveal(loadedAt);
			await timeout(duration - 101);
			const beforeDeadline = container.classList.contains('revealing');
			await timeout(2);
			assert.deepStrictEqual({ beforeDeadline, finished: snapshot(container, image) }, {
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

	test('every row of glyph digits spells the greeting as 8-bit ASCII from its left edge', () => {
		const greeting = 'HAPPY_CODING!'.repeat(6);
		const rows = Array.from({ length: 8 }, (_, row) => {
			let text = '';
			for (let column = 0; column < 64; column += 8) {
				let code = 0;
				for (let bit = 0; bit < 8; bit++) {
					code = code * 2 + getGlyphMessageBit(column + bit, row);
				}
				text += String.fromCharCode(code);
			}
			return greeting.includes(text) ? 'greeting' : text;
		});
		assert.deepStrictEqual(rows, Array(8).fill('greeting'));
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
