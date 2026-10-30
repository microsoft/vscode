/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../browser/dom.js';
import { captureAnimationTarget, ClickAnimation, triggerClickAnimation, triggerConfettiAnimation } from '../../../../browser/ui/animations/animations.js';
import { Codicon } from '../../../../common/codicons.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Animations', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates consecutive pixelated rainbow confetti animations', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench';
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

		triggerConfettiAnimation(target);
		triggerConfettiAnimation(target);

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
					return typeof duration === 'number'
						&& duration >= 1150
						&& duration < 1510
						&& keyframes !== undefined
						&& keyframes.length >= 30
						&& keyframes.every((keyframe, index) =>
							keyframe.easing === 'steps(1)' && (index === 0 || (keyframe.computedOffset - keyframes[index - 1].computedOffset) * duration <= 40 + 1e-10));
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
		workbench.className = 'monaco-workbench';
		['#123456', '#234567', '#345678', '#456789', '#56789a', '#6789ab'].forEach((color, index) =>
			workbench.style.setProperty(`--vscode-confetti-color${index + 1}`, color));
		workbench.style.setProperty('--vscode-charts-red', '#ffffff');
		const target = document.createElement('button');
		workbench.appendChild(target);
		document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		triggerConfettiAnimation(target);

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
			workbench.className = 'monaco-workbench';
			const target = document.createElement('button');
			target.style.cssText = 'position: fixed; left: 120px; top: 80px; width: 48px; height: 24px; box-sizing: border-box;';
			workbench.appendChild(target);
			document.body.appendChild(workbench);
			disposables.add(toDisposable(() => workbench.remove()));

			const animationTarget = captureAnimationTarget(target);
			target.remove();
			triggerClickAnimation(animationTarget, animation, Codicon.check);

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
		workbench.className = 'monaco-workbench';
		const target = document.createElement('button');
		workbench.appendChild(target);
		document.body.appendChild(workbench);
		const overlaysBefore = document.querySelectorAll('.animation-overlay').length;
		disposables.add(toDisposable(() => workbench.remove()));

		triggerConfettiAnimation(target, {
			launchDuration: { min: 400, max: 400 },
			fallDuration: { min: 1500, max: 1500 },
			fallDistance: { min: 100, max: 100 },
		});

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
		workbench.className = 'monaco-workbench';
		const target = document.createElement('button');
		target.style.cssText = 'position: fixed; left: 120.5px; top: 80.5px; width: 49px; height: 25px;';
		workbench.appendChild(target);
		document.body.appendChild(workbench);
		disposables.add(toDisposable(() => workbench.remove()));

		triggerConfettiAnimation(target, {
			launchDuration: { min: 400, max: 400 },
			fallDuration: { min: 1500, max: 1500 },
			fallDistance: { min: 100, max: 100 },
		});

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
});
