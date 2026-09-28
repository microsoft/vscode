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
import { getChatWorkingLogoRibbonFrame } from '../../../browser/widget/chatWorkingLogoRibbon.js';
import { ChatConfiguration, ChatProgressAnimation } from '../../../common/constants.js';

suite('ChatWorkingLogo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const drawStyles = [ChatProgressAnimation.Draw, ChatProgressAnimation.DrawMonochrome];
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
		const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		store.add(toDisposable(() => parent.remove()));
		const logo = store.add(new ChatWorkingLogo(animation, 'stable', {
			now: () => now,
			isMotionReduced: () => motionReduced,
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
				duration: logo.durationMs,
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
				{ animation: 'off', duration: 2400, filter: 'none', visibility: 'visible', animations: 0 },
				{ animation: 'draw', duration: 2400, filter: 'none', visibility: 'visible', animations: 3 },
				{ animation: 'drawMonochrome', duration: 2400, filter: 'grayscale(1)', visibility: 'visible', animations: 3 },
				{ animation: 'drawMonochromeNoIcon', duration: 2400, filter: 'grayscale(1)', visibility: 'hidden', animations: 0 },
				{ animation: 'ribbon', duration: 2400, filter: 'none', visibility: 'visible', animations: 0 },
				{ animation: 'draw', duration: 2400, filter: 'none', visibility: 'visible', animations: 3 },
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
		for (const animation of ['weave', 'orbit', 'accordion', 'dial']) {
			await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, animation);
			results.push(getConfiguredProgressAnimation(configuration, logger));
		}
		assert.deepStrictEqual(results, Array(4).fill(ChatProgressAnimation.Draw));
	});

	test('unsupported animation settings are logged and leave the logo static', async () => {
		const { configuration } = createConfiguration();
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, 'unsupported');
		const warnings: string[] = [];
		const logger = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const logo = store.add(new ChatWorkingProgressLogo('stable', configuration, logger, accessibilityService));
		assert.deepStrictEqual({ animation: logo.domNode.dataset.animation, static: logo.domNode.classList.contains('chat-working-logo-static'), warnings }, {
			animation: 'off',
			static: true,
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
			faceCounts: Array(Object.values(ChatProgressAnimation).length * 2).fill(3),
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

	test('Ribbon preserves Draw appearance with parabolic velocity and separate loops', () => {
		const draw = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'stable'));
		const { logo: ribbon, advanceTo, hasPendingFrame } = createDynamicLogo(ChatProgressAnimation.Ribbon);
		const ribbonPaths = [...ribbon.domNode.querySelectorAll<SVGPathElement>('.chat-working-logo-ribbon-band')];
		const renderedFaces = [...ribbon.domNode.querySelectorAll<SVGPathElement>('.chat-working-logo-ribbon-face')];
		const svg = ribbon.domNode.querySelector<SVGSVGElement>('.chat-working-logo-ribbon-container > svg');
		assert.ok(svg);
		const initial = ribbonPaths.map(path => path.getAttribute('d') ?? '');
		advanceTo(600);
		const moving = ribbonPaths.map(path => path.getAttribute('d') ?? '');
		ribbon.setActive(true);
		const afterRedundantActivation = ribbonPaths.map(path => path.getAttribute('d') ?? '');
		advanceTo(1200);
		const continued = ribbonPaths.map(path => path.getAttribute('d') ?? '');
		ribbon.setActive(false);
		const tied = ribbonPaths.map(path => path.getAttribute('d') ?? '');
		const sampleFrames = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(getChatWorkingLogoRibbonFrame);
		const fullLength = getChatWorkingLogoRibbonFrame(0.5).head;
		const coordinates = sampleFrames.flatMap(frame => Object.values(frame.paths))
			.flatMap(path => [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)])
			.flatMap(match => [Number(match[1]), Number(match[2])]);
		const frameIntervalMs = 1000 / 30;
		const sampledTie = Array.from({ length: Math.ceil(ribbon.ribbonDurationMs * 0.4 / frameIntervalMs) + 1 }, (_, index) =>
			getChatWorkingLogoRibbonFrame(Math.min(index * frameIntervalMs / ribbon.ribbonDurationMs, 0.4)));
		let maximumTravel = 0;
		for (let index = 1; index < sampledTie.length; index++) {
			maximumTravel = Math.max(maximumTravel, Math.abs(sampledTie[index].head - sampledTie[index - 1].head));
		}
		const compactDevicePixelScale = 0.84 * 12 / 84 * 2;
		const tieStartSpeed = getChatWorkingLogoRibbonFrame(0.00001).head / fullLength / 0.00001;
		const longQuadraticStartSpeed = (2 / 0.42) / 7600;
		assert.deepStrictEqual({
			duration: [draw.durationMs, ribbon.ribbonDurationMs],
			sameColor: draw.domNode.style.color === ribbon.domNode.style.color,
			lazyArtwork: [draw, ribbon].map(logo => !!logo.domNode.querySelector('.chat-working-logo-ribbon-container')),
			viewBox: svg.getAttribute('viewBox'),
			shapeRendering: svg.getAttribute('shape-rendering'),
			overflow: mainWindow.getComputedStyle(svg).overflow,
			maskFills: ribbonPaths.map(path => path.getAttribute('fill')),
			maskStrokes: ribbonPaths.map(path => path.getAttribute('stroke')),
			maskStrokeWidths: ribbonPaths.map(path => path.getAttribute('stroke-width')),
			maskStrokeJoins: ribbonPaths.map(path => path.getAttribute('stroke-linejoin')),
			maskTransforms: ribbonPaths.map(path => path.getAttribute('transform')),
			renderedFills: renderedFaces.map(path => path.getAttribute('fill')),
			renderedGeometryMatchesDraw: renderedFaces.every((path, index) =>
				path.getAttribute('d') === draw.domNode.querySelectorAll('.chat-working-logo-face path')[index].getAttribute('d')),
			cssAnimations: ribbon.domNode.getAnimations({ subtree: true }).length,
			pathChanged: moving.some((path, index) => path !== initial[index]),
			redundantActivationPreservedFrame: afterRedundantActivation.every((path, index) => path === moving[index]),
			continuedAfterRedundantActivation: continued.some((path, index) => path !== moving[index]),
			tiedBands: tied.map(path => path.length > 0),
			allMotionWithinMark: coordinates.every(value => value > -1.5 && value < 101.5),
			tieCubic: [0.1, 0.2, 0.3].map(progress => Math.round(getChatWorkingLogoRibbonFrame(progress).head / fullLength * 1000) / 1000),
			hold: [0.4, 0.475, 0.55].map(progress => {
				const frame = getChatWorkingLogoRibbonFrame(progress);
				return [frame.tail, frame.head];
			}),
			untieCubic: [0.65, 0.75, 0.85].map(progress => Math.round(getChatWorkingLogoRibbonFrame(progress).tail / fullLength * 1000) / 1000),
			loopRest: [0.95, 0.975, 0.999].map(progress => {
				const frame = getChatWorkingLogoRibbonFrame(progress);
				return {
					endsTogether: frame.tail === frame.head,
					empty: Object.values(frame.paths).every(path => path.length === 0),
				};
			}),
			endpointSpeeds: {
				fastestSpeedup: Math.round(tieStartSpeed / ribbon.ribbonDurationMs / longQuadraticStartSpeed * 1000) / 1000,
				tieSlowest: Math.round((fullLength - getChatWorkingLogoRibbonFrame(0.39999).head) / fullLength / 0.00001 * 1000) / 1000,
				untieSlowest: Math.round(getChatWorkingLogoRibbonFrame(0.55001).tail / fullLength / 0.00001 * 1000) / 1000,
			},
			maximumTieDevicePixelTravelAt30Fps: Math.round(maximumTravel * compactDevicePixelScale * 1000) / 1000,
			pendingAfterStop: hasPendingFrame(),
		}, {
			duration: [2400, 4000],
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
			renderedGeometryMatchesDraw: true,
			cssAnimations: 0,
			pathChanged: true,
			redundantActivationPreservedFrame: true,
			continuedAfterRedundantActivation: true,
			tiedBands: [true, true, true],
			allMotionWithinMark: true,
			tieCubic: [0.578, 0.875, 0.984],
			hold: Array.from({ length: 3 }, () => [0, fullLength]),
			untieCubic: [0.016, 0.125, 0.422],
			loopRest: Array.from({ length: 3 }, () => ({ endsTogether: true, empty: true })),
			endpointSpeeds: {
				fastestSpeedup: 2.992,
				tieSlowest: 0,
				untieSlowest: 0,
			},
			maximumTieDevicePixelTravelAt30Fps: 3.875,
			pendingAfterStop: false,
		});
	});

	for (const animation of drawStyles) {
		test(`${animation} builds and undraws in the same three-beat order without fading or moving the faces`, () => {
			const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
			store.add(toDisposable(() => parent.remove()));
			const samples = [
				{ time: 0, reveal: [0, 0, 0] },
				{ time: 160, reveal: [0.5, 0, 0] },
				{ time: 320, reveal: [1, 0, 0] },
				{ time: 480, reveal: [1, 0.5, 0] },
				{ time: 640, reveal: [1, 1, 0] },
				{ time: 800, reveal: [1, 1, 0.5] },
				{ time: 960, reveal: [1, 1, 1] },
				{ time: 1200, reveal: [1, 1, 1] },
				{ time: 1440, reveal: [1, 1, 1] },
				{ time: 1600, reveal: [0.5, 1, 1] },
				{ time: 1760, reveal: [0, 1, 1] },
				{ time: 1920, reveal: [0, 0.5, 1] },
				{ time: 2080, reveal: [0, 0, 1] },
				{ time: 2240, reveal: [0, 0, 0.5] },
				{ time: 2400, reveal: [0, 0, 0] },
				{ time: 2560, reveal: [0.5, 0, 0] },
			];
			const sizes = [12, 16, 64];
			const observations = sizes.flatMap(size => {
				const logo = store.add(new ChatWorkingLogo(animation));
				logo.domNode.style.width = logo.domNode.style.height = `${size}px`;
				parent.appendChild(logo.domNode);
				const faces = ['descending', 'spine', 'ascending'].map(name => {
					const face = logo.domNode.querySelector<HTMLElement>(`.chat-working-logo-${name}`);
					assert.ok(face);
					return face;
				});
				const animations = logo.domNode.getAnimations({ subtree: true });
				assert.strictEqual(animations.length, 3);
				for (const animation of animations) {
					animation.pause();
				}
				return samples.map(sample => {
					for (const animation of animations) {
						animation.currentTime = sample.time;
					}
					const styles = faces.map(face => mainWindow.getComputedStyle(face));
					const reveal = styles.map(style => {
						assert.ok(style.clipPath.startsWith('inset('), style.clipPath);
						const [top, right = top, bottom = top, left = right] = style.clipPath.slice(6, -1).split(/\s+/).map(value => Number.parseFloat(value));
						return Math.round((1 - Math.max(top + bottom, left + right) / 100) * 1000) / 1000;
					});
					return {
						size, time: sample.time, reveal,
						opacity: styles.map(style => Math.round(Number(style.opacity) * 1000) / 1000),
						stationary: styles.every(style => style.transform === 'none'),
					};
				});
			});
			assert.deepStrictEqual(observations, sizes.flatMap(size => samples.map(sample => ({
				size, time: sample.time, reveal: sample.reveal, opacity: Array(3).fill(1), stationary: true,
			}))));
		});

		test(`${animation} draw and erase sweep each ribbon in the same counterclockwise direction`, () => {
			const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
			store.add(toDisposable(() => parent.remove()));
			const samples = [
				{ face: 'descending', time: 160, insets: [0, 50, 0, 0] },
				{ face: 'spine', time: 480, insets: [50, 0, 0, 0] },
				{ face: 'ascending', time: 800, insets: [0, 0, 0, 50] },
				{ face: 'descending', time: 1600, insets: [0, 0, 0, 50] },
				{ face: 'spine', time: 1920, insets: [0, 0, 50, 0] },
				{ face: 'ascending', time: 2240, insets: [0, 50, 0, 0] },
			];
			const sizes = [12, 16, 64];
			const observations = sizes.flatMap(size => {
				const logo = store.add(new ChatWorkingLogo(animation));
				logo.domNode.style.width = logo.domNode.style.height = `${size}px`;
				parent.appendChild(logo.domNode);
				const animations = logo.domNode.getAnimations({ subtree: true });
				assert.strictEqual(animations.length, 3);
				for (const animation of animations) {
					animation.pause();
				}
				return samples.map(sample => {
					for (const animation of animations) {
						animation.currentTime = sample.time;
					}
					const face = logo.domNode.querySelector(`.chat-working-logo-${sample.face}`);
					assert.ok(face);
					const clip = mainWindow.getComputedStyle(face).clipPath;
					const [top, right = top, bottom = top, left = right] = clip.slice(6, -1).split(/\s+/).map(value => Math.round(Number.parseFloat(value)));
					return { size, face: sample.face, time: sample.time, insets: [top, right, bottom, left] };
				});
			});
			assert.deepStrictEqual(observations, sizes.flatMap(size => samples.map(sample => ({ size, ...sample }))));
		});
	}

	test('draw resolves to a full static logo when stopped, reduced, or disabled', () => {
		const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		store.add(toDisposable(() => parent.remove()));
		const logo = store.add(new ChatWorkingLogo(ChatProgressAnimation.Draw, 'insider'));
		parent.appendChild(logo.domNode);
		const faces = [...logo.domNode.querySelectorAll('.chat-working-logo-face')];
		const snapshot = () => faces.map(face => {
			const style = mainWindow.getComputedStyle(face);
			return { clip: style.clipPath, opacity: style.opacity };
		});
		for (const animation of logo.domNode.getAnimations({ subtree: true })) {
			animation.pause();
			animation.currentTime = logo.durationMs * 0.3;
		}
		logo.setActive(false);
		const stopped = snapshot();
		logo.setActive(true);
		parent.classList.add('monaco-reduce-motion');
		const reduced = snapshot();
		const reducedAnimations = logo.domNode.getAnimations({ subtree: true }).length;
		parent.classList.remove('monaco-reduce-motion');
		logo.setAnimation(ChatProgressAnimation.Off);
		const disabled = snapshot();
		const sameFaces = [...logo.domNode.querySelectorAll('.chat-working-logo-face')].every((face, index) => face === faces[index]);
		logo.dispose();
		const assembled = Array.from({ length: 3 }, () => ({ clip: 'none', opacity: '1' }));
		assert.deepStrictEqual({ stopped, reduced, reducedAnimations, disabled, sameFaces, connected: logo.domNode.isConnected }, {
			stopped: assembled, reduced: assembled, reducedAnimations: 0, disabled: assembled, sameFaces: true, connected: false,
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

	test('disposal cancels a scheduled Ribbon frame', () => {
		const { logo, hasPendingFrame } = createDynamicLogo(ChatProgressAnimation.Ribbon);
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
			const ribbonContainer = logo.domNode.querySelector<HTMLElement>('.chat-working-logo-ribbon-container');
			return {
				visibility: mainWindow.getComputedStyle(logo.domNode).visibility,
				scheduledFrames,
				faces: [...logo.domNode.querySelectorAll('.chat-working-logo-face')].map(face => {
					const style = mainWindow.getComputedStyle(face);
					return { transform: style.transform, opacity: style.opacity, animation: style.animationName, clip: style.clipPath };
				}),
				tiedRibbonPaths: [...logo.domNode.querySelectorAll<SVGPathElement>('.chat-working-logo-ribbon-band')].map(path => (path.getAttribute('d') ?? '').length > 0),
				ribbonDisplay: ribbonContainer ? mainWindow.getComputedStyle(ribbonContainer).display : 'none',
			};
		});
		assert.deepStrictEqual(snapshots, Object.values(ChatProgressAnimation).map(animation => ({
			visibility: animation === ChatProgressAnimation.DrawMonochromeNoIcon ? 'hidden' : 'visible',
			scheduledFrames: 0,
			faces: Array.from({ length: 3 }, () => ({ transform: 'none', opacity: '1', animation: 'none', clip: 'none' })),
			tiedRibbonPaths: animation === ChatProgressAnimation.Ribbon ? [true, true, true] : [],
			ribbonDisplay: animation === ChatProgressAnimation.Ribbon ? 'block' : 'none',
		})));
	});
});
