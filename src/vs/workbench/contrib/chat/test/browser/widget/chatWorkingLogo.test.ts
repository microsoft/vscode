/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ConfigurationTarget } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatWorkingLogo, ChatWorkingLogoMotion, ChatWorkingProgressLogo, getConfiguredProgressAnimation } from '../../../browser/widget/chatWorkingLogo.js';
import { ChatConfiguration, ChatProgressAnimation } from '../../../common/constants.js';

function sampleOutline(face: HTMLElement): readonly { x: number; y: number }[] {
	const svg = face.querySelector('svg');
	const path = svg?.querySelector('path');
	assert.ok(svg && path);
	const box = svg.viewBox.baseVal;
	const length = path.getTotalLength();
	return Array.from({ length: 257 }, (_, index) => {
		const point = path.getPointAtLength(length * index / 256);
		return { x: (point.x - box.x) / box.width, y: (point.y - box.y) / box.height };
	});
}

/** Projects the ribbon outline through its HTML transform and the logo's perspective. */
function projectOutline(face: HTMLElement, outline: readonly { x: number; y: number }[], size: number, perspective: number, perspectiveOrigin: { x: number; y: number }): readonly { x: number; y: number }[] {
	const style = mainWindow.getComputedStyle(face);
	const [originX, originY, originZ = 0] = style.transformOrigin.split(' ').map(value => Number.parseFloat(value));
	const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform);
	return outline.map(point => {
		const x = point.x * size - originX;
		const y = point.y * size - originY;
		const z = -originZ;
		const w = matrix.m14 * x + matrix.m24 * y + matrix.m34 * z + matrix.m44;
		const transformedX = matrix.m11 * x + matrix.m21 * y + matrix.m31 * z + matrix.m41 + originX * w;
		const transformedY = matrix.m12 * x + matrix.m22 * y + matrix.m32 * z + matrix.m42 + originY * w;
		const transformedZ = matrix.m13 * x + matrix.m23 * y + matrix.m33 * z + matrix.m43 + originZ * w;
		const projectedW = w - transformedZ / perspective;
		assert.ok(projectedW > 0, 'Ribbon crossed the perspective camera plane');
		return {
			x: perspectiveOrigin.x + (transformedX - perspectiveOrigin.x * w) / projectedW,
			y: perspectiveOrigin.y + (transformedY - perspectiveOrigin.y * w) / projectedW,
		};
	});
}

suite('ChatWorkingLogo', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const ribbonStudies: readonly ChatWorkingLogoMotion[] = ['ladder', 'carousel', 'piston', 'bridge', 'fan', 'comb', 'braid', 'sling', 'folio', 'helix'];
	const alternatives: readonly ChatWorkingLogoMotion[] = ['aperture', 'accordion', 'dial', 'magnet', 'trace', 'pendulum', 'prism', ...ribbonStudies];
	const motions: readonly ChatWorkingLogoMotion[] = ['fold', 'weave', 'weave-v', 'draw', 'relay', 'stack', 'orbit', 'shutter', ...alternatives];

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

	test('configured progress defaults to static and switches motions without replacing its faces', async () => {
		const { configuration, fireChange } = createConfiguration();
		const logo = store.add(new ChatWorkingProgressLogo('stable', configuration, store.add(new NullLogService())));
		mainWindow.document.body.appendChild(logo.domNode);
		const faces = [...logo.domNode.children];
		const initial = { animation: logo.domNode.dataset.animation, animations: logo.domNode.getAnimations({ subtree: true }).length };
		const snapshots = [];
		for (const motion of Object.values(ChatProgressAnimation)) {
			await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, motion);
			fireChange();
			snapshots.push({
				animation: logo.domNode.dataset.animation,
				duration: logo.durationMs,
				classApplied: logo.domNode.classList.contains(motion === ChatProgressAnimation.Off ? 'chat-working-logo-static' : `chat-working-logo-${motion}`),
			});
		}
		const animations = logo.domNode.getAnimations({ subtree: true });
		fireChange(ChatConfiguration.ThinkingPhrases);
		const sameAnimations = logo.domNode.getAnimations({ subtree: true }).every((animation, index) => animation === animations[index]);
		logo.dispose();
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Weave);
		fireChange();
		assert.deepStrictEqual({
			initial, snapshots,
			sameFaces: [...logo.domNode.children].every((face, index) => face === faces[index]),
			sameAnimations,
			motionAfterDisposal: logo.domNode.dataset.animation,
		}, {
			initial: { animation: 'off', animations: 0 },
			snapshots: [
				{ animation: 'off', duration: 1200, classApplied: true },
				{ animation: 'weave', duration: 1200, classApplied: true },
				{ animation: 'draw', duration: 2400, classApplied: true },
				{ animation: 'orbit', duration: 3000, classApplied: true },
				{ animation: 'accordion', duration: 1500, classApplied: true },
				{ animation: 'dial', duration: 1600, classApplied: true },
			],
			sameFaces: true,
			sameAnimations: true,
			motionAfterDisposal: 'dial',
		});
	});

	test('changing the configured motion does not reactivate an inactive logo', async () => {
		const { configuration, fireChange } = createConfiguration();
		const logo = store.add(new ChatWorkingProgressLogo('insider', configuration, store.add(new NullLogService())));
		mainWindow.document.body.appendChild(logo.domNode);
		logo.setActive(false);
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, ChatProgressAnimation.Orbit);
		fireChange();
		assert.deepStrictEqual({
			motion: logo.domNode.dataset.motion,
			animations: logo.domNode.getAnimations({ subtree: true }).length,
			active: logo.domNode.classList.contains('chat-working-logo-active'),
			color: logo.domNode.style.color,
		}, {
			motion: 'orbit',
			animations: 0,
			active: false,
			color: 'var(--vscode-chat-workingProgressInsidersIconForeground)',
		});
	});

	test('unsupported animation settings are logged and leave the logo static', async () => {
		const { configuration } = createConfiguration();
		await configuration.setUserConfiguration(ChatConfiguration.PersistentProgress, 'weave-v');
		const warnings: string[] = [];
		const logger = store.add(new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}());
		const logo = store.add(new ChatWorkingProgressLogo('stable', configuration, logger));
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

	test('uses the same three Stable ribbon faces for every motion and tint', () => {
		const logos = motions.flatMap(motion => [
			store.add(new ChatWorkingLogo(motion, 'stable')),
			store.add(new ChatWorkingLogo(motion, 'insider')),
		]);
		const paths = logos.map(logo => [...logo.domNode.querySelectorAll('path')].map(path => path.getAttribute('d')));
		assert.deepStrictEqual({
			faceCounts: logos.map(logo => logo.domNode.children.length),
			sameGeometry: paths.every(value => JSON.stringify(value) === JSON.stringify(paths[0])),
			decorative: logos.every(logo => logo.domNode.getAttribute('aria-hidden') === 'true'),
			palettes: logos.slice(0, 2).map(logo => logo.domNode.style.color),
		}, {
			faceCounts: Array(motions.length * 2).fill(3),
			sameGeometry: true,
			decorative: true,
			palettes: ['var(--vscode-chat-workingProgressStableIconForeground)', 'var(--vscode-chat-workingProgressInsidersIconForeground)'],
		});
	});

	for (const motion of motions.filter(motion => motion !== 'draw')) {
		test(`${motion} animates only transforms and opacity on HTML wrappers`, () => {
			const logo = store.add(new ChatWorkingLogo(motion));
			mainWindow.document.body.appendChild(logo.domNode);
			const animations = logo.domNode.getAnimations({ subtree: true });
			const keyframes = animations.flatMap(animation => animation.effect instanceof KeyframeEffect ? animation.effect.getKeyframes() : []);
			const metadata = new Set(['offset', 'computedOffset', 'easing', 'composite']);
			const properties = new Set(keyframes.flatMap(frame => Object.keys(frame).filter(key => !metadata.has(key))));
			const motionReduced = mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
			assert.deepStrictEqual({
				animationCount: animations.length,
				onlyCompositorProperties: [...properties].every(property => property === 'transform' || property === 'opacity'),
				htmlTargets: animations.every(animation => animation.effect instanceof KeyframeEffect && animation.effect.target instanceof HTMLElement),
				durations: [...new Set(animations.map(animation => animation.effect?.getTiming().duration))],
			}, {
				animationCount: motionReduced ? 0 : 3,
				onlyCompositorProperties: true,
				htmlTargets: true,
				durations: motionReduced ? [] : [logo.durationMs],
			});
		});
	}

	test('draw builds and undraws in the same three-beat order without fading or moving the faces', () => {
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
			const logo = store.add(new ChatWorkingLogo('draw'));
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

	test('draw resolves to a full static logo when stopped, reduced, or replaced with Weave', () => {
		const parent = mainWindow.document.body.appendChild($('.monaco-enable-motion'));
		store.add(toDisposable(() => parent.remove()));
		const logo = store.add(new ChatWorkingLogo('draw', 'insider'));
		parent.appendChild(logo.domNode);
		const faces = [...logo.domNode.children];
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
		logo.setMotion('weave');
		const noClipping = snapshot().every(face => face.clip === 'none');
		const sameFaces = [...logo.domNode.children].every((face, index) => face === faces[index]);
		logo.dispose();
		const assembled = Array.from({ length: 3 }, () => ({ clip: 'none', opacity: '1' }));
		assert.deepStrictEqual({ stopped, reduced, reducedAnimations, noClipping, sameFaces, connected: logo.domNode.isConnected }, {
			stopped: assembled, reduced: assembled, reducedAnimations: 0, noClipping: true, sameFaces: true, connected: false,
		});
	});

	test('draw and erase sweep each ribbon in the same counterclockwise direction', () => {
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
			const logo = store.add(new ChatWorkingLogo('draw'));
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

	const testWithMotion = mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches ? test.skip : test;
	testWithMotion('ten additional ribbon studies give all three pieces distinct moving paths', () => {
		const paths = ribbonStudies.map(motion => {
			const logo = store.add(new ChatWorkingLogo(motion));
			logo.domNode.style.width = logo.domNode.style.height = '16px';
			mainWindow.document.body.appendChild(logo.domNode);
			const animations = logo.domNode.getAnimations({ subtree: true });
			assert.strictEqual(animations.length, 3);
			for (const animation of animations) {
				animation.pause();
			}
			const poses = [0, 0.25, 0.4, 0.55, 0.7].map(phase => {
				for (const animation of animations) {
					animation.currentTime = phase * logo.durationMs;
				}
				return [...logo.domNode.children].map(face => mainWindow.getComputedStyle(face).transform);
			});
			const signatures = poses[0].map((_, index) => JSON.stringify(poses.map(pose => pose[index])));
			return { motion, independentPaths: new Set(signatures).size, everyPieceMoves: poses[0].every((rest, index) => poses.some(pose => pose[index] !== rest)) };
		});
		assert.deepStrictEqual({ count: paths.length, paths }, {
			count: 10,
			paths: ribbonStudies.map(motion => ({ motion, independentPaths: 3, everyPieceMoves: true })),
		});
	});

	testWithMotion('weave rests assembled after the shared reset and at the loop seam', () => {
		const logo = store.add(new ChatWorkingLogo('weave'));
		mainWindow.document.body.appendChild(logo.domNode);
		const animations = logo.domNode.getAnimations({ subtree: true });
		assert.strictEqual(animations.length, 3);
		for (const animation of animations) {
			animation.pause();
		}
		const poses = [0, 0.8, 0.9, 0.94, 0.999, 1].map(phase => {
			for (const animation of animations) {
				animation.currentTime = logo.durationMs * phase;
			}
			return [...logo.domNode.children].map(face => {
				const style = mainWindow.getComputedStyle(face);
				return { identity: new DOMMatrix(style.transform).isIdentity, opacity: style.opacity };
			});
		});
		assert.deepStrictEqual(poses, Array.from({ length: 6 }, () => Array.from({ length: 3 }, () => ({ identity: true, opacity: '1' }))));
	});

	testWithMotion('weave holds three quick beats before resetting every piece together', () => {
		const logo = store.add(new ChatWorkingLogo('weave'));
		logo.domNode.style.width = logo.domNode.style.height = '16px';
		mainWindow.document.body.appendChild(logo.domNode);
		const animations = logo.domNode.getAnimations({ subtree: true });
		const beats = animations.map(animation => {
			assert.ok(animation.effect instanceof KeyframeEffect);
			const frames = animation.effect.getKeyframes();
			const peakIndex = frames.findIndex(frame => frame.transform !== frames[0].transform || frame.opacity !== frames[0].opacity);
			assert.ok(peakIndex > 0 && peakIndex < frames.length - 2);
			animation.pause();
			return {
				start: Math.round(frames[peakIndex - 1].computedOffset * logo.durationMs),
				peak: Math.round(frames[peakIndex].computedOffset * logo.durationMs),
				resetStart: Math.round(frames[peakIndex + 1].computedOffset * logo.durationMs),
				resetEnd: Math.round(frames[peakIndex + 2].computedOffset * logo.durationMs),
			};
		});
		const faces = [...logo.domNode.children];
		const pose = (face: Element) => {
			const style = mainWindow.getComputedStyle(face);
			return { transform: style.transform, opacity: style.opacity };
		};
		const holdsUntilReset = faces.map((face, index) => {
			const animation = animations[index];
			const beat = beats[index];
			animation.currentTime = beat.peak;
			const peakPose = pose(face);
			for (let time = beat.peak; time <= beat.resetStart; time += 10) {
				animation.currentTime = time;
				const currentPose = pose(face);
				if (currentPose.transform !== peakPose.transform || currentPose.opacity !== peakPose.opacity) {
					return false;
				}
			}
			return true;
		});
		const sequence: string[] = [];
		for (let frame = 0; frame <= 400; frame++) {
			for (const animation of animations) {
				animation.currentTime = logo.durationMs * frame / 200;
			}
			const displacedFaces = faces.flatMap((face, index) => {
				const currentPose = pose(face);
				return new DOMMatrix(currentPose.transform).isIdentity && currentPose.opacity === '1' ? [] : [index + 1];
			});
			const state = displacedFaces.join(',');
			if (sequence.at(-1) !== state) {
				sequence.push(state);
			}
		}
		assert.deepStrictEqual({
			durationMs: logo.durationMs,
			beats,
			pauseMs: logo.durationMs - beats[2].resetEnd,
			easing: faces.map(face => mainWindow.getComputedStyle(face).animationTimingFunction),
			holdsUntilReset,
			sequence,
		}, {
			durationMs: 1200,
			beats: [
				{ start: 0, peak: 210, resetStart: 690, resetEnd: 960 },
				{ start: 210, peak: 420, resetStart: 690, resetEnd: 960 },
				{ start: 420, peak: 630, resetStart: 690, resetEnd: 960 },
			],
			pauseMs: 240,
			easing: ['ease-in-out', 'ease-in-out', 'ease-in-out'],
			holdsUntilReset: [true, true, true],
			sequence: ['', '1', '1,2', '1,2,3', '', '1', '1,2', '1,2,3', ''],
		});
	});

	for (const motion of alternatives) {
		testWithMotion(`${motion} holds an identical assembled pose across its loop seam`, () => {
			const logo = store.add(new ChatWorkingLogo(motion));
			mainWindow.document.body.appendChild(logo.domNode);
			const animations = logo.domNode.getAnimations({ subtree: true });
			assert.strictEqual(animations.length, 3);
			for (const animation of animations) {
				animation.pause();
			}
			const phases = [0, 0.94, 0.999, 1, 1.001, 1.15];
			const poses = phases.map(phase => {
				for (const animation of animations) {
					animation.currentTime = logo.durationMs * phase;
				}
				return [...logo.domNode.children].map(face => {
					const style = mainWindow.getComputedStyle(face);
					return { identity: new DOMMatrix(style.transform).isIdentity, opacity: style.opacity };
				});
			});
			assert.deepStrictEqual(poses, phases.map(() => Array.from({ length: 3 }, () => ({ identity: true, opacity: '1' }))));
		});
	}

	testWithMotion('dial turns forward through three detents without reversing at the seam', () => {
		const logo = store.add(new ChatWorkingLogo('dial'));
		mainWindow.document.body.appendChild(logo.domNode);
		const frames = logo.domNode.getAnimations({ subtree: true }).map(animation => {
			assert.ok(animation.effect instanceof KeyframeEffect);
			return animation.effect.getKeyframes().map(frame => ({ phase: frame.computedOffset, transform: frame.transform }));
		});
		assert.deepStrictEqual(frames, Array.from({ length: 3 }, () => [
			{ phase: 0, transform: 'rotate(0deg)' },
			{ phase: 0.16, transform: 'rotate(0deg)' },
			{ phase: 0.28, transform: 'rotate(120deg)' },
			{ phase: 0.32, transform: 'rotate(120deg)' },
			{ phase: 0.44, transform: 'rotate(240deg)' },
			{ phase: 0.48, transform: 'rotate(240deg)' },
			{ phase: 0.6, transform: 'rotate(360deg)' },
			{ phase: 1, transform: 'rotate(360deg)' },
		]));
	});

	testWithMotion('Weave V preserves the original beat, hold and reset timing', () => {
		const timing = (['weave', 'weave-v'] as const).map(motion => {
			const logo = store.add(new ChatWorkingLogo(motion));
			mainWindow.document.body.appendChild(logo.domNode);
			return logo.domNode.getAnimations({ subtree: true }).map(animation => {
				assert.ok(animation.effect instanceof KeyframeEffect && animation.effect.target);
				return {
					duration: animation.effect.getTiming().duration,
					phases: animation.effect.getKeyframes().map(frame => frame.computedOffset),
					easing: mainWindow.getComputedStyle(animation.effect.target).animationTimingFunction,
				};
			});
		});
		assert.deepStrictEqual(timing[1], timing[0]);
	});

	testWithMotion('Weave V joins the diagonals below their outer tips through the hold', () => {
		const observations = [];
		for (const size of [12, 16, 64]) {
			const logo = store.add(new ChatWorkingLogo('weave-v'));
			logo.domNode.style.width = logo.domNode.style.height = `${size}px`;
			mainWindow.document.body.appendChild(logo.domNode);
			const faces = [...logo.domNode.querySelectorAll<HTMLElement>(':scope > .chat-working-logo-face')];
			const animations = logo.domNode.getAnimations({ subtree: true });
			assert.strictEqual(animations.length, 3);
			for (const animation of animations) {
				animation.pause();
			}
			const style = mainWindow.getComputedStyle(logo.domNode);
			const perspective = Number.parseFloat(style.perspective);
			const origin = { x: size / 2, y: size / 2 };
			// Approximate centerlines through the original ribbon end caps.
			const point = (x: number, y: number) => ({ x: (x - 6) / 84, y: (y - 6) / 84 });
			for (const phase of [0.35, 0.525, 0.575]) {
				for (const animation of animations) {
					animation.currentTime = phase * logo.durationMs;
				}
				const [rightTip, rightJoint] = projectOutline(faces[0], [point(73, 12), point(12, 64)], size, perspective, origin);
				const [leftTip, leftJoint] = projectOutline(faces[1], [point(12, 32), point(73, 84)], size, perspective, origin);
				observations.push({
					size, phase,
					joinGap: Math.hypot(rightJoint.x - leftJoint.x, rightJoint.y - leftJoint.y) / size,
					tipHeightDifference: Math.abs(rightTip.y - leftTip.y) / size,
					rise: Math.min(rightJoint.y, leftJoint.y) / size - Math.max(rightTip.y, leftTip.y) / size,
					minimumArmWidth: Math.min(leftJoint.x - leftTip.x, rightTip.x - rightJoint.x) / size,
				});
			}
		}
		assert.ok(observations.every(observation => observation.joinGap < 0.01 && observation.tipHeightDifference < 0.01 && observation.rise > 0.5 && observation.minimumArmWidth > 0.3), JSON.stringify(observations));
	});

	for (const motion of ['weave', 'weave-v', 'orbit', 'shutter', ...alternatives] as const) {
		testWithMotion(`${motion} keeps both diagonals behind the moving spine edge throughout its cycle`, () => {
			const observations = [];
			for (const size of [12, 16, 64]) {
				const logo = store.add(new ChatWorkingLogo(motion));
				logo.domNode.style.width = logo.domNode.style.height = `${size}px`;
				mainWindow.document.body.appendChild(logo.domNode);
				const faces = [...logo.domNode.querySelectorAll<HTMLElement>(':scope > .chat-working-logo-face')];
				const outlines = faces.map(sampleOutline);
				const animations = logo.domNode.getAnimations({ subtree: true });
				assert.strictEqual(animations.length, 3);
				for (const animation of animations) {
					animation.pause();
				}
				const style = mainWindow.getComputedStyle(logo.domNode);
				const perspective = Number.parseFloat(style.perspective);
				const [perspectiveX, perspectiveY] = style.perspectiveOrigin.split(' ').map(value => Number.parseFloat(value));
				const perspectiveOrigin = { x: perspectiveX, y: perspectiveY };
				let maximumOverrun = -Infinity;
				let minimumSpinePosition = Infinity;
				let maximumSpinePosition = -Infinity;
				let opaqueSpine = true;
				let assembledAtBoundary = true;
				for (let frame = 0; frame <= 200; frame++) {
					for (const animation of animations) {
						animation.currentTime = logo.durationMs * frame / 200;
					}
					const [top, bottom] = projectOutline(faces[2], [{ x: 1, y: 0 }, { x: 1, y: 1 }], size, perspective, perspectiveOrigin);
					const edgeX = bottom.x - top.x;
					const edgeY = bottom.y - top.y;
					const edgeLength = Math.hypot(edgeX, edgeY);
					for (let index = 0; index < 2; index++) {
						for (const point of projectOutline(faces[index], outlines[index], size, perspective, perspectiveOrigin)) {
							maximumOverrun = Math.max(maximumOverrun, ((point.x - top.x) * edgeY - (point.y - top.y) * edgeX) / edgeLength);
						}
					}
					const spinePosition = (top.x + bottom.x) / 2;
					minimumSpinePosition = Math.min(minimumSpinePosition, spinePosition);
					maximumSpinePosition = Math.max(maximumSpinePosition, spinePosition);
					opaqueSpine &&= mainWindow.getComputedStyle(faces[2]).opacity === '1';
					if (frame === 0 || frame === 200) {
						assembledAtBoundary &&= faces.every(face => new DOMMatrix(mainWindow.getComputedStyle(face).transform).isIdentity);
					}
				}
				observations.push({ size, maximumOverrun, spineTravel: maximumSpinePosition - minimumSpinePosition, opaqueSpine, assembledAtBoundary });
			}
			assert.ok(observations.every(result => result.maximumOverrun <= 0.02 && result.spineTravel > result.size * 0.04 && result.opaqueSpine && result.assembledAtBoundary), JSON.stringify(observations));
		});
	}

	test('stops motion and removes the mark on disposal', () => {
		const logo = store.add(new ChatWorkingLogo('weave'));
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

	test('reduced motion leaves every face assembled and opaque', () => {
		const parent = mainWindow.document.body.appendChild($('.monaco-reduce-motion'));
		store.add(toDisposable(() => parent.remove()));
		const faces = motions.flatMap(motion => {
			const logo = store.add(new ChatWorkingLogo(motion));
			parent.appendChild(logo.domNode);
			return [...logo.domNode.children];
		});
		assert.deepStrictEqual(faces.map(face => {
			const style = mainWindow.getComputedStyle(face);
			return { transform: style.transform, opacity: style.opacity, animation: style.animationName, clip: style.clipPath };
		}), faces.map(() => ({ transform: 'none', opacity: '1', animation: 'none', clip: 'none' })));
	});
});
