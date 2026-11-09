/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { getWindow } from '../../../../browser/dom.js';
import { captureAnimationTarget, ClickAnimation, triggerClickAnimation, triggerConfettiAnimation } from '../../../../browser/ui/animations/animations.js';
import { Codicon } from '../../../../common/codicons.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Animations', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('keeps the completion target stationary while its confetti animates', () => {
		const workbench = document.body.appendChild(document.createElement('div'));
		workbench.className = 'monaco-workbench monaco-enable-motion';
		disposables.add(toDisposable(() => workbench.remove()));
		const target = workbench.appendChild(document.createElement('button'));

		disposables.add(triggerConfettiAnimation(target));

		assert.deepStrictEqual({
			targetAnimations: target.getAnimations().length,
			particleAnimations: [...workbench.querySelectorAll('.animation-confetti-particle')].filter(particle => particle.getAnimations().length === 1).length,
		}, { targetAnimations: 0, particleAnimations: 24 });
	});

	test('retains paused confetti until its animations finish', async () => {
		const clock = sinon.useFakeTimers();
		const workbench = document.body.appendChild(document.createElement('div'));
		workbench.className = 'monaco-workbench monaco-enable-motion';
		disposables.add(toDisposable(() => workbench.remove()));
		const target = workbench.appendChild(document.createElement('button'));
		disposables.add(triggerConfettiAnimation(target));
		const overlay = workbench.querySelector<HTMLElement>('.animation-overlay')!;
		const animations = overlay.getAnimations({ subtree: true });
		disposables.add(toDisposable(() => animations.forEach(animation => animation.cancel())));
		animations.forEach(animation => animation.pause());

		clock.tick(3000);
		const retainedWhilePaused = overlay.isConnected;
		animations.forEach(animation => animation.finish());
		await Promise.all(animations.map(animation => animation.finished));
		await Promise.resolve();

		assert.deepStrictEqual({ retainedWhilePaused, removedAfterFinish: !overlay.isConnected }, { retainedWhilePaused: true, removedAfterFinish: true });
	});

	test('creates consecutive pixelated rainbow confetti animations', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench monaco-enable-motion';
		[
			['--vscode-confetti-color1', '#ff0000'],
			['--vscode-confetti-color2', '#ff8800'],
			['--vscode-confetti-color3', '#ffff00'],
			['--vscode-confetti-color4', '#00ff00'],
			['--vscode-confetti-color5', '#0000ff'],
			['--vscode-confetti-color6', '#8800ff'],
		].forEach(([name, value]) => workbench.style.setProperty(name, value));
		const target = document.createElement('button');
		workbench.appendChild(target);
		document.body.appendChild(workbench);
		const overlaysBefore = document.querySelectorAll('.animation-overlay').length;
		const overlays: HTMLElement[] = [];
		disposables.add(toDisposable(() => {
			workbench.remove();
			overlays.forEach(overlay => overlay.remove());
		}));

		disposables.add(triggerConfettiAnimation(target));
		disposables.add(triggerConfettiAnimation(target));

		overlays.push(...Array.from(document.querySelectorAll<HTMLElement>('.animation-overlay')).slice(overlaysBefore));

		assert.deepStrictEqual(overlays.map(overlay => {
			const particles = Array.from(overlay.querySelectorAll<HTMLElement>('.animation-confetti-particle'));
			return {
				particleCount: particles.length,
				allParticlesAreConfetti: particles.length === overlay.children.length,
				allDelaysBackfilled: particles.every(particle => particle.getAnimations()[0]?.effect?.getTiming().fill === 'both'),
				allParticlesUseBalancedTiming: particles.every(particle => {
					const effect = particle.getAnimations()[0]?.effect as KeyframeEffect | undefined;
					const duration = effect?.getTiming().duration;
					const keyframes = effect?.getKeyframes();
					// WebKit rounds animation durations to microseconds.
					return typeof duration === 'number'
						&& duration >= 1150
						&& duration < 1510
						&& keyframes !== undefined
						&& keyframes.length >= 30
						&& keyframes.every((keyframe, index) =>
							keyframe.easing === 'steps(1)' && (index === 0 || (keyframe.computedOffset - keyframes[index - 1].computedOffset) * duration <= 40 + 1e-3));
				}),
				allParticlesHaveShortFalls: particles.every(particle => {
					const keyframes = (particle.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
					const positions = keyframes.map(keyframe => new DOMMatrix(keyframe.transform?.toString()).m42);
					return positions.length > 0 && positions[positions.length - 1] - Math.min(...positions) <= 72;
				}),
				allParticlesHaveUpwardLaunches: particles.every(particle => {
					const keyframes = (particle.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes() ?? [];
					return keyframes.some(keyframe => new DOMMatrix(keyframe.transform?.toString()).m42 <= -16);
				}),
				colorCount: new Set(particles.map(particle => getWindow(particle).getComputedStyle(particle).backgroundColor)).size,
				inheritsWorkbenchTheme: overlay.parentElement === workbench,
				sizes: Array.from(new Set(particles.map(particle => particle.style.width))).sort(),
				allParticlesArePixelSquares: particles.every(particle =>
					particle.style.width === particle.style.height && getWindow(particle).getComputedStyle(particle).borderRadius === '0px'),
				allParticlesStayAxisAligned: particles.every(particle => {
					const effect = particle.getAnimations()[0]?.effect as KeyframeEffect | undefined;
					return effect?.getKeyframes().every(keyframe =>
						!/\b(?:rotate|scale|skew)/.test(keyframe.transform?.toString() ?? ''));
				}),
			};
		}), [
			{ particleCount: 24, allParticlesAreConfetti: true, allDelaysBackfilled: true, allParticlesUseBalancedTiming: true, allParticlesHaveShortFalls: true, allParticlesHaveUpwardLaunches: true, colorCount: 6, inheritsWorkbenchTheme: true, sizes: ['4px'], allParticlesArePixelSquares: true, allParticlesStayAxisAligned: true },
			{ particleCount: 24, allParticlesAreConfetti: true, allDelaysBackfilled: true, allParticlesUseBalancedTiming: true, allParticlesHaveShortFalls: true, allParticlesHaveUpwardLaunches: true, colorCount: 6, inheritsWorkbenchTheme: true, sizes: ['4px'], allParticlesArePixelSquares: true, allParticlesStayAxisAligned: true },
		]);
	});

	test('uses dedicated confetti colors and updates an active burst when customized', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench monaco-enable-motion';
		['#123456', '#234567', '#345678', '#456789', '#56789a', '#6789ab'].forEach((color, index) =>
			workbench.style.setProperty(`--vscode-confetti-color${index + 1}`, color));
		workbench.style.setProperty('--vscode-charts-red', '#ffffff');
		const target = document.createElement('button');
		workbench.appendChild(target);
		document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		disposables.add(triggerConfettiAnimation(target));

		const particles = Array.from(workbench.querySelectorAll<HTMLElement>('.animation-confetti-particle'));
		const before = particles.map(particle => getWindow(particle).getComputedStyle(particle).backgroundColor);
		workbench.style.setProperty('--vscode-confetti-color1', '#fedcba');
		const after = particles.map(particle => getWindow(particle).getComputedStyle(particle).backgroundColor);
		assert.deepStrictEqual({
			palette: before.slice(0, 6),
			updatedFirstColor: after[0],
			updatedParticles: after.filter((color, index) => color !== before[index]).length,
			otherColorsUnchanged: after.every((color, index) => index % 6 === 0 || color === before[index]),
		}, {
			palette: ['rgb(18, 52, 86)', 'rgb(35, 69, 103)', 'rgb(52, 86, 120)', 'rgb(69, 103, 137)', 'rgb(86, 120, 154)', 'rgb(103, 137, 171)'],
			updatedFirstColor: 'rgb(254, 220, 186)',
			updatedParticles: 4,
			otherColorsUnchanged: true,
		});
	});

	for (const [name, animation] of [
		['confetti', ClickAnimation.Confetti],
		['floating icons', ClickAnimation.FloatingIcons],
		['pulse wave', ClickAnimation.PulseWave],
		['radiant lines', ClickAnimation.RadiantLines],
	] as const) {
		test(`preserves the captured position and theme for ${name} after removing the target`, () => {
			const workbench = document.createElement('div');
			workbench.className = 'monaco-workbench monaco-enable-motion';
			const target = document.createElement('button');
			target.style.cssText = 'position: fixed; left: 120px; top: 80px; width: 48px; height: 24px; box-sizing: border-box;';
			workbench.appendChild(target);
			document.body.appendChild(workbench);
			disposables.add(toDisposable(() => workbench.remove()));

			const animationTarget = captureAnimationTarget(target);
			target.remove();
			const effect = triggerClickAnimation(animationTarget, animation, Codicon.check);
			if (effect) {
				disposables.add(effect);
			}

			const overlay = document.querySelector<HTMLElement>('.animation-overlay');
			disposables.add(toDisposable(() => overlay?.remove()));
			assert.deepStrictEqual({
				bounds: overlay && [overlay.style.left, overlay.style.top, overlay.style.width, overlay.style.height],
				inheritsWorkbenchTheme: overlay?.parentElement === workbench,
			}, {
				bounds: ['120px', '80px', '48px', '24px'],
				inheritsWorkbenchTheme: true,
			});
		});
	}

	test('configures separate confetti launch and fall phases', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench monaco-enable-motion';
		workbench.style.setProperty('--vscode-motion-confetti-launch-min', '999ms');
		workbench.style.setProperty('--vscode-motion-confetti-launch-max', '999ms');
		workbench.style.setProperty('--vscode-motion-confetti-fall-min', '999ms');
		workbench.style.setProperty('--vscode-motion-confetti-fall-max', '999ms');
		const target = document.createElement('button');
		workbench.appendChild(target);
		document.body.appendChild(workbench);
		const overlaysBefore = document.querySelectorAll('.animation-overlay').length;
		disposables.add(toDisposable(() => workbench.remove()));

		disposables.add(triggerConfettiAnimation(target, {
			launchDuration: { min: 400, max: 400 },
			fallDuration: { min: 1500, max: 1500 },
			fallDistance: { min: 100, max: 100 },
		}));

		const overlay = Array.from(document.querySelectorAll<HTMLElement>('.animation-overlay')).slice(overlaysBefore)[0];
		disposables.add(toDisposable(() => overlay.remove()));
		const particles = Array.from(overlay.querySelectorAll<HTMLElement>('.animation-confetti-particle'));
		const keyframes = (particles[0].getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes();
		const apexOffset = 400 / 1900;

		assert.deepStrictEqual({
			durations: Array.from(new Set(particles.map(particle => particle.getAnimations()[0]?.effect?.getTiming().duration))),
			apexOffset: keyframes?.find(keyframe => keyframe.computedOffset === apexOffset)?.computedOffset,
			allFramesAreStepped: keyframes?.every(keyframe => keyframe.easing === 'steps(1)'),
			allParticlesFadeDuringDescent: particles.every(particle => {
				const keyframes = (particle.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes();
				const opacity = Number(keyframes?.find(keyframe => keyframe.computedOffset === 800 / 1900)?.opacity);
				return opacity > 0 && opacity < 1;
			}),
			fallAccelerates: particles.every(particle => {
				const keyframes = (particle.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes();
				const yAt = (time: number) => new DOMMatrix(keyframes?.find(keyframe => keyframe.computedOffset === time / 1900)?.transform?.toString()).m42;
				return yAt(1600) - yAt(1200) > yAt(800) - yAt(400);
			}),
			allParticlesFallConfiguredDistance: particles.every(particle => {
				const keyframes = (particle.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes();
				const apex = keyframes?.find(keyframe => keyframe.computedOffset === apexOffset);
				const end = keyframes?.at(-1);
				return apex !== undefined && end !== undefined
					&& new DOMMatrix(end.transform?.toString()).m42 - new DOMMatrix(apex.transform?.toString()).m42 === 100;
			}),
		}, {
			durations: [1900],
			apexOffset,
			allFramesAreStepped: true,
			allParticlesFadeDuringDescent: true,
			fallAccelerates: true,
			allParticlesFallConfiguredDistance: true,
		});
	});

	test('animates independent pixel trajectories from a common source without a spacing lattice', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench monaco-enable-motion';
		const target = document.createElement('button');
		target.style.cssText = 'position: fixed; left: 120.5px; top: 80.5px; width: 49px; height: 25px;';
		workbench.appendChild(target);
		document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		disposables.add(triggerConfettiAnimation(target, {
			launchDuration: { min: 400, max: 400 },
			fallDuration: { min: 1500, max: 1500 },
			fallDistance: { min: 100, max: 100 },
		}));

		const particles = Array.from(workbench.querySelectorAll<HTMLElement>('.animation-confetti-particle'));
		const animations = particles.map(particle => particle.getAnimations()[0]);
		animations.forEach(animation => animation.pause());
		const sample = (time: number) => {
			animations.forEach(animation => animation.currentTime = time);
			return particles.map(particle => {
				const { x, y, width, height } = particle.getBoundingClientRect();
				return { x, y, width, height, visible: Number(getWindow(particle).getComputedStyle(particle).opacity) > 0 };
			});
		};

		const initial = sample(0);
		const trajectories: string[][] = particles.map(() => []);
		let allPositionsOnGrid = true;
		let allParticlesSeparated = true;
		for (let time = 0; time <= 1900; time += 20) {
			const positions = sample(time);
			allPositionsOnGrid &&= positions.every(position =>
				position.x % 4 === 0 && position.y % 4 === 0 && position.width === 4 && position.height === 4);
			allParticlesSeparated &&= positions.every((position, index) => positions.slice(index + 1).every(other =>
				!position.visible || !other.visible || position.x + position.width <= other.x || other.x + other.width <= position.x
				|| position.y + position.height <= other.y || other.y + other.height <= position.y));
			positions.forEach((position, index) => trajectories[index].push(`${position.x - initial[index].x},${position.y - initial[index].y}`));
		}
		const beforeStep = sample(120);
		const heldFrame = sample(140);
		const afterStep = sample(200);
		assert.deepStrictEqual({
			startsFromOneSource: new Set(initial.map(position => `${position.x},${position.y}`)).size === 1,
			distinctTrajectories: new Set(trajectories.map(trajectory => trajectory.join(';'))).size,
			allPositionsOnGrid,
			allParticlesSeparated,
			holdsBetweenSteps: JSON.stringify(beforeStep) === JSON.stringify(heldFrame),
			movesOnNextStep: JSON.stringify(heldFrame) !== JSON.stringify(afterStep),
		}, {
			startsFromOneSource: true,
			distinctTrajectories: 24,
			allPositionsOnGrid: true,
			allParticlesSeparated: true,
			holdsBetweenSteps: true,
			movesOnNextStep: true,
		});
	});

	test('reads typed inherited confetti parameters after the captured target is removed', () => {
		const workbench = document.body.appendChild(document.createElement('div'));
		workbench.className = 'monaco-workbench monaco-enable-motion';
		disposables.add(toDisposable(() => workbench.remove()));
		for (const [name, value] of Object.entries({
			'launch-min': '.4s', 'launch-max': '400ms',
			'fall-min': '1.5s', 'fall-max': '1500ms',
			'bounce-duration': '.5s', 'frame-duration': '100ms',
			'pixel-size': '8px', 'distance-min': '104px', 'distance-max': '104px',
			'arc-min': '32px', 'arc-max': '32px', 'drift': '0px',
		})) {
			workbench.style.setProperty(`--vscode-motion-confetti-${name}`, value);
		}
		sinon.stub(Math, 'random').returns(0.5);
		const target = workbench.appendChild(document.createElement('button'));
		const bounce = sinon.spy(target, 'animate');
		const captured = captureAnimationTarget(target);
		target.remove();

		disposables.add(triggerConfettiAnimation(captured));

		const particles = Array.from(workbench.querySelectorAll<HTMLElement>('.animation-confetti-particle'));
		const effect = particles[0].getAnimations()[0].effect as KeyframeEffect;
		const frames = effect.getKeyframes();
		const yAt = (time: number) => new DOMMatrix(frames.find(frame => frame.computedOffset === time / 1900)?.transform?.toString()).m42;
		assert.deepStrictEqual({
			count: particles.length,
			sizes: [...new Set(particles.map(particle => particle.style.width))],
			duration: effect.getTiming().duration,
			frameCount: frames.length,
			allFramesStepped: frames.every(frame => frame.easing === 'steps(1)'),
			apex: yAt(400),
			fallDistance: yAt(1900) - yAt(400),
			targetAnimations: bounce.callCount,
		}, {
			count: 24, sizes: ['8px'], duration: 1900, frameCount: 20, allFramesStepped: true,
			apex: -48, fallDistance: 104, targetAnimations: 0,
		});
	});

	for (const [parameter, value] of [
		['launch-min', 'bad'], ['launch-min', '-1ms'], ['launch-min', '0ms'],
		['launch-min', 'Infinityms'], ['launch-min', '1px'], ['launch-min', 'calc(1ms)'],
		['launch-min', '300ms'], ['pixel-size', '0px'], ['pixel-size', '4s'],
		['frame-duration', 'NaNms'], ['distance-max', '47px'], ['drift', '-8px'],
	]) {
		test(`rejects malformed confetti ${parameter}=${value} before creating effects`, () => {
			const workbench = document.body.appendChild(document.createElement('div'));
			workbench.className = 'monaco-workbench monaco-enable-motion';
			disposables.add(toDisposable(() => workbench.remove()));
			workbench.style.setProperty(`--vscode-motion-confetti-${parameter}`, value);
			const target = workbench.appendChild(document.createElement('button'));
			assert.throws(() => triggerConfettiAnimation(target), /Invalid confetti motion/);
			assert.deepStrictEqual({
				overlays: workbench.querySelectorAll('.animation-overlay').length,
				bounces: target.getAnimations().length,
			}, { overlays: 0, bounces: 0 });
		});
	}

	test('suppresses a reduced-motion burst without replaying it when motion is enabled', () => {
		const workbench = document.body.appendChild(document.createElement('div'));
		workbench.className = 'monaco-workbench monaco-reduce-motion';
		disposables.add(toDisposable(() => workbench.remove()));
		const target = workbench.appendChild(document.createElement('button'));
		const bounce = sinon.spy(target, 'animate');
		const captured = captureAnimationTarget(target);
		target.remove();
		disposables.add(triggerConfettiAnimation(captured));
		workbench.className = 'monaco-workbench monaco-enable-motion';
		const suppressed = { overlays: workbench.querySelectorAll('.animation-overlay').length, bounces: bounce.callCount };
		disposables.add(triggerConfettiAnimation(captured));
		assert.deepStrictEqual({
			suppressed,
			enabledParticles: workbench.querySelectorAll('.animation-confetti-particle').length,
			enabledBounces: bounce.callCount,
		}, { suppressed: { overlays: 0, bounces: 0 }, enabledParticles: 24, enabledBounces: 0 });
	});

	test('enabling reduced motion cancels a paused burst without replay or changing completion', async () => {
		const workbench = document.body.appendChild(document.createElement('div'));
		workbench.className = 'monaco-workbench monaco-enable-motion';
		disposables.add(toDisposable(() => workbench.remove()));
		const target = workbench.appendChild(document.createElement('button'));
		target.textContent = 'Completed';
		disposables.add(triggerConfettiAnimation(target));
		const animations = workbench.querySelector('.animation-overlay')!.getAnimations({ subtree: true });
		animations.forEach(animation => animation.pause());
		workbench.classList.replace('monaco-enable-motion', 'monaco-reduce-motion');
		await Promise.resolve();
		const removed = !workbench.querySelector('.animation-overlay');
		workbench.classList.replace('monaco-reduce-motion', 'monaco-enable-motion');
		await Promise.resolve();
		assert.deepStrictEqual({
			removed, replayed: !!workbench.querySelector('.animation-overlay'),
			cancelled: animations.every(animation => animation.playState === 'idle'),
			completion: target.textContent,
		}, { removed: true, replayed: false, cancelled: true, completion: 'Completed' });
	});

	test('disposing one burst leaves an independent invocation intact', () => {
		const workbench = document.body.appendChild(document.createElement('div'));
		workbench.className = 'monaco-workbench monaco-enable-motion';
		disposables.add(toDisposable(() => workbench.remove()));
		const target = workbench.appendChild(document.createElement('button'));
		const first = disposables.add(triggerConfettiAnimation(target));
		const firstAnimations = workbench.querySelector('.animation-overlay')!.getAnimations({ subtree: true });
		const second = disposables.add(triggerConfettiAnimation(target));
		first.dispose();
		const remaining = workbench.querySelectorAll('.animation-confetti-particle').length;
		second.dispose();
		assert.deepStrictEqual({
			remaining,
			cancelled: firstAnimations.every(animation => animation.playState === 'idle'),
			overlays: workbench.querySelectorAll('.animation-overlay').length,
		}, { remaining: 24, cancelled: true, overlays: 0 });
	});
});
