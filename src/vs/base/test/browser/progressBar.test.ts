/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ProgressBar } from '../../browser/ui/progressbar/progressbar.js';
import { mainWindow } from '../../browser/window.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../common/utils.js';

suite('ProgressBar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	let fixture: HTMLElement;

	setup(() => {
		fixture = document.createElement('div');
		mainWindow.document.body.appendChild(fixture);
	});

	teardown(() => {
		sinon.restore();
		fixture.remove();
	});

	test('Progress Bar', function () {
		const bar = new ProgressBar(fixture);
		assert(bar.infinite());
		assert(bar.total(100));
		assert(bar.worked(50));
		assert(bar.setWorked(70));
		assert(bar.worked(30));
		assert(bar.done());

		bar.dispose();
	});

	test('discrete progress starts and resets at zero without inflating fractional work', () => {
		const bar = store.add(new ProgressBar(fixture));
		bar.total(100);
		const container = bar.getContainer();
		const bit = container.querySelector<HTMLElement>('.progress-bit')!;
		const values = [0, 0.5, 50, 0, -1].map(value => {
			bar.setWorked(value);
			return { value: container.getAttribute('aria-valuenow'), width: bit.style.width };
		});
		bar.worked(1);
		values.push({ value: container.getAttribute('aria-valuenow'), width: bit.style.width });
		assert.deepStrictEqual(values, [
			{ value: '0', width: '0%' },
			{ value: '0.5', width: '0.5%' },
			{ value: '50', width: '50%' },
			{ value: '0', width: '0%' },
			{ value: '0', width: '0%' },
			{ value: '1', width: '1%' },
		]);
	});

	test('accessible progress matches the bounded fill and completion', () => {
		const bar = store.add(new ProgressBar(fixture, { ariaLabel: 'Downloading', progressBarBackground: undefined }));
		const container = bar.getContainer();
		const bit = container.querySelector<HTMLElement>('.progress-bit')!;
		bar.total(20).setWorked(30);
		const clamped = { value: container.getAttribute('aria-valuenow'), width: bit.style.width };
		bar.setWorked(10).done();
		const complete = container.getAttribute('aria-valuenow');
		bar.infinite();
		assert.deepStrictEqual({
			clamped, complete,
			unknownValue: container.getAttribute('aria-valuenow'),
			label: container.getAttribute('aria-label'),
		}, {
			clamped: { value: '20', width: '100%' },
			complete: '20',
			unknownValue: null,
			label: 'Downloading',
		});
	});

	test('reported work commits immediately while the fill interpolates and retargets from its displayed width', () => {
		fixture.className = 'monaco-enable-motion';
		fixture.style.width = '400px';
		const bar = store.add(new ProgressBar(fixture));
		const container = bar.getContainer();
		const bit = container.querySelector<HTMLElement>('.progress-bit')!;
		const width = () => parseFloat(mainWindow.getComputedStyle(bit).width);
		bar.total(100).setWorked(10);
		width();
		bar.setWorked(70);
		const first = bit.getAnimations()[0];
		first.pause();
		first.currentTime = Number(first.effect!.getTiming().duration) / 2;
		const midway = { value: container.getAttribute('aria-valuenow'), width: width() };
		bar.setWorked(90);
		const next = bit.getAnimations()[0];
		next.pause();
		next.currentTime = 0;
		const retargeted = { value: container.getAttribute('aria-valuenow'), width: width() };
		next.currentTime = Number(next.effect!.getTiming().duration);
		const settled = width();
		bar.done();
		fixture.className = 'monaco-reduce-motion';
		const completed = { value: container.getAttribute('aria-valuenow'), width: width(), animations: bit.getAnimations().length };

		assert.deepStrictEqual({ midway, retargeted, settled, completed }, {
			midway: { value: '70', width: 160 },
			retargeted: { value: '90', width: 160 },
			settled: 360,
			completed: { value: '100', width: 400, animations: 0 },
		});
	});

	test('stopping and restarting synchronously does not interpolate backwards from the previous operation', () => {
		fixture.className = 'monaco-enable-motion';
		fixture.style.width = '400px';
		const bar = store.add(new ProgressBar(fixture));
		const container = bar.getContainer();
		const bit = container.querySelector<HTMLElement>('.progress-bit')!;
		bar.total(100).setWorked(100);
		bit.getBoundingClientRect();
		bar.stop().total(100).setWorked(10);

		assert.deepStrictEqual({
			value: container.getAttribute('aria-valuenow'),
			width: bit.getBoundingClientRect().width,
			animations: bit.getAnimations().length,
		}, { value: '10', width: 40, animations: 0 });
	});

	test('unknown work moves a constant-size segment in one direction and wraps beyond the track', () => {
		fixture.className = 'monaco-enable-motion';
		fixture.style.width = '400px';
		const bar = store.add(new ProgressBar(fixture));
		bar.infinite();
		const container = bar.getContainer();
		const bit = container.querySelector<HTMLElement>('.progress-bit')!;
		const animation = bit.getAnimations()[0];
		animation.pause();
		const duration = Number(animation.effect!.getTiming().duration);
		const track = container.getBoundingClientRect();
		const frames = [0, 0.25, 0.5, 0.75, 0.999].map(phase => {
			animation.currentTime = phase * duration;
			const bounds = bit.getBoundingClientRect();
			return { width: bounds.width, left: bounds.left - track.left, right: bounds.right - track.left };
		});
		assert.deepStrictEqual({
			widths: frames.map(frame => frame.width),
			forwardOnly: frames.every((frame, index) => index === 0 || frame.left > frames[index - 1].left),
			entersFromOutside: frames[0].right <= 0,
			exitsBeforeWrapping: frames[4].left > track.width - 1,
			clippedByTrack: bit.offsetParent === container && mainWindow.getComputedStyle(container).overflow === 'hidden',
			reportedValue: container.getAttribute('aria-valuenow'),
		}, {
			widths: Array(5).fill(40), forwardOnly: true, entersFromOutside: true, exitsBeforeWrapping: true,
			clippedByTrack: true, reportedValue: null,
		});
	});

	for (const mode of ['infinite', 'discrete'] as const) {
		test(`new ${mode} work cancels stale completion and long-running state`, () => {
			const clock = sinon.useFakeTimers();
			const bar = store.add(new ProgressBar(fixture));
			bar.infinite().done();
			clock.tick(100);
			if (mode === 'infinite') {
				bar.infinite();
			} else {
				bar.total(100).setWorked(25);
			}
			clock.tick(200);
			const container = bar.getContainer();
			const bit = container.querySelector<HTMLElement>('.progress-bit')!;
			const active = container.classList.contains('active');
			clock.tick(10000);
			assert.deepStrictEqual({
				active,
				mode: container.classList.contains(mode),
				longRunning: container.classList.contains('infinite-long-running'),
				opacity: bit.style.opacity,
				value: container.getAttribute('aria-valuenow'),
			}, {
				active: true, mode: true, longRunning: mode === 'infinite',
				opacity: '1', value: mode === 'infinite' ? null : '25',
			});
		});
	}

	for (const action of ['done', 'stop', 'dispose'] as const) {
		test(`${action} cancels delayed visibility and cleans up scheduled work`, () => {
			const clock = sinon.useFakeTimers();
			const bar = store.add(new ProgressBar(fixture));
			bar.hide();
			bar.infinite();
			bar.show(500);
			bar[action]();
			clock.tick(11000);
			const container = bar.getContainer();
			assert.deepStrictEqual({
				hidden: container.style.display,
				active: container.classList.contains('active'),
				longRunning: container.classList.contains('infinite-long-running'),
				animations: container.getAnimations({ subtree: true }).length,
				timers: clock.countTimers(),
			}, {
				hidden: 'none', active: false, longRunning: false, animations: 0, timers: 0,
			});
		});
	}

	test('infinite progress pauses outside the viewport without stopping the operation', async () => {
		fixture.className = 'monaco-enable-motion';
		fixture.style.cssText = 'position: fixed; top: 0; left: 0; width: 100px; height: 40px; overflow: hidden;';
		const bar = store.add(new ProgressBar(fixture));
		const container = bar.getContainer();
		container.style.marginTop = '80px';
		bar.infinite();
		const states = async () => {
			for (let i = 0; i < 5; i++) {
				await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
			}
			return container.getAnimations({ subtree: true }).map(animation => animation.playState);
		};
		const offscreen = await states();
		container.style.marginTop = '0';
		const visible = await states();
		bar.dispose();
		assert.deepStrictEqual({
			offscreen, visible,
			disposedAnimations: container.getAnimations({ subtree: true }).length,
			disposedActive: container.classList.contains('active'),
		}, {
			offscreen: ['paused'], visible: ['running'], disposedAnimations: 0, disposedActive: false,
		});
	});

	test('reduced motion keeps real progress and restores the original timing', () => {
		fixture.className = 'monaco-enable-motion';
		const bar = store.add(new ProgressBar(fixture));
		const bit = bar.getContainer().querySelector<HTMLElement>('.progress-bit')!;
		const timing = () => {
			const style = mainWindow.getComputedStyle(bit);
			return { animation: style.animationName, duration: style.animationDuration, transition: style.transitionDuration };
		};
		bar.infinite();
		const initial = timing();
		fixture.className = 'monaco-reduce-motion';
		const reduced = timing();
		bar.total(100).setWorked(35);
		const discrete = { ...timing(), width: bit.style.width, value: bar.getContainer().getAttribute('aria-valuenow') };
		fixture.className = 'monaco-enable-motion';
		const restored = timing();
		assert.deepStrictEqual({ initial, reduced, discrete, restored }, {
			initial: { animation: 'progress', duration: '4s', transition: '0s' },
			reduced: { animation: 'none', duration: '0s', transition: '0s' },
			discrete: { animation: 'none', duration: '0s', transition: '0s', width: '35%', value: '35' },
			restored: { animation: 'none', duration: '0s', transition: '0.2s' },
		});
	});
});
