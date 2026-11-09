/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MotionController } from '../../../../browser/ui/animations/motion.js';
import { mainWindow } from '../../../../browser/window.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { IMotionRecipe } from '../../../../common/motion.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Motion controller', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function create(reduced = false) {
		const element = mainWindow.document.createElement('div');
		element.style.cssText = 'width:40px;height:40px;opacity:1';
		mainWindow.document.body.appendChild(element);
		store.add(toDisposable(() => element.remove()));
		return { element, controller: store.add(new MotionController(element, reduced)) };
	}

	function recipe(loop = false): IMotionRecipe {
		return {
			id: 'test',
			effect: { frames: [{ opacity: 0, transform: 'translateX(8px)' }, { opacity: 1, transform: 'translateX(0px)' }], duration: 1000, delay: 0, easing: 'linear', iterations: loop ? Infinity : 1, direction: 'normal' },
			reducedEffect: { frames: [{ opacity: 1, transform: 'none' }], duration: 0, delay: 0, easing: 'linear', iterations: 1, direction: 'normal' },
		};
	}

	test('finish settles and disposal releases the owned fill effect', async () => {
		const { element, controller } = create();
		const result = controller.play(recipe());
		controller.finish();
		const outcome = await result;
		controller.dispose();
		assert.deepStrictEqual({ outcome, animations: element.getAnimations().length, opacity: element.style.opacity }, { outcome: 'finished', animations: 0, opacity: '1' });
	});

	test('replacement starts at the interrupted visual state and cancels the previous request', async () => {
		const { element, controller } = create();
		const previous = controller.play(recipe());
		controller.pause();
		const animation = element.getAnimations()[0];
		animation.currentTime = 500;
		const opacity = mainWindow.getComputedStyle(element).opacity;
		const current = controller.play(recipe());
		const frames = (element.getAnimations()[0].effect as KeyframeEffect).getKeyframes();
		controller.finish();
		assert.deepStrictEqual({ previous: await previous, current: await current, from: String(frames[0].opacity) }, { previous: 'cancelled', current: 'finished', from: opacity });
	});

	for (const direction of ['reverse', 'alternate-reverse'] as const) {
		test(`${direction} replacement snapshots the starting endpoint without changing its destination`, async () => {
			const { element, controller } = create();
			const previous = controller.play(recipe());
			controller.pause();
			element.getAnimations()[0].currentTime = 400;
			const opacity = mainWindow.getComputedStyle(element).opacity;
			const current = controller.play({ ...recipe(), effect: { ...recipe().effect, direction } });
			const frames = (element.getAnimations()[0].effect as KeyframeEffect).getKeyframes();
			controller.finish();
			assert.deepStrictEqual({
				previous: await previous, current: await current,
				start: String(frames.at(-1)!.opacity), destination: String(frames[0].opacity),
				final: mainWindow.getComputedStyle(element).opacity,
			}, { previous: 'cancelled', current: 'finished', start: opacity, destination: '0', final: '0' });
		});
	}

	test('pause, resume and reverse use the same owned animation', async () => {
		const { element, controller } = create();
		const playing = controller.play(recipe());
		controller.pause();
		const paused = controller.state;
		element.getAnimations()[0].currentTime = 500;
		controller.resume();
		const reversed = controller.reverse();
		controller.finish();
		assert.deepStrictEqual({ paused, playing: await playing, reversed: await reversed, opacity: mainWindow.getComputedStyle(element).opacity }, { paused: 'paused', playing: 'finished', reversed: 'finished', opacity: '0' });
	});

	test('an aborted request and disposal settle rather than leaking an animation', async () => {
		const { element, controller } = create();
		const abort = new AbortController();
		const result = controller.play(recipe(), abort.signal);
		abort.abort();
		const disposed = controller.play(recipe());
		controller.dispose();
		assert.deepStrictEqual({ aborted: await result, disposed: await disposed, animations: element.getAnimations().length }, { aborted: 'cancelled', disposed: 'cancelled', animations: 0 });
		assert.throws(() => controller.play(recipe()), /disposed/);
	});

	test('interruption prevents a stale sequence from launching its next phase', async () => {
		const { controller } = create();
		const sequence = controller.playSequence([recipe(), recipe()]);
		controller.pause();
		const replacement = controller.play(recipe());
		controller.finish();
		assert.deepStrictEqual({ sequence: await sequence, replacement: await replacement }, { sequence: 'cancelled', replacement: 'finished' });
	});

	test('finite sequences advance once and finish without polling or timers', async () => {
		const { element, controller } = create();
		const sequence = controller.playSequence([recipe(), recipe()]);
		const first = element.getAnimations()[0];
		controller.finish();
		await first.finished;
		await new Promise<void>(resolve => mainWindow.requestAnimationFrame(() => resolve()));
		controller.finish();
		assert.strictEqual(await sequence, 'finished');
	});

	test('reduced motion ends looping progress and preserves the visible state', async () => {
		const { element, controller } = create();
		const result = controller.play(recipe(true));
		controller.pause();
		assert.throws(() => controller.finish(), /Looping motion/);
		controller.setReducedMotion(true);
		controller.finish();
		assert.deepStrictEqual({ result: await result, opacity: mainWindow.getComputedStyle(element).opacity, transform: mainWindow.getComputedStyle(element).transform }, { result: 'finished', opacity: '1', transform: 'none' });
		await assert.rejects(controller.playSequence([recipe(true)]), /Looping motion/);
	});

	test('reduced motion at start uses the explicit alternative without delay', async () => {
		const { element, controller } = create(true);
		const result = controller.play(recipe(true));
		controller.finish();
		assert.deepStrictEqual({ result: await result, timing: element.getAnimations()[0].effect?.getTiming().duration, iterations: element.getAnimations()[0].effect?.getTiming().iterations }, { result: 'finished', timing: 0, iterations: 1 });
	});

	test('enabling reduced motion during reversal settles at the reversed endpoint', async () => {
		const { element, controller } = create();
		const playing = controller.play(recipe());
		controller.pause();
		element.getAnimations()[0].currentTime = 500;
		const reversed = controller.reverse();
		controller.setReducedMotion(true);
		controller.finish();
		assert.deepStrictEqual({ playing: await playing, reversed: await reversed, opacity: mainWindow.getComputedStyle(element).opacity }, { playing: 'finished', reversed: 'finished', opacity: '0' });
	});

	test('a reversed fade preserves component-owned positioning when motion is reduced', async () => {
		const { element, controller } = create();
		element.style.transform = 'translateX(24px)';
		const fade: IMotionRecipe = {
			...recipe(),
			effect: { ...recipe().effect, frames: [{ opacity: 0 }, { opacity: 1 }] },
			reducedEffect: { ...recipe().reducedEffect, frames: [{ opacity: 1 }] },
		};
		const playing = controller.play(fade);
		controller.pause();
		element.getAnimations()[0].currentTime = 500;
		const reversed = controller.reverse();
		controller.setReducedMotion(true);
		controller.finish();
		assert.deepStrictEqual({
			playing: await playing, reversed: await reversed,
			opacity: mainWindow.getComputedStyle(element).opacity,
			transform: mainWindow.getComputedStyle(element).transform,
		}, { playing: 'finished', reversed: 'finished', opacity: '0', transform: 'matrix(1, 0, 0, 1, 24, 0)' });
	});

	test('repeated replacement retains only one animation and releases abort ownership', async () => {
		const { element, controller } = create();
		const abort = new AbortController();
		const previous = controller.play(recipe(), abort.signal);
		const current = controller.play(recipe());
		abort.abort();
		const retained = element.getAnimations().length;
		controller.finish();
		assert.deepStrictEqual({ previous: await previous, current: await current, retained }, { previous: 'cancelled', current: 'finished', retained: 1 });
	});
});
