/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IColorTheme, IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { TestColorTheme } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { ChatWorkingLogoAtlasCache, IChatWorkingLogoAtlas, createChatWorkingLogoAtlas, getChatWorkingLogoAtlasKeyframes, hasChatWorkingLogoAtlas, loadChatWorkingLogoAtlasImage } from '../../../browser/widget/chatWorkingLogoAtlas.js';
import { CHAT_WORKING_LOGO_DRAW_PAINT_ORDER, chatWorkingLogoFacePaths, getChatWorkingLogoDrawFrame } from '../../../browser/widget/chatWorkingLogoDraw.js';
import { ChatWorkingLogo, ChatWorkingProgressLogo } from '../../../browser/widget/chatWorkingLogo.js';
import { ChatConfiguration, ChatProgressAnimation } from '../../../common/constants.js';

suite('ChatWorkingLogoAtlas', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Tests that rasterize real atlases decode every frame, which can take tens of seconds on slow CI agents.
	 * Keep this above the runner's 30s CI default.
	 */
	const atlasGenerationTimeout = 60_000;

	/**
	 * Mocha does not stop a test body after it times out. Teardown cancels this token so that pending
	 * atlas work and polling end with the test instead of leaking disposables into later tests.
	 */
	function cancelOnTeardown(): CancellationToken {
		const source = new CancellationTokenSource();
		store.add(toDisposable(() => source.dispose(true)));
		return source.token;
	}

	async function waitFor(condition: () => boolean): Promise<void> {
		const token = cancelOnTeardown();
		while (!condition()) {
			await timeout(10, token);
		}
	}

	function atlas(dispose: () => void = () => { }): IChatWorkingLogoAtlas {
		return Object.assign(toDisposable(dispose), { url: 'test', width: 560, height: 448, frameWidth: 24, frameHeight: 24 });
	}

	test('shares generation and reuses a released atlas until the cache is disposed', async () => {
		let created = 0;
		let disposed = 0;
		const cache = store.add(new ChatWorkingLogoAtlasCache(mainWindow, async () => {
			created++;
			return atlas(() => disposed++);
		}));
		const options = { width: 24, height: 24, color: '#007acc' };
		const first = store.add(cache.acquire(options));
		const second = store.add(cache.acquire(options));
		const result = await first.object;
		await second.object;
		first.dispose();
		second.dispose();
		const again = store.add(cache.acquire(options));
		const reused = result === await again.object;
		again.dispose();
		cache.dispose();
		assert.deepStrictEqual({ created, disposed, reused, sharedPromise: first.object === second.object }, {
			created: 1, disposed: 1, reused: true, sharedPromise: true,
		});
	});

	test('evicts unused atlases without revoking active ones or exceeding the pixel budget', async () => {
		const disposed: string[] = [];
		const cache = store.add(new ChatWorkingLogoAtlasCache(mainWindow, async (_window, options) => atlas(() => disposed.push(options.color))));
		const first = store.add(cache.acquire({ width: 64, height: 64, color: 'first' }));
		const second = store.add(cache.acquire({ width: 64, height: 64, color: 'second' }));
		await Promise.all([first.object, second.object]);
		assert.throws(() => cache.acquire({ width: 64, height: 64, color: 'third' }), /pixel cache is full/);
		first.dispose();
		const third = store.add(cache.acquire({ width: 64, height: 64, color: 'third' }));
		await third.object;
		assert.deepStrictEqual(disposed, ['first']);
	});

	test('canceling the last pending reference discards late results', async () => {
		const pending = new DeferredPromise<IChatWorkingLogoAtlas>();
		let token = CancellationToken.None;
		let disposed = 0;
		const cache = store.add(new ChatWorkingLogoAtlasCache(mainWindow, (_window, _options, requestToken) => {
			token = requestToken;
			return pending.p;
		}));
		const first = store.add(cache.acquire({ width: 12, height: 12, color: '#007acc' }));
		const second = store.add(cache.acquire({ width: 12, height: 12, color: '#007acc' }));
		first.dispose();
		const canceledWithOneOwner = token.isCancellationRequested;
		second.dispose();
		const rejected = assert.rejects(first.object, isCancellationError);
		await pending.complete(atlas(() => disposed++));
		await rejected;
		assert.deepStrictEqual({ canceledWithOneOwner, canceled: token.isCancellationRequested, disposed }, {
			canceledWithOneOwner: false, canceled: true, disposed: 1,
		});
	});

	test('releases failed entries so a later request can retry', async () => {
		let attempts = 0;
		const failure = new Error('atlas failed');
		const cache = store.add(new ChatWorkingLogoAtlasCache(mainWindow, async () => {
			if (++attempts === 1) {
				throw failure;
			}
			return atlas();
		}));
		const options = { width: 12, height: 12, color: '#007acc' };
		const failed = store.add(cache.acquire(options));
		await assert.rejects(failed.object, error => error === failure);
		failed.dispose();
		await store.add(cache.acquire(options)).object;
		assert.strictEqual(attempts, 2);
	});

	test('reports ready and in-flight atlases, keeps released ready ones, and forgets released pending ones', async () => {
		const generations: DeferredPromise<IChatWorkingLogoAtlas>[] = [];
		const cache = store.add(new ChatWorkingLogoAtlasCache(mainWindow, () => {
			const generation = new DeferredPromise<IChatWorkingLogoAtlas>();
			generations.push(generation);
			return generation.p;
		}));
		const options = { width: 12, height: 12, color: '#007acc' };
		const empty = cache.has(options);
		const pending = store.add(cache.acquire(options));
		const inFlight = cache.has(options);
		pending.dispose();
		const releasedPending = cache.has(options);
		const canceled = assert.rejects(pending.object, isCancellationError);
		await generations[0].complete(atlas());
		await canceled;
		const ready = store.add(cache.acquire(options));
		await generations[1].complete(atlas());
		await ready.object;
		ready.dispose();
		assert.deepStrictEqual({ empty, inFlight, releasedPending, releasedReady: cache.has(options), generations: generations.length }, {
			empty: false, inFlight: true, releasedPending: false, releasedReady: true, generations: 2,
		});
	});

	test('rejects unsupported dimensions and canceled generation explicitly', async () => {
		const cache = store.add(new ChatWorkingLogoAtlasCache(mainWindow));
		for (const width of [0, -1, 1.5, 129, NaN, Infinity]) {
			assert.throws(() => cache.acquire({ width, height: 24, color: '#007acc' }), /dimensions/);
		}
		await assert.rejects(createChatWorkingLogoAtlas(mainWindow, { width: 24, height: 24, color: '#007acc' }, CancellationToken.Cancelled), isCancellationError);
	});

	test('uses padded, native-resolution tiles and 120 Hz stepped transforms', async () => {
		const token = cancelOnTeardown();
		const resource = store.add(await createChatWorkingLogoAtlas(mainWindow, { width: 24, height: 24, color: '#007acc' }, token));
		const image = $<HTMLImageElement>('img');
		await loadChatWorkingLogoAtlasImage(image, resource.url, token);
		const canvas = $<HTMLCanvasElement>('canvas');
		canvas.width = resource.width;
		canvas.height = resource.height;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		assert.ok(context);
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
		let paddingHasContent = false;
		for (let y = 0; y < canvas.height; y++) {
			for (let x = 0; x < canvas.width; x++) {
				if (x % 28 < 2 || x % 28 >= 26 || y % 28 < 2 || y % 28 >= 26) {
					paddingHasContent ||= pixels[(y * canvas.width + x) * 4 + 3] !== 0;
				}
			}
		}
		const keyframes = getChatWorkingLogoAtlasKeyframes(resource, 12, 12);
		assert.deepStrictEqual({
			imageSize: [image.naturalWidth, image.naturalHeight],
			frameSize: [resource.frameWidth, resource.frameHeight],
			paddingHasContent,
			keyframes: [0, 19, 20, 319, 320].map(index => keyframes[index]),
		}, {
			imageSize: [560, 448],
			frameSize: [24, 24],
			paddingHasContent: false,
			keyframes: [
				{ offset: 0, transform: 'translate3d(-1px, -1px, 0)', easing: 'steps(1, end)' },
				{ offset: 19 / 320, transform: 'translate3d(-267px, -1px, 0)', easing: 'steps(1, end)' },
				{ offset: 20 / 320, transform: 'translate3d(-1px, -15px, 0)', easing: 'steps(1, end)' },
				{ offset: 319 / 320, transform: 'translate3d(-267px, -211px, 0)', easing: 'steps(1, end)' },
				{ offset: 1, transform: 'translate3d(-1px, -1px, 0)' },
			],
		});
		const held = context.getImageData(0 * 28 + 2, 8 * 28 + 2, 24, 24).data;
		const expected = $<HTMLCanvasElement>('canvas');
		expected.width = expected.height = 24;
		const expectedContext = expected.getContext('2d', { willReadFrequently: true });
		assert.ok(expectedContext);
		const svg = $.SVG<SVGSVGElement>('svg', { xmlns: 'http://www.w3.org/2000/svg', viewBox: '6 6 84 84', width: 24, height: 24 },
			...chatWorkingLogoFacePaths.map(d => $.SVG<SVGPathElement>('path', { d, fill: '#007acc' })));
		const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
		store.add(toDisposable(() => URL.revokeObjectURL(source)));
		await loadChatWorkingLogoAtlasImage(image, source, token);
		expectedContext.drawImage(image, 0, 0);
		assert.deepStrictEqual(held, expectedContext.getImageData(0, 0, 24, 24).data);

		const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'stable', { isMotionReduced: () => true }));
		const animatedSvg = logo.domNode.querySelector<SVGSVGElement>('.chat-working-logo-draw-container > svg')!;
		animatedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		animatedSvg.setAttribute('width', '24');
		animatedSvg.setAttribute('height', '24');
		animatedSvg.style.color = '#007acc';
		for (const index of [0, 1, 20, 63, 127, 176, 203, 244, 287, 319]) {
			const frame = getChatWorkingLogoDrawFrame(index / 320);
			for (const band of CHAT_WORKING_LOGO_DRAW_PAINT_ORDER) {
				animatedSvg.querySelector(`.chat-working-logo-draw-band-${band}`)!.setAttribute('d', frame.paths[band]);
			}
			const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(animatedSvg)], { type: 'image/svg+xml' }));
			try {
				await loadChatWorkingLogoAtlasImage(image, source, token);
				expectedContext.clearRect(0, 0, 24, 24);
				expectedContext.drawImage(image, 0, 0);
				assert.deepStrictEqual(context.getImageData(index % 20 * 28 + 2, Math.floor(index / 20) * 28 + 2, 24, 24).data, expectedContext.getImageData(0, 0, 24, 24).data, `Frame ${index}`);
			} finally {
				URL.revokeObjectURL(source);
			}
		}
	}).timeout(atlasGenerationTimeout);

	test('live atlas pauses when hidden, resumes on remount, and returns to static artwork', async () => {
		const host = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		host.style.cssText = '--vscode-codiconFontSize: 12px; --vscode-chat-workingProgressStableIconForeground: #007acc;';
		store.add(toDisposable(() => host.remove()));
		const errors: Error[] = [];
		// Remounts reacquire the cached atlas instead of rasterizing all frames again after each release.
		const cache = store.add(new ChatWorkingLogoAtlasCache(mainWindow));
		const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'stable', {
			acquireAtlas: (_window, options) => cache.acquire(options),
			atlasPreparationDelay: 0,
			onAtlasError: error => errors.push(error),
		}));
		host.appendChild(logo.domNode);
		const waitForAtlas = () => waitFor(() => logo.domNode.classList.contains('chat-working-logo-atlas'));
		await waitForAtlas();
		const animation = logo.domNode.querySelector('.chat-working-logo-atlas-sheet')!.getAnimations()[0];
		const firstTime = animation.currentTime;
		await waitFor(() => animation.currentTime !== firstTime);
		host.style.display = 'none';
		await waitFor(() => animation.playState === 'idle');
		host.style.display = '';
		await waitForAtlas();
		host.remove();
		await waitFor(() => !logo.domNode.classList.contains('chat-working-logo-atlas'));
		mainWindow.document.body.appendChild(host);
		await waitForAtlas();
		logo.setActive(false);
		assert.deepStrictEqual({
			errors,
			animations: logo.domNode.getAnimations({ subtree: true }).length,
			assembled: logo.domNode.classList.contains('chat-working-logo-draw-assembled'),
			atlas: !!logo.domNode.querySelector('.chat-working-logo-atlas-sheet'),
		}, { errors: [], animations: 0, assembled: true, atlas: false });
	}).timeout(atlasGenerationTimeout);

	test('DPR changes replace the atlas without changing its CSS footprint', async () => {
		const changed = store.add(new Emitter<number>());
		const ratio = { value: 1, onDidChange: changed.event };
		const host = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		host.style.cssText = '--vscode-codiconFontSize: 12px; --vscode-chat-workingProgressStableIconForeground: #007acc;';
		store.add(toDisposable(() => host.remove()));
		const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'stable', { pixelRatio: ratio, atlasPreparationDelay: 0 }));
		host.appendChild(logo.domNode);
		const image = () => logo.domNode.querySelector<HTMLImageElement>('.chat-working-logo-atlas-sheet');
		await waitFor(() => !!image()?.complete);
		const first = image()!;
		const firstWidth = first.naturalWidth;
		ratio.value = 2.5;
		changed.fire(ratio.value);
		await waitFor(() => !!image() && image() !== first);
		const bounds = logo.domNode.getBoundingClientRect();
		assert.deepStrictEqual({
			firstWidth,
			replacementWidth: image()!.naturalWidth,
			bounds: [bounds.width, bounds.height],
		}, { firstWidth: 320, replacementWidth: 680, bounds: [12, 12] });
	}).timeout(atlasGenerationTimeout);

	test('atlas failure logs once and leaves the SVG fallback active', async () => {
		const errors: Error[] = [];
		const host = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		host.style.cssText = '--vscode-codiconFontSize: 12px; --vscode-chat-workingProgressStableIconForeground: #007acc;';
		store.add(toDisposable(() => host.remove()));
		const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'stable', {
			acquireAtlas: () => Object.assign(toDisposable(() => { }), { object: Promise.reject(new Error('encode failed')) }),
			atlasPreparationDelay: 0,
			onAtlasError: error => errors.push(error),
		}));
		host.appendChild(logo.domNode);
		await waitFor(() => errors.length === 1);
		const paths = () => [...logo.domNode.querySelectorAll('.chat-working-logo-draw-band')].map(path => path.getAttribute('d'));
		const initial = paths();
		await waitFor(() => paths().some((path, index) => path !== initial[index]));
		assert.deepStrictEqual({
			errors: errors.map(error => error.message),
			atlas: logo.domNode.classList.contains('chat-working-logo-atlas'),
		}, { errors: ['Unable to prepare Draw atlas; using SVG animation'], atlas: false });
	});

	test('theme updates replace the colored atlas and inactive styles do not allocate it', async () => {
		const changed = store.add(new Emitter<IColorTheme>());
		const theme = new class extends mock<IThemeService>() {
			override readonly onDidColorThemeChange = changed.event;
		}();
		const configuration = new TestConfigurationService();
		store.add(toDisposable(() => configuration.onDidChangeConfigurationEmitter.dispose()));
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Draw);
		const host = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		host.style.cssText = '--vscode-codiconFontSize: 12px; --vscode-chat-workingProgressStableIconForeground: #007acc;';
		store.add(toDisposable(() => host.remove()));
		const logo = store.add(new ChatWorkingProgressLogo('stable', configuration, store.add(new NullLogService()), new TestAccessibilityService(), theme));
		host.appendChild(logo.domNode);
		const image = () => logo.domNode.querySelector<HTMLImageElement>('.chat-working-logo-atlas-sheet');
		await waitFor(() => !!image()?.complete);
		const original = image()!;
		host.style.setProperty('--vscode-chat-workingProgressStableIconForeground', '#24bfa5');
		changed.fire(new TestColorTheme());
		await waitFor(() => !!image() && image() !== original);
		const colored = image()!;
		const canvas = $<HTMLCanvasElement>('canvas');
		canvas.width = colored.naturalWidth;
		canvas.height = colored.naturalHeight;
		const context = canvas.getContext('2d', { willReadFrequently: true });
		assert.ok(context);
		context.drawImage(colored, 0, 0);
		const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
		const opaque = data.findIndex((value, index) => index % 4 === 3 && value === 255);
		assert.ok(opaque >= 3);
		const rgba = [...data.slice(opaque - 3, opaque + 1)];
		logo.setAnimation(ChatProgressAnimation.DrawMonochromeNoIcon);
		changed.fire(new TestColorTheme());
		await timeout(0);
		assert.deepStrictEqual({
			rgba,
			atlas: !!image(),
			animations: logo.domNode.getAnimations({ subtree: true }).length,
			hidden: mainWindow.getComputedStyle(logo.domNode).visibility,
		}, { rgba: [36, 191, 165, 255], atlas: false, animations: 0, hidden: 'hidden' });
	}).timeout(atlasGenerationTimeout);

	test('disposal during generation prevents late image and animation attachment', async () => {
		const pending = new DeferredPromise<IChatWorkingLogoAtlas>();
		let released = 0;
		let acquired = false;
		const host = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		host.style.cssText = '--vscode-codiconFontSize: 12px;';
		store.add(toDisposable(() => host.remove()));
		const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'stable', {
			acquireAtlas: () => {
				acquired = true;
				return Object.assign(toDisposable(() => released++), { object: pending.p });
			},
			atlasPreparationDelay: 0,
			pixelRatio: { value: 1, onDidChange: Event.None },
		}));
		host.appendChild(logo.domNode);
		await waitFor(() => acquired);
		logo.dispose();
		await pending.error(new CancellationError());
		await timeout(0);
		assert.deepStrictEqual({
			released,
			connected: logo.domNode.isConnected,
			atlas: logo.domNode.querySelector('.chat-working-logo-atlas-sheet'),
			animations: logo.domNode.getAnimations({ subtree: true }).length,
		}, { released: 1, connected: false, atlas: null, animations: 0 });
	});

	test('new atlases wait for the preparation delay while existing ones are used immediately', async () => {
		const host = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		host.style.cssText = '--vscode-codiconFontSize: 12px;';
		store.add(toDisposable(() => host.remove()));
		const acquiredAfter = new Map<string, number>();
		const createLogo = (name: string, existing: boolean, atlasPreparationDelay: number) => {
			const createdAt = mainWindow.performance.now();
			const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'stable', {
				atlasPreparationDelay,
				hasAtlas: () => existing,
				acquireAtlas: () => {
					acquiredAfter.set(name, mainWindow.performance.now() - createdAt);
					return Object.assign(toDisposable(() => { }), { object: new Promise<IChatWorkingLogoAtlas>(() => { }) });
				},
				pixelRatio: { value: 1, onDidChange: Event.None },
			}));
			host.appendChild(logo.domNode);
		};
		createLogo('existing', true, 60_000);
		createLogo('new', false, 1000);
		await waitFor(() => acquiredAfter.has('existing') && acquiredAfter.has('new'));
		assert.deepStrictEqual({
			existingSkippedDelay: acquiredAfter.get('existing')! < 60_000,
			newWaitedForDelay: acquiredAfter.get('new')! >= 1000,
		}, { existingSkippedDelay: true, newWaitedForDelay: true });
	}).timeout(10_000);

	test('later indicators reuse the window atlas after earlier ones are disposed, without waiting for the delay', async () => {
		const host = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		// The window retains completed atlases for its lifetime, so use a color that no other test generates.
		host.style.cssText = '--vscode-codiconFontSize: 12px; --vscode-chat-workingProgressStableIconForeground: #2a7ab0;';
		store.add(toDisposable(() => host.remove()));
		const pixelRatio = { value: 1, onDidChange: Event.None };
		const first = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'stable', { pixelRatio, atlasPreparationDelay: 0 }));
		host.appendChild(first.domNode);
		await waitFor(() => first.domNode.classList.contains('chat-working-logo-atlas'));
		const options = { width: 12, height: 12, color: mainWindow.getComputedStyle(first.domNode).color };
		first.dispose();
		const retained = hasChatWorkingLogoAtlas(mainWindow, options);
		const second = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'stable', { pixelRatio, atlasPreparationDelay: 60_000 }));
		host.appendChild(second.domNode);
		await waitFor(() => second.domNode.classList.contains('chat-working-logo-atlas'));
		assert.deepStrictEqual({ retained, sheetLoaded: !!second.domNode.querySelector<HTMLImageElement>('.chat-working-logo-atlas-sheet')?.complete }, {
			retained: true, sheetLoaded: true,
		});
	}).timeout(atlasGenerationTimeout);
});
