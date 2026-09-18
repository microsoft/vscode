/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../browser/dom.js';
import { triggerConfettiAnimation } from '../../../../browser/ui/animations/animations.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Animations', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates consecutive rainbow confetti animations', () => {
		const workbench = document.createElement('div');
		workbench.className = 'monaco-workbench';
		[
			['--vscode-charts-red', '#ff0000'],
			['--vscode-charts-orange', '#ff8800'],
			['--vscode-charts-yellow', '#ffff00'],
			['--vscode-charts-green', '#00ff00'],
			['--vscode-charts-blue', '#0000ff'],
			['--vscode-charts-purple', '#8800ff'],
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
						&& duration >= 1980
						&& duration < 2480
						&& keyframes?.length === 4
						&& keyframes[2].computedOffset < 0.2
						&& keyframes[2].easing === 'linear';
				}),
				colorCount: new Set(particles.map(particle => getWindow(particle).getComputedStyle(particle).backgroundColor)).size,
				inheritsWorkbenchTheme: overlay.parentElement === workbench,
				shapes: Array.from(new Set(particles.map(particle => particle.style.borderRadius))).sort(),
			};
		}), [
			{ particleCount: 24, allParticlesAreConfetti: true, allDelaysBackfilled: true, allParticlesUseBalancedTiming: true, colorCount: 6, inheritsWorkbenchTheme: true, shapes: ['1px', '50%'] },
			{ particleCount: 24, allParticlesAreConfetti: true, allDelaysBackfilled: true, allParticlesUseBalancedTiming: true, colorCount: 6, inheritsWorkbenchTheme: true, shapes: ['1px', '50%'] },
		]);
	});

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
		const getTranslateY = (keyframe: ComputedKeyframe | undefined): number | undefined => {
			const match = /translate\(calc\(-50% [+-] .+?px\), calc\(-50% (?<operator>[+-]) (?<translateY>\d+(?:\.\d+)?)px\)\)/.exec(keyframe?.transform?.toString() ?? '');
			return match?.groups ? Number(`${match.groups.operator}${match.groups.translateY}`) : undefined;
		};

		assert.deepStrictEqual({
			durations: Array.from(new Set(particles.map(particle => particle.getAnimations()[0]?.effect?.getTiming().duration))),
			offsets: keyframes?.map(keyframe => keyframe.computedOffset),
			fallEasing: keyframes?.[2]?.easing,
			allParticlesFallConfiguredDistance: particles.every(particle => {
				const keyframes = (particle.getAnimations()[0]?.effect as KeyframeEffect | undefined)?.getKeyframes();
				const apexY = getTranslateY(keyframes?.[2]);
				const endY = getTranslateY(keyframes?.at(-1));
				return apexY !== undefined && endY !== undefined && Math.abs(endY - apexY - 100) < 1e-10;
			}),
		}, {
			durations: [1900],
			offsets: [0, 0.08421052631578947, 0.21052631578947367, 1],
			fallEasing: 'linear',
			allParticlesFallConfiguredDistance: true,
		});
	});
});
