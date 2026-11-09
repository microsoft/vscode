/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { getWindow } from '../../../../browser/dom.js';
import { createPixelSpinner } from '../../../../browser/ui/pixelSpinner/pixelSpinner.js';
import { mainWindow } from '../../../../browser/window.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('PixelSpinner', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	for (const variant of ['grid', 'ring'] as const) {
		test(`${variant} pauses offscreen, resumes when visible and stays paused after disposal`, async () => {
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			container.className = 'monaco-enable-motion';
			container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100px; height: 40px; overflow: hidden;';
			disposables.add(toDisposable(() => container.remove()));
			const spinner = disposables.add(createPixelSpinner(container, { variant, ariaLabel: 'Working' }));
			spinner.element.style.marginTop = '80px';
			const states = async () => {
				for (let i = 0; i < 5; i++) {
					await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
				}
				return spinner.element.getAnimations({ subtree: true }).map(animation => animation.playState);
			};
			const offscreen = await states();
			spinner.element.style.marginTop = '0';
			const visible = await states();
			spinner.dispose();
			container.remove();
			mainWindow.document.body.appendChild(container);
			const disposed = await states();

			assert.deepStrictEqual({
				offscreen, visible, disposed,
				role: spinner.element.getAttribute('role'),
				label: spinner.element.getAttribute('aria-label'),
			}, {
				offscreen: Array(6).fill('paused'),
				visible: Array(6).fill('running'),
				disposed: Array(6).fill('paused'),
				role: 'status',
				label: 'Working',
			});
		});

		test(`${variant} preserves default delays and reads inherited motion parameters`, () => {
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			container.className = 'monaco-enable-motion';
			disposables.add(toDisposable(() => container.remove()));
			const spinner = disposables.add(createPixelSpinner(container, { variant }));
			const dots = Array.from(spinner.element.children);
			const targetWindow = getWindow(spinner.element);
			const delays = () => dots.map(dot => targetWindow.getComputedStyle(dot).animationDelay);
			const initialDelays = delays();
			container.style.setProperty('--vscode-motion-matrix-duration', '2800ms');
			container.style.setProperty('--vscode-motion-matrix-stagger', '200ms');
			container.style.setProperty('--vscode-motion-matrix-ring-duration', '2400ms');
			assert.deepStrictEqual({
				initialDelays,
				delays: delays(),
				duration: targetWindow.getComputedStyle(dots[0]).animationDuration,
			}, {
				initialDelays: variant === 'ring' ? ['0s', '0.2s', '1s', '0.4s', '0.8s', '0.6s'] : ['0.52s', '0.65s', '0.26s', '0.39s', '0s', '0.13s'],
				delays: variant === 'ring' ? ['0s', '0.4s', '2s', '0.8s', '1.6s', '1.2s'] : ['0.8s', '1s', '0.4s', '0.6s', '0s', '0.2s'],
				duration: variant === 'ring' ? '2.4s' : '2.8s',
			});
		});

		test(`${variant} has one opacity cadence without moving the group or its dots`, () => {
			const container = mainWindow.document.body.appendChild(mainWindow.document.createElement('div'));
			container.className = 'monaco-enable-motion';
			disposables.add(toDisposable(() => container.remove()));
			const spinner = disposables.add(createPixelSpinner(container, { variant }));
			const dots = Array.from(spinner.element.children);
			const animations = spinner.element.getAnimations({ subtree: true });
			animations.forEach(animation => animation.pause());
			const frames = [0, 100, 800, 1400, 2000].map(time => {
				animations.forEach(animation => { animation.currentTime = time; });
				return [spinner.element, ...dots].map(element => {
					const bounds = element.getBoundingClientRect();
					return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
				});
			});
			assert.deepStrictEqual({
				groupAnimations: spinner.element.getAnimations().length,
				dotAnimations: dots.map(dot => dot.getAnimations().length),
				stablePositions: frames.every(frame => JSON.stringify(frame) === JSON.stringify(frames[0])),
				opacityOnly: animations.every(animation => (animation.effect as KeyframeEffect).getKeyframes().every(frame => !frame.transform || frame.transform === 'none')),
			}, { groupAnimations: 0, dotAnimations: Array(6).fill(1), stablePositions: true, opacityOnly: true });
		});

		test(`${variant} respects workbench reduced motion and restores its original animation`, () => {
			const container = mainWindow.document.createElement('div');
			container.className = 'monaco-enable-motion';
			container.style.color = 'rgb(12, 34, 56)';
			mainWindow.document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			const spinner = disposables.add(createPixelSpinner(container, { variant }));
			const targetWindow = getWindow(spinner.element);
			const getDots = () => Array.from(spinner.element.children, dot => {
				const style = targetWindow.getComputedStyle(dot);
				return {
					animation: style.animationName,
					duration: style.animationDuration,
					easing: style.animationTimingFunction,
					opacity: style.opacity,
					transform: style.transform,
					width: style.width,
					height: style.height,
					color: style.backgroundColor,
				};
			});
			const getTiming = () => getDots().map(({ animation, duration, easing }) => ({ animation, duration, easing }));
			const initialTiming = getTiming();
			container.className = 'monaco-reduce-motion';
			const reducedDots = getDots();
			container.className = 'monaco-enable-motion';

			assert.deepStrictEqual({
				initialTiming,
				reducedDots,
				restoredTiming: getTiming(),
				ariaHidden: spinner.element.getAttribute('aria-hidden'),
			}, {
				initialTiming: Array.from({ length: 6 }, (_, index) => ({
					animation: variant === 'ring' ? 'monaco-pixel-spinner-ring-pulse' : index === 4 ? 'monaco-pixel-spinner-dot-cycle-long' : index === 5 ? 'monaco-pixel-spinner-dot-cycle-short' : 'monaco-pixel-spinner-dot-cycle',
					duration: variant === 'ring' ? '1.2s' : '1.82s',
					easing: variant === 'ring' ? 'steps(4, jump-none)' : 'steps(6, jump-none)',
				})),
				reducedDots: Array.from({ length: 6 }, () => ({
					animation: 'none', duration: '0s', easing: 'ease', opacity: '1',
					transform: 'matrix(1, 0, 0, 1, 0, 0)', width: '2px', height: '2px', color: 'rgb(12, 34, 56)',
				})),
				restoredTiming: initialTiming,
				ariaHidden: 'true',
			});
		});

		test(`${variant} retains the standalone OS reduced-motion policy`, () => {
			const container = mainWindow.document.createElement('div');
			mainWindow.document.body.appendChild(container);
			disposables.add(toDisposable(() => container.remove()));
			const spinner = disposables.add(createPixelSpinner(container, { variant }));
			const targetWindow = getWindow(spinner.element);
			const reduced = targetWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
			assert.deepStrictEqual(Array.from(spinner.element.children, dot => {
				const style = targetWindow.getComputedStyle(dot);
				return {
					animation: style.animationName,
					duration: style.animationDuration,
					staticVisible: !reduced || style.opacity === '1' && style.transform === 'matrix(1, 0, 0, 1, 0, 0)',
				};
			}), Array.from({ length: 6 }, (_, index) => ({
				animation: reduced ? 'none' : variant === 'ring' ? 'monaco-pixel-spinner-ring-pulse' : index === 4 ? 'monaco-pixel-spinner-dot-cycle-long' : index === 5 ? 'monaco-pixel-spinner-dot-cycle-short' : 'monaco-pixel-spinner-dot-cycle',
				duration: reduced ? '0s' : variant === 'ring' ? '1.2s' : '1.82s',
				staticVisible: true,
			})));
		});
	}
});
