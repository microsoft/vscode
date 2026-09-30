/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatWorkingLogo, ChatWorkingProgressLogo, getConfiguredProgressAnimation } from '../../../browser/widget/chatWorkingLogo.js';
import { getChatWorkingLogoDrawFrame } from '../../../browser/widget/chatWorkingLogoDraw.js';
import { ChatConfiguration, ChatProgressAnimation } from '../../../common/constants.js';

suite('ChatWorkingLogo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const accessibilityService = new class extends TestAccessibilityService {
		override isMotionReduced(): boolean { return false; }
	}();

	function createConfiguration() {
		const configuration = new TestConfigurationService();
		store.add(toDisposable(() => configuration.onDidChangeConfigurationEmitter.dispose()));
		const fireChange = (key = ChatConfiguration.PersistentProgress) => configuration.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([key]),
			change: { keys: [key], overrides: [] },
			affectsConfiguration: section => section === key,
		});
		return { configuration, fireChange };
	}

	function createDynamicLogo(animation: ChatProgressAnimation, motionReduced = false) {
		let now = 0;
		let pendingFrame: (() => void) | undefined;
		let changeVisibility: ((visible: boolean) => void) | undefined;
		const parent = mainWindow.document.body.appendChild($(`.${motionReduced ? 'monaco-reduce-motion' : 'monaco-enable-motion'}`));
		store.add(toDisposable(() => parent.remove()));
		const logo = store.add(new ChatWorkingLogo(animation, 'stable', {
			now: () => now,
			isMotionReduced: () => motionReduced,
			observeVisibility: (_element, onDidChange) => {
				changeVisibility = onDidChange;
				onDidChange(true);
				return toDisposable(() => changeVisibility = undefined);
			},
			scheduleFrame: (_targetWindow, runner) => {
				pendingFrame = runner;
				return toDisposable(() => {
					if (pendingFrame === runner) {
						pendingFrame = undefined;
					}
				});
			},
		}));
		parent.appendChild(logo.domNode);
		return {
			logo,
			advanceTo(time: number): void {
				now = time;
				assert.ok(pendingFrame, 'Expected a pending animation frame');
				pendingFrame();
			},
			hasPendingFrame: () => pendingFrame !== undefined,
			setVisible(visible: boolean): void {
				assert.ok(changeVisibility);
				changeVisibility(visible);
			},
		};
	}

	test('an unregistered progress setting falls back to Off and switches Draw styles without replacing its faces', async () => {
		const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		store.add(toDisposable(() => parent.remove()));
		const { configuration, fireChange } = createConfiguration();
		const logo = store.add(new ChatWorkingProgressLogo('stable', configuration, store.add(new NullLogService()), accessibilityService));
		parent.appendChild(logo.domNode);
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		const faces = [...logo.domNode.querySelectorAll('.chat-working-logo-face')];
		const initial = { animation: logo.domNode.dataset.animation, animations: logo.domNode.getAnimations({ subtree: true }).length };
		const snapshots = [];
		for (const animation of [...Object.values(ChatProgressAnimation), ChatProgressAnimation.Draw]) {
			await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
			fireChange();
			const style = mainWindow.getComputedStyle(logo.domNode);
			snapshots.push({
				animation: logo.domNode.dataset.animation,
				filter: style.filter,
				visibility: style.visibility,
				animations: logo.domNode.getAnimations({ subtree: true }).length,
			});
		}
		const animations = logo.domNode.getAnimations({ subtree: true });
		fireChange(ChatConfiguration.ThinkingPhrases);
		const sameAnimations = logo.domNode.getAnimations({ subtree: true }).every((animation, index) => animation === animations[index]);
		logo.dispose();
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.DrawMonochrome);
		fireChange();
		assert.deepStrictEqual({
			initial, snapshots,
			sameFaces: [...logo.domNode.querySelectorAll('.chat-working-logo-face')].every((face, index) => face === faces[index]),
			sameAnimations,
			animationAfterDisposal: logo.domNode.dataset.animation,
		}, {
			initial: { animation: 'off', animations: 0 },
			snapshots: [
				{ animation: 'off', filter: 'none', visibility: 'visible', animations: 0 },
				{ animation: 'draw', filter: 'none', visibility: 'visible', animations: 0 },
				{ animation: 'drawMonochrome', filter: 'grayscale(1)', visibility: 'visible', animations: 0 },
				{ animation: 'drawMonochromeNoIcon', filter: 'grayscale(1)', visibility: 'hidden', animations: 0 },
				{ animation: 'draw', filter: 'none', visibility: 'visible', animations: 0 },
			],
			sameFaces: true,
			sameAnimations: true,
			animationAfterDisposal: 'draw',
		});
	});

	test('changing the configured style does not reactivate an inactive logo', async () => {
		const { configuration, fireChange } = createConfiguration();
		const logo = store.add(new ChatWorkingProgressLogo('insider', configuration, store.add(new NullLogService()), accessibilityService));
		mainWindow.document.body.appendChild(logo.domNode);
		logo.setActive(false);
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.DrawMonochrome);
		fireChange();
		assert.deepStrictEqual({
			animation: logo.domNode.dataset.animation,
			animations: logo.domNode.getAnimations({ subtree: true }).length,
			active: logo.domNode.classList.contains('chat-working-logo-active'),
			color: logo.domNode.style.color,
			filter: mainWindow.getComputedStyle(logo.domNode).filter,
		}, {
			animation: 'drawMonochrome',
			animations: 0,
			active: false,
			color: 'var(--vscode-chat-workingProgressInsidersIconForeground)',
			filter: 'grayscale(1)',
		});
	});

	test('removed animation settings resolve to Draw before migration and for experiment defaults', async () => {
		const { configuration } = createConfiguration();
		const logger = store.add(new NullLogService());
		const results = [];
		for (const animation of ['weave', 'orbit', 'accordion', 'dial', 'ribbon']) {
			await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
			results.push(getConfiguredProgressAnimation(configuration, logger));
		}
		assert.deepStrictEqual(results, Array(5).fill(ChatProgressAnimation.Draw));
	});

	test('unsupported animation settings are logged and leave the logo static', async () => {
		const { configuration } = createConfiguration();
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, 'unsupported');
		const warnings: string[] = [];
		const logger = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const logo = store.add(new ChatWorkingProgressLogo('stable', configuration, logger, accessibilityService));
		assert.deepStrictEqual({ animation: logo.domNode.dataset.animation, warnings }, {
			animation: 'off',
			warnings: ['ChatWorkingProgressLogo: unsupported progress animation, using Off'],
		});
	});

	test('unsupported animation settings warn once per value across render hot paths', async () => {
		const { configuration } = createConfiguration();
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, 'pulse');
		const warnings: string[] = [];
		const logger = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const results = [1, 2, 3].map(() => getConfiguredProgressAnimation(configuration, logger));
		assert.deepStrictEqual({ results, warnings: warnings.length }, { results: [ChatProgressAnimation.Off, ChatProgressAnimation.Off, ChatProgressAnimation.Off], warnings: 1 });
	});

	test('uses the same decorative ribbon faces and product theme colors for every style', () => {
		const logos = Object.values(ChatProgressAnimation).flatMap(animation => [
			store.add(new ChatWorkingLogo(animation, 'stable')),
			store.add(new ChatWorkingLogo(animation, 'insider')),
		]);
		const paths = logos.map(logo => [...logo.domNode.querySelectorAll('.chat-working-logo-face path')].map(path => path.getAttribute('d')));
		assert.deepStrictEqual({
			faceCounts: logos.map(logo => logo.domNode.querySelectorAll('.chat-working-logo-face').length),
			sameGeometry: paths.every(value => JSON.stringify(value) === JSON.stringify(paths[0])),
			decorative: logos.every(logo => logo.domNode.getAttribute('aria-hidden') === 'true'),
			palettes: logos.map(logo => logo.domNode.style.color),
		}, {
			faceCounts: Array(Object.values(ChatProgressAnimation).length * 2).fill(1),
			sameGeometry: true,
			decorative: true,
			palettes: Object.values(ChatProgressAnimation).flatMap(() => ['var(--vscode-chat-workingProgressStableIconForeground)', 'var(--vscode-chat-workingProgressInsidersIconForeground)']),
		});
	});

	test('monochrome preserves high contrast theme colors', () => {
		const filters = ['hc-black', 'hc-light'].flatMap(theme => {
			const parent = mainWindow.document.body.appendChild($(`.${theme}`));
			store.add(toDisposable(() => parent.remove()));
			return (['stable', 'insider'] as const).map(quality => {
				const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.DrawMonochrome, quality));
				parent.appendChild(logo.domNode);
				return mainWindow.getComputedStyle(logo.domNode).filter;
			});
		});
		assert.deepStrictEqual(filters, ['none', 'none', 'none', 'none']);
	});

	test('Draw preserves the product mark with parabolic velocity and separate loops', () => {
		const staticLogo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Off, 'stable'));
		const { logo: drawLogo, advanceTo, hasPendingFrame } = createDynamicLogo(ChatProgressAnimation.Draw);
		const drawPaths = [...drawLogo.domNode.querySelectorAll<SVGPathElement>('.chat-working-logo-draw-band')];
		const renderedFaces = [...drawLogo.domNode.querySelectorAll<SVGPathElement>('.chat-working-logo-draw-face')];
		const svg = drawLogo.domNode.querySelector<SVGSVGElement>('.chat-working-logo-draw-container > svg');
		assert.ok(svg);
		const initial = drawPaths.map(path => path.getAttribute('d') ?? '');
		advanceTo(600);
		const moving = drawPaths.map(path => path.getAttribute('d') ?? '');
		drawLogo.setActive(true);
		const afterRedundantActivation = drawPaths.map(path => path.getAttribute('d') ?? '');
		advanceTo(800);
		const continued = drawPaths.map(path => path.getAttribute('d') ?? '');
		drawLogo.setActive(false);
		const assembled = {
			class: drawLogo.domNode.classList.contains('chat-working-logo-draw-assembled'),
			faceDisplay: mainWindow.getComputedStyle(drawLogo.domNode.querySelector<HTMLElement>('.chat-working-logo-face')!).display,
			drawDisplay: mainWindow.getComputedStyle(drawLogo.domNode.querySelector<HTMLElement>('.chat-working-logo-draw-container')!).display,
		};
		const sampleFrames = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(getChatWorkingLogoDrawFrame);
		const fullLength = getChatWorkingLogoDrawFrame(0.5).head;
		const coordinates = sampleFrames.flatMap(frame => Object.values(frame.paths))
			.flatMap(path => [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)])
			.flatMap(match => [Number(match[1]), Number(match[2])]);
		const frameIntervalMs = 1000 / 30;
		const sampledTie = Array.from({ length: Math.ceil(drawLogo.drawDurationMs * 0.4 / frameIntervalMs) + 1 }, (_, index) =>
			getChatWorkingLogoDrawFrame(Math.min(index * frameIntervalMs / drawLogo.drawDurationMs, 0.4)));
		let maximumTravel = 0;
		for (let index = 1; index < sampledTie.length; index++) {
			maximumTravel = Math.max(maximumTravel, Math.abs(sampledTie[index].head - sampledTie[index - 1].head));
		}
		const compactDevicePixelScale = 0.84 * 12 / 84 * 2;
		const tieStartSpeed = getChatWorkingLogoDrawFrame(0.00001).head / fullLength / 0.00001;
		const longQuadraticStartSpeed = (2 / 0.42) / 7600;
		assert.deepStrictEqual({
			drawDuration: drawLogo.drawDurationMs,
			cycleSpeedup: Math.round(4000 / drawLogo.drawDurationMs * 1000) / 1000,
			sameColor: staticLogo.domNode.style.color === drawLogo.domNode.style.color,
			lazyArtwork: [staticLogo, drawLogo].map(logo => !!logo.domNode.querySelector('.chat-working-logo-draw-container')),
			viewBox: svg.getAttribute('viewBox'),
			shapeRendering: svg.getAttribute('shape-rendering'),
			overflow: mainWindow.getComputedStyle(svg).overflow,
			maskFills: drawPaths.map(path => path.getAttribute('fill')),
			maskStrokes: drawPaths.map(path => path.getAttribute('stroke')),
			maskStrokeWidths: drawPaths.map(path => path.getAttribute('stroke-width')),
			maskStrokeJoins: drawPaths.map(path => path.getAttribute('stroke-linejoin')),
			maskTransforms: drawPaths.map(path => path.getAttribute('transform')),
			renderedFills: renderedFaces.map(path => path.getAttribute('fill')),
			renderedGeometryMatchesStatic: renderedFaces.every((path, index) =>
				path.getAttribute('d') === staticLogo.domNode.querySelectorAll('.chat-working-logo-face path')[index].getAttribute('d')),
			cssAnimations: drawLogo.domNode.getAnimations({ subtree: true }).length,
			pathChanged: moving.some((path, index) => path !== initial[index]),
			redundantActivationPreservedFrame: afterRedundantActivation.every((path, index) => path === moving[index]),
			continuedAfterRedundantActivation: continued.some((path, index) => path !== moving[index]),
			assembled,
			allMotionWithinMark: coordinates.every(value => value > -1.5 && value < 101.5),
			tieCubic: [0.1, 0.2, 0.3].map(progress => Math.round(getChatWorkingLogoDrawFrame(progress).head / fullLength * 1000) / 1000),
			hold: [0.4, 0.475, 0.55].map(progress => {
				const frame = getChatWorkingLogoDrawFrame(progress);
				return [frame.tail, frame.head];
			}),
			untieCubic: [0.65, 0.75, 0.85].map(progress => Math.round(getChatWorkingLogoDrawFrame(progress).tail / fullLength * 1000) / 1000),
			loopRest: [0.95, 0.975, 0.999].map(progress => {
				const frame = getChatWorkingLogoDrawFrame(progress);
				return {
					endsTogether: frame.tail === frame.head,
					empty: Object.values(frame.paths).every(path => path.length === 0),
				};
			}),
			endpointSpeeds: {
				fastestSpeedup: Math.round(tieStartSpeed / drawLogo.drawDurationMs / longQuadraticStartSpeed * 1000) / 1000,
				tieSlowest: Math.round((fullLength - getChatWorkingLogoDrawFrame(0.39999).head) / fullLength / 0.00001 * 1000) / 1000,
				untieSlowest: Math.round(getChatWorkingLogoDrawFrame(0.55001).tail / fullLength / 0.00001 * 1000) / 1000,
			},
			maximumTieDevicePixelTravelAt30Fps: Math.round(maximumTravel * compactDevicePixelScale * 1000) / 1000,
			pendingAfterStop: hasPendingFrame(),
		}, {
			drawDuration: 2667,
			cycleSpeedup: 1.5,
			sameColor: true,
			lazyArtwork: [false, true],
			viewBox: '6 6 84 84',
			shapeRendering: 'geometricPrecision',
			overflow: 'visible',
			maskFills: ['#fff', '#fff', '#fff'],
			maskStrokes: ['#fff', '#fff', '#fff'],
			maskStrokeWidths: ['4', '4', '4'],
			maskStrokeJoins: ['round', 'round', 'round'],
			maskTransforms: Array(3).fill('translate(6 6) scale(0.84)'),
			renderedFills: ['currentColor', 'currentColor', 'currentColor'],
			renderedGeometryMatchesStatic: true,
			cssAnimations: 0,
			pathChanged: true,
			redundantActivationPreservedFrame: true,
			continuedAfterRedundantActivation: true,
			assembled: { class: true, faceDisplay: 'block', drawDisplay: 'none' },
			allMotionWithinMark: true,
			tieCubic: [0.578, 0.875, 0.984],
			hold: Array.from({ length: 3 }, () => [0, fullLength]),
			untieCubic: [0.016, 0.125, 0.422],
			loopRest: Array.from({ length: 3 }, () => ({ endsTogether: true, empty: true })),
			endpointSpeeds: {
				fastestSpeedup: 4.488,
				tieSlowest: 0,
				untieSlowest: 0,
			},
			maximumTieDevicePixelTravelAt30Fps: 5.751,
			pendingAfterStop: false,
		});
	});

	test('draw resolves to a full static logo when stopped, reduced, or disabled', () => {
		const { logo, hasPendingFrame } = createDynamicLogo(ChatProgressAnimation.Draw);
		const faces = [...logo.domNode.querySelectorAll('.chat-working-logo-face')];
		const snapshot = (target: ChatWorkingLogo) => ({
			assembled: target.domNode.classList.contains('chat-working-logo-draw-assembled'),
			faceDisplay: mainWindow.getComputedStyle(target.domNode.querySelector<HTMLElement>('.chat-working-logo-face')!).display,
			drawDisplay: mainWindow.getComputedStyle(target.domNode.querySelector<HTMLElement>('.chat-working-logo-draw-container')!).display,
		});
		logo.setActive(false);
		const stopped = snapshot(logo);
		const stoppedPendingFrame = hasPendingFrame();
		const { logo: reducedLogo, hasPendingFrame: hasReducedPendingFrame } = createDynamicLogo(ChatProgressAnimation.Draw, true);
		const reduced = snapshot(reducedLogo);
		logo.setAnimation(ChatProgressAnimation.Off);
		const disabled = {
			drawDisplay: mainWindow.getComputedStyle(logo.domNode.querySelector<HTMLElement>('.chat-working-logo-draw-container')!).display,
			faceDisplays: faces.map(face => mainWindow.getComputedStyle(face).display),
		};
		const sameFaces = [...logo.domNode.querySelectorAll('.chat-working-logo-face')].every((face, index) => face === faces[index]);
		assert.deepStrictEqual({ stopped, stoppedPendingFrame, reduced, reducedPendingFrame: hasReducedPendingFrame(), disabled, sameFaces }, {
			stopped: { assembled: true, faceDisplay: 'block', drawDisplay: 'none' },
			stoppedPendingFrame: false,
			reduced: { assembled: true, faceDisplay: 'block', drawDisplay: 'none' },
			reducedPendingFrame: false,
			disabled: { drawDisplay: 'none', faceDisplays: ['block'] },
			sameFaces: true,
		});
	});

	test('hidden Draw logos suspend and resume their animation frame', () => {
		const { logo, advanceTo, hasPendingFrame, setVisible } = createDynamicLogo(ChatProgressAnimation.Draw);
		advanceTo(300);
		const beforeHide = [...logo.domNode.querySelectorAll<SVGPathElement>('.chat-working-logo-draw-band')].map(path => path.getAttribute('d'));
		setVisible(false);
		const pendingWhileHidden = hasPendingFrame();
		const hiddenPaths = [...logo.domNode.querySelectorAll<SVGPathElement>('.chat-working-logo-draw-band')].map(path => path.getAttribute('d'));
		setVisible(true);
		const pendingAfterShow = hasPendingFrame();
		advanceTo(450);
		const resumedPaths = [...logo.domNode.querySelectorAll<SVGPathElement>('.chat-working-logo-draw-band')].map(path => path.getAttribute('d'));
		assert.deepStrictEqual({
			pendingWhileHidden,
			hiddenPathsUnchanged: hiddenPaths.every((path, index) => path === beforeHide[index]),
			pendingAfterShow,
			resumed: resumedPaths.some((path, index) => path !== hiddenPaths[index]),
		}, {
			pendingWhileHidden: false,
			hiddenPathsUnchanged: true,
			pendingAfterShow: true,
			resumed: true,
		});
	});

	test('stops motion and removes the mark on disposal', () => {
		const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw));
		mainWindow.document.body.appendChild(logo.domNode);
		logo.setActive(false);
		const stoppedAnimations = logo.domNode.getAnimations({ subtree: true }).length;
		logo.setActive(true);
		const active = logo.domNode.classList.contains('chat-working-logo-active');
		logo.dispose();
		assert.deepStrictEqual({ stoppedAnimations, active, connected: logo.domNode.isConnected }, {
			stoppedAnimations: 0,
			active: true,
			connected: false,
		});
	});

	test('disposal cancels a scheduled Draw frame', () => {
		const { logo, hasPendingFrame } = createDynamicLogo(ChatProgressAnimation.Draw);
		const pendingBeforeDisposal = hasPendingFrame();
		logo.dispose();
		assert.deepStrictEqual({
			pendingBeforeDisposal,
			pendingAfterDisposal: hasPendingFrame(),
			connected: logo.domNode.isConnected,
		}, {
			pendingBeforeDisposal: true,
			pendingAfterDisposal: false,
			connected: false,
		});
	});

	test('reduced motion leaves every face assembled and keeps the no-icon style hidden', () => {
		const parent = mainWindow.document.body.appendChild($('.monaco-reduce-motion'));
		store.add(toDisposable(() => parent.remove()));
		const snapshots = Object.values(ChatProgressAnimation).map(animation => {
			let scheduledFrames = 0;
			const logo = store.add(new ChatWorkingLogo(animation, 'stable', {
				isMotionReduced: () => true,
				scheduleFrame: () => {
					scheduledFrames++;
					return toDisposable(() => undefined);
				},
			}));
			parent.appendChild(logo.domNode);
			const drawContainer = logo.domNode.querySelector<HTMLElement>('.chat-working-logo-draw-container');
			return {
				visibility: mainWindow.getComputedStyle(logo.domNode).visibility,
				scheduledFrames,
				faces: [...logo.domNode.querySelectorAll('.chat-working-logo-face')].map(face => {
					const style = mainWindow.getComputedStyle(face);
					return { transform: style.transform, opacity: style.opacity, animation: style.animationName, clip: style.clipPath };
				}),
				assembled: logo.domNode.classList.contains('chat-working-logo-draw-assembled'),
				faceDisplay: mainWindow.getComputedStyle(logo.domNode.querySelector<HTMLElement>('.chat-working-logo-face')!).display,
				drawDisplay: drawContainer ? mainWindow.getComputedStyle(drawContainer).display : 'none',
			};
		});
		assert.deepStrictEqual(snapshots, Object.values(ChatProgressAnimation).map(animation => {
			const draw = animation === ChatProgressAnimation.Draw || animation === ChatProgressAnimation.DrawMonochrome;
			return {
				visibility: animation === ChatProgressAnimation.DrawMonochromeNoIcon ? 'hidden' : 'visible',
				scheduledFrames: 0,
				faces: [{ transform: 'none', opacity: '1', animation: 'none', clip: 'none' }],
				assembled: draw,
				faceDisplay: 'block',
				drawDisplay: 'none',
			};
		}));
	});
});
