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

const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a79cAAAAASUVORK5CYII=';

/** Paints an image of the reveal's size whose left half is `left` and right half is `right`. */
function halves(left: string, right: string): string {
	const canvas = mainWindow.document.createElement('canvas');
	canvas.width = 400;
	canvas.height = 240;
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

	function render(theme = ColorScheme.DARK, withOrigin = false, treatment = 'blue-scan', loading = 'comet', src = pixel) {
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IAccessibilityService, new class extends TestAccessibilityService {
			override onDidChangeReducedMotion = motionChanged.event;
			override isMotionReduced() { return reducedMotion; }
		}());
		instantiationService.stub(IThemeService, {
			getColorTheme: () => new TestColorTheme({}, theme),
			onDidColorThemeChange: Event.None,
		});
		const image = dom.$<HTMLImageElement>('img', { width: 400, height: 240, src });
		const host = dom.append(mainWindow.document.body, dom.$('div'));
		host.style.width = '760px';
		host.classList.add(`chat-image-reveal-variant-${treatment}`, `chat-image-line-variant-${loading}`);
		const container = dom.append(host, dom.$('div', undefined, image));
		const header = dom.append(host, dom.$('.chat-confirmation-widget-title'));
		header.style.height = withOrigin ? '40px' : '0';
		container.style.setProperty('--vscode-strokeThickness', '1px');
		container.style.setProperty('--vscode-cornerRadius-large', '8px');
		store.add(toDisposable(() => host.remove()));
		const origin = withOrigin ? { container: host } : undefined;
		const reveal = store.add(instantiationService.createInstance(ChatImageReveal, container, image, origin));
		return { container, image, reveal, host, header };
	}

	function snapshot(container: HTMLElement, image: HTMLImageElement) {
		const style = mainWindow.getComputedStyle(image);
		return {
			pending: container.classList.contains('pending'),
			revealing: container.classList.contains('revealing'),
			effects: container.querySelectorAll('.chat-image-reveal-trace, .chat-image-reveal-blur, .chat-image-reveal-scan, canvas').length,
			imageOpacity: style.opacity,
			imageClip: style.clipPath,
			imageFilter: style.filter,
		};
	}

	function seek(container: HTMLElement, time: number) {
		for (const animation of container.getAnimations({ subtree: true })) {
			animation.pause();
			animation.currentTime = time;
		}
	}

	function nextFrame() {
		return new Promise<void>(resolve => store.add(dom.scheduleAtNextAnimationFrame(mainWindow, () => resolve())));
	}

	suite('line reveals', () => {

		test('wait on a line, hide the image while tracing its frame, and clear every effect after two seconds', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { container, image, reveal } = render();
			const waiting = { height: container.getBoundingClientRect().height, opacity: mainWindow.getComputedStyle(image).opacity };
			reveal.reveal();
			const started = snapshot(container, image);
			const animation = container.getAnimations().find(animation => animation instanceof CSSAnimation && animation.animationName === 'chat-image-reveal-trace');
			const duration = animation?.effect?.getTiming().duration;
			await timeout(1999);
			const beforeDeadline = container.classList.contains('revealing');
			reveal.reveal();
			await timeout(1);

			assert.deepStrictEqual({
				waiting,
				started: { pending: started.pending, revealing: started.revealing, effects: started.effects, opacity: started.imageOpacity },
				duration: Math.round(Number(duration)),
				beforeDeadline,
				finished: snapshot(container, image),
				animations: container.getAnimations({ subtree: true }).length,
			}, {
				waiting: { height: 1, opacity: '0' },
				started: { pending: false, revealing: true, effects: 5, opacity: '0' },
				duration: 2000,
				beforeDeadline: true,
				finished: { pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none' },
				animations: 0,
			});
		}));

		test('draw a rounded frame clockwise from the left end of the line', () => {
			const { container, reveal } = render();
			reveal.reveal();
			const style = mainWindow.getComputedStyle(container);
			assert.deepStrictEqual({
				viewBox: container.querySelector('.chat-image-reveal-trace')?.getAttribute('viewBox'),
				track: container.querySelector('.chat-image-reveal-trace-track')?.getAttribute('d'),
				frame: container.querySelector('.chat-image-reveal-trace-line')?.getAttribute('d'),
				head: [...container.querySelectorAll('.chat-image-reveal-trace-head > path')].map(path => path.getAttribute('class')),
				length: Math.round(parseFloat(style.getPropertyValue('--chat-image-reveal-trace-length'))),
				start: style.getPropertyValue('--chat-image-reveal-trace-start'),
			}, {
				viewBox: '0 0 400 240',
				track: 'M0 0.5H400',
				frame: 'M8 0.5H392A7.5 7.5 0 0 1 399.5 8V232A7.5 7.5 0 0 1 392 239.5H8A7.5 7.5 0 0 1 0.5 232V8A7.5 7.5 0 0 1 8 0.5Z',
				head: ['chat-image-reveal-trace-tail', 'chat-image-reveal-trace-body', 'chat-image-reveal-trace-core'],
				length: 1263,
				start: '384px',
			});
		});

		test('open the frame as the line traces down, close the loop, and only then reveal the image', () => {
			const { container, image, reveal } = render();
			reveal.reveal();
			const line = container.querySelector('.chat-image-reveal-trace-line')!;
			const length = parseFloat(mainWindow.getComputedStyle(container).getPropertyValue('--chat-image-reveal-trace-length'));
			const phases = [0, 200, 400, 800, 1195, 1330, 1600].map(time => {
				seek(container, time);
				const bounds = container.getBoundingClientRect();
				return {
					width: Math.round(bounds.width),
					height: Math.round(bounds.height),
					drawn: Math.round(length - parseFloat(mainWindow.getComputedStyle(line).strokeDashoffset)),
					opacity: Number(mainWindow.getComputedStyle(image).opacity),
					position: parseFloat(mainWindow.getComputedStyle(container).getPropertyValue('--chat-image-reveal-position')),
				};
			});
			assert.deepStrictEqual({
				widths: phases.map(phase => phase.width),
				startsAsTheLine: { height: phases[0].height, drawn: phases[0].drawn },
				tracesClockwise: phases.slice(0, 5).every((phase, index) => index === 0 || phase.drawn > phases[index - 1].drawn),
				opensAheadOfTheLine: phases.slice(1, 3).every(phase => phase.height > 1 && phase.height < 240 && phase.height >= phase.drawn - 384),
				openBeforeClosing: phases[3].height === 240 && phases[3].drawn < length - 1,
				closesBeforeRevealing: Math.round(length) - phases[4].drawn <= 1 && phases.slice(0, 5).every(phase => phase.opacity === 0 && phase.position === 0),
				fadesWithoutPopping: phases[5].opacity > 0 && phases[5].opacity < 1,
				scanKeepsMoving: phases[6].position > phases[5].position && phases[5].position > 0,
				sharpImageFilter: mainWindow.getComputedStyle(image).filter,
			}, {
				widths: [400, 400, 400, 400, 400, 400, 400],
				startsAsTheLine: { height: 1, drawn: 384 },
				tracesClockwise: true,
				opensAheadOfTheLine: true,
				openBeforeClosing: true,
				closesBeforeRevealing: true,
				fadesWithoutPopping: true,
				scanKeepsMoving: true,
				sharpImageFilter: 'none',
			});
		});

		test('keep the same anchor and width from the waiting line through the finished image', async () => {
			const { container, reveal, host, header } = render(ColorScheme.DARK, true);
			await nextFrame();
			const bounds = () => {
				const rect = container.getBoundingClientRect();
				const hostRect = host.getBoundingClientRect();
				return [rect.left - hostRect.left, rect.top - hostRect.top, rect.width, rect.height].map(Math.round);
			};
			const waiting = { bounds: bounds(), header: mainWindow.getComputedStyle(header).visibility };
			const lineAnimation = container.getAnimations({ subtree: true }).find(animation => animation instanceof CSSAnimation && animation.animationName === 'chat-image-generation-line-travel');
			reveal.reveal();
			seek(container, 0);
			const firstFrame = bounds();
			const frameOpacity = mainWindow.getComputedStyle(container.querySelector('.chat-image-reveal-trace')!).opacity;
			const sameComet = container.getAnimations({ subtree: true }).includes(lineAnimation!);
			seek(container, 200);
			const growing = bounds();
			seek(container, 800);
			const expanded = bounds();
			reveal.dispose();
			const finished = bounds();
			assert.deepStrictEqual({
				waiting,
				firstFrame,
				frameOpacity,
				sameComet,
				growsVertically: growing[0] === 0 && growing[1] === 0 && growing[2] === 400 && growing[3] > 1 && growing[3] < 240,
				expanded,
				finished,
				clean: !host.classList.contains('chat-image-reveal-running') && ['height', 'width', 'duration', 'trace-length', 'trace-start', 'trace-descent'].every(property => container.style.getPropertyValue(`--chat-image-reveal-${property}`) === ''),
			}, {
				waiting: { bounds: [0, 0, 400, 1], header: 'hidden' },
				firstFrame: [0, 0, 400, 1],
				frameOpacity: '1',
				sameComet: true,
				growsVertically: true,
				expanded: [0, 0, 400, 240],
				finished: [0, 0, 400, 240],
				clean: true,
			});
		});

		for (const treatment of ['blue-scan', 'frosted-scan', 'gentle-focus']) {
			test(`${treatment} waits for the traced frame and removes all treatment effects`, () => {
				const { container, image, reveal } = render(ColorScheme.DARK, false, treatment);
				reveal.reveal();
				seek(container, 800);
				const tracing = {
					height: container.getBoundingClientRect().height,
					imageOpacity: mainWindow.getComputedStyle(image).opacity,
					frameOpacity: mainWindow.getComputedStyle(container.querySelector('.chat-image-reveal-trace')!).opacity,
				};
				seek(container, 1500);
				const style = mainWindow.getComputedStyle(image);
				const revealing = {
					visible: Number(style.opacity) > 0,
					focus: style.maskImage === 'none' && style.filter.startsWith('blur('),
					featheredScan: style.maskImage.startsWith('linear-gradient(') && style.filter === 'none',
					scanVisible: mainWindow.getComputedStyle(container.querySelector('.chat-image-reveal-scan')!).display !== 'none',
				};
				reveal.dispose();
				const focus = treatment === 'gentle-focus';
				assert.deepStrictEqual({ tracing, revealing, finished: snapshot(container, image), mask: mainWindow.getComputedStyle(image).maskImage }, {
					tracing: { height: 240, imageOpacity: '0', frameOpacity: '1' },
					revealing: { visible: true, focus, featheredScan: !focus, scanVisible: !focus },
					finished: { pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none' },
					mask: 'none',
				});
			});
		}

		test('the comet keeps its loading phase through the frame handoff', async () => {
			const { container, reveal } = render(ColorScheme.DARK, true);
			const animations = container.getAnimations({ subtree: true });
			await Promise.all(animations.map(animation => animation.ready));
			await nextFrame();
			const before = animations.map(animation => animation.startTime);
			reveal.reveal();
			const after = container.getAnimations({ subtree: true });
			const trace = after.find(animation => animation instanceof CSSAnimation && animation.animationName === 'chat-image-reveal-trace')!;
			trace.pause();
			trace.currentTime = 0;
			assert.deepStrictEqual({
				before,
				after: animations.map(animation => animation.startTime),
				durations: animations.map(animation => animation.effect?.getTiming().duration),
				sameAnimations: animations.every(animation => after.includes(animation)),
				height: container.getBoundingClientRect().height,
				width: container.getBoundingClientRect().width,
			}, { before: [0], after: [0], durations: [3200], sameAnimations: true, height: 1, width: 400 });
		});

		for (const fallback of ['monaco-reduce-motion', 'hc-black', 'hc-light']) {
			test(`the comet stays still without a halo in ${fallback}`, () => {
				const { container, host } = render();
				host.classList.add(fallback);
				assert.deepStrictEqual({
					animations: container.getAnimations({ subtree: true }).length,
					height: container.getBoundingClientRect().height,
					width: container.getBoundingClientRect().width,
				}, { animations: 0, height: 1, width: 400 });
			});
		}

		test('a slower motion speed stretches the comet and the reveal', () => {
			const { container, host, reveal } = render();
			host.style.setProperty('--chat-image-motion-scale', '2');
			const comet = container.getAnimations({ subtree: true }).map(animation => animation.effect?.getTiming().duration);
			reveal.reveal();
			const trace = container.getAnimations().find(animation => animation instanceof CSSAnimation && animation.animationName === 'chat-image-reveal-trace');
			assert.deepStrictEqual({ comet, reveal: Math.round(Number(trace?.effect?.getTiming().duration) / 100) * 100 }, { comet: [6400], reveal: 4000 });
		});

		test('time spent handling the image load does not extend the reveal deadline', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { container, image, reveal } = render();
			const loadedAt = mainWindow.performance.now();
			await timeout(100);
			reveal.reveal(loadedAt);
			await timeout(1899);
			const beforeDeadline = container.classList.contains('revealing');
			await timeout(1);
			assert.deepStrictEqual({ beforeDeadline, finished: snapshot(container, image) }, {
				beforeDeadline: true,
				finished: { pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none' },
			});
		}));

		test('an expired load deadline shows the image immediately', () => {
			const { container, image, reveal } = render();
			reveal.reveal(mainWindow.performance.now() - 2100);
			assert.deepStrictEqual(snapshot(container, image), {
				pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none',
			});
		});
	});

	suite('texture reveals', () => {

		for (const { loading, height, other } of [
			{ loading: 'dither', height: 40, other: 'glyphs' },
			{ loading: 'glyphs', height: 50, other: 'dither' },
		]) {
			test(`the ${loading} band keeps a fixed height and paints while the image is generated`, async () => {
				const { container } = render(ColorScheme.DARK, false, 'blue-scan', loading);
				await nextFrame();
				await nextFrame();
				const band = container.querySelector<HTMLCanvasElement>(`.chat-image-loading-${loading}`)!;
				const pixels = band.getContext('2d')!.getImageData(0, 0, band.width, band.height).data;
				assert.deepStrictEqual({
					height: container.getBoundingClientRect().height,
					band: band.getBoundingClientRect().height,
					other: mainWindow.getComputedStyle(container.querySelector(`.chat-image-loading-${other}`)!).display,
					painted: pixels.some((value, index) => index % 4 === 3 && value > 0),
				}, { height, band: height, other: 'none', painted: true });
			});
		}

		for (const { transition, loading, band, length } of [
			{ transition: 'dither-resolve', loading: 'dither', band: 40, length: 4700 },
			{ transition: 'dither-print', loading: 'dither', band: 40, length: 5000 },
			{ transition: 'dither-bloom', loading: 'dither', band: 40, length: 4800 },
			{ transition: 'ascii-resolve', loading: 'glyphs', band: 50, length: 4500 },
			{ transition: 'ascii-decode', loading: 'glyphs', band: 50, length: 4600 },
		]) {
			test(`${transition} carries its band on into a texture of the image and hands over to the image`, async () => {
				const { container, image, reveal } = render(ColorScheme.DARK, false, transition, loading, halves('#000', '#fff'));
				await image.decode();
				await nextFrame();
				reveal.reveal();
				const surface = container.querySelector<HTMLCanvasElement>(`.chat-image-loading-${loading}`)!;
				const duration = Number(surface.getAnimations()[0]?.effect?.getTiming().duration);
				const at = async (fraction: number) => {
					seek(container, duration * fraction);
					await nextFrame();
					return {
						height: Math.round(container.getBoundingClientRect().height),
						image: Number(mainWindow.getComputedStyle(image).opacity),
						texture: Number(surface.style.opacity),
					};
				};
				const start = await at(0);
				const middle = await at(0.55);
				const end = await at(1);
				reveal.dispose();
				assert.deepStrictEqual({
					textured: true,
					length: Math.round(duration / 100) * 100,
					start,
					middle,
					end: { image: end.image, texture: end.texture },
					finished: snapshot(container, image),
				}, {
					textured: true,
					length,
					start: { height: band, image: 0, texture: 1 },
					middle: { height: 240, image: 0, texture: 1 },
					end: { image: 1, texture: 0 },
					finished: { pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none' },
				});
			});
		}

		function revealClock(container: HTMLElement, loading: string) {
			return Number(container.querySelector<HTMLCanvasElement>(`.chat-image-loading-${loading}`)!.getAnimations()[0]?.effect?.getTiming().duration);
		}

		// Each case samples the frame at virtual times of a reveal whose length includes the time that its width changes on its own.
		for (const { transition, order, loadingWidth, length, frames } of [
			{ transition: 'ascii-resolve', order: 'width-first', loadingWidth: 300, length: 4985, frames: [[0, 300, 50], [242.5, 350, 50], [935, 400, 145], [2492.5, 400, 240]] },
			{ transition: 'ascii-decode', order: 'width-first', loadingWidth: 300, length: 5085, frames: [[0, 300, 50], [242.5, 350, 50], [935, 400, 201], [2542.5, 400, 240]] },
			{ transition: 'ascii-resolve', order: 'width-first', loadingWidth: 520, length: 5010, frames: [[0, 520, 50], [255, 460, 50], [960, 400, 145], [2505, 400, 240]] },
			{ transition: 'ascii-resolve', order: 'height-first', loadingWidth: 300, length: 4985, frames: [[0, 300, 50], [450, 300, 145], [1142.5, 350, 240], [2492.5, 400, 240]] },
			{ transition: 'ascii-resolve', order: 'together', loadingWidth: 300, length: 4500, frames: [[0, 300, 50], [450, 350, 145], [2250, 400, 240]] },
		]) {
			test(`${transition} changes its frame from a ${loadingWidth}px band to the image's size, ${order}`, async () => {
				const { container, image, reveal, host } = render(ColorScheme.DARK, false, transition, 'glyphs', halves('#000', '#fff'));
				host.style.setProperty('--chat-image-loading-width', `${loadingWidth}px`);
				host.style.setProperty('--chat-image-reveal-resize-order', order);
				await image.decode();
				await nextFrame();
				reveal.reveal();
				const duration = revealClock(container, 'glyphs');
				const sizes = [];
				for (const [time] of frames) {
					seek(container, duration * time / length);
					await nextFrame();
					const { width, height } = container.getBoundingClientRect();
					sizes.push([time, Math.round(width), Math.round(height)]);
				}
				reveal.dispose();
				assert.deepStrictEqual(sizes, frames);
			});
		}

		test('a frame that already has the image\'s width opens straight to its height', async () => {
			const { container, image, reveal } = render(ColorScheme.DARK, false, 'ascii-resolve', 'glyphs', halves('#000', '#fff'));
			await image.decode();
			await nextFrame();
			reveal.reveal();
			const duration = revealClock(container, 'glyphs');
			seek(container, duration * 450 / 4500);
			await nextFrame();
			const { width, height } = container.getBoundingClientRect();
			reveal.dispose();
			assert.deepStrictEqual({ length: Math.round(duration / 100) * 100, width: Math.round(width), height: Math.round(height) }, { length: 4500, width: 400, height: 145 });
		});

		test('ASCII Resolve takes longer for every extra pass it makes', async () => {
			const { container, image, reveal, host } = render(ColorScheme.DARK, false, 'ascii-resolve', 'glyphs', halves('#000', '#fff'));
			host.style.setProperty('--chat-image-reveal-passes', '3');
			await image.decode();
			await nextFrame();
			reveal.reveal();
			const duration = revealClock(container, 'glyphs');
			reveal.dispose();
			assert.strictEqual(Math.round(duration / 100) * 100, 6900);
		});

		test('a texture reveal can start fast and settle slowly', async () => {
			const pace = new RevealPace(1000, 0.5, 4);
			const { container, image, reveal, host } = render(ColorScheme.DARK, false, 'ascii-resolve', 'glyphs', halves('#000', '#fff'));
			host.style.setProperty('--chat-image-motion-scale', '0.5');
			host.style.setProperty('--chat-image-motion-scale-end', '4');
			await image.decode();
			await nextFrame();
			reveal.reveal();
			const duration = revealClock(container, 'glyphs');
			reveal.dispose();
			assert.deepStrictEqual({
				steady: new RevealPace(1000, 1, 1).duration,
				duration: Math.round(pace.duration),
				firstTenth: Math.round(pace.virtualAt(pace.duration * 0.1)),
				lastTenth: Math.round(1000 - pace.virtualAt(pace.duration * 0.9)),
				reveal: Math.round(duration / 100) * 100,
			}, { steady: 1000, duration: 1811, firstTenth: 305, lastTenth: 45, reveal: 8100 });
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

		test('dither pixels are derived from the image: bright parts light up and dark parts stay empty', async () => {
			const { container, image, reveal } = render(ColorScheme.DARK, false, 'dither-resolve', 'dither', halves('#000', '#fff'));
			await image.decode();
			await nextFrame();
			reveal.reveal();
			const surface = container.querySelector<HTMLCanvasElement>('.chat-image-loading-dither')!;
			const duration = Number(surface.getAnimations()[0]?.effect?.getTiming().duration);
			// After the image has developed and before it takes on any colors.
			seek(container, duration * 0.65);
			await nextFrame();
			const pixels = surface.getContext('2d')!.getImageData(0, 0, surface.width, surface.height).data;
			let left = 0;
			let right = 0;
			for (let y = 0; y < 240; y++) {
				for (let x = 0; x < 400; x++) {
					const lit = pixels[(y * 400 + x) * 4 + 3] > 0;
					left += x < 190 && lit ? 1 : 0;
					right += x >= 210 && lit ? 1 : 0;
				}
			}
			reveal.dispose();
			assert.deepStrictEqual({ left, rightMostlyLit: right > 190 * 240 * 0.95 }, { left: 0, rightMostlyLit: true });
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

		test('a texture reveal without a matching band still opens from the line', async () => {
			const { container, image, reveal } = render(ColorScheme.DARK, false, 'dither-bloom', 'comet', halves('#000', '#fff'));
			await image.decode();
			reveal.reveal();
			const surface = container.querySelector<HTMLCanvasElement>('.chat-image-loading-dither')!;
			seek(container, 0);
			await nextFrame();
			const start = { height: Math.round(container.getBoundingClientRect().height), surface: surface.style.display, other: container.querySelector<HTMLCanvasElement>('.chat-image-loading-glyphs')!.style.display };
			reveal.dispose();
			assert.deepStrictEqual(start, { height: 1, surface: 'block', other: 'none' });
		});
	});

	for (const theme of [ColorScheme.HIGH_CONTRAST_DARK, ColorScheme.HIGH_CONTRAST_LIGHT]) {
		test(`${theme} shows the loaded image without decorative effects`, () => {
			const { container, image, reveal } = render(theme);
			reveal.reveal();
			assert.deepStrictEqual(snapshot(container, image), {
				pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none',
			});
		});
	}

	test('reduced motion skips the reveal without hiding the loaded image', () => {
		reducedMotion = true;
		const { container, image, reveal } = render(ColorScheme.DARK, false, 'dither-resolve', 'dither');
		reveal.reveal();
		assert.deepStrictEqual(snapshot(container, image), {
			pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none',
		});
	});

	test('changing reduced motion during a reveal finishes immediately', () => {
		const { container, image, reveal } = render();
		reveal.reveal();
		reducedMotion = true;
		motionChanged.fire();
		assert.deepStrictEqual(snapshot(container, image), {
			pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none',
		});
	});

	test('disposing during a reveal removes decorations and cancels its completion timer', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { container, image, reveal } = render();
		reveal.reveal();
		reveal.dispose();
		const disposed = snapshot(container, image);
		await timeout(2100);
		assert.deepStrictEqual({ disposed, later: snapshot(container, image) }, {
			disposed: { pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none' },
			later: { pending: false, revealing: false, effects: 0, imageOpacity: '1', imageClip: 'none', imageFilter: 'none' },
		});
	}));
});
