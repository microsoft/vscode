/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createSessionArchiveAnimation, type ISessionArchiveAnimationHandle } from '../../browser/views/sessionArchiveAnimation.js';

class TestAnimationHandle extends EventTarget implements ISessionArchiveAnimationHandle {
	cancelled = false;

	cancel(): void {
		this.cancelled = true;
		this.dispatchEvent(new Event('cancel'));
	}

	finish(): void {
		this.dispatchEvent(new Event('finish'));
	}
}

function setBounds(element: HTMLElement, x: number, y: number, width: number, height: number): void {
	element.getBoundingClientRect = () => new DOMRect(x, y, width, height);
}

suite('Sessions - SessionArchiveAnimation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('lifts, folds, and lands at the archive action', async () => {
		const element = document.createElement('div');
		const overlayHost = document.createElement('div');
		setBounds(element, 10, 20, 300, 40);

		const animationHandles = [new TestAnimationHandle(), new TestAnimationHandle()];
		const createdAnimations: { className: string; left: string; top: string; keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] = [];
		const animation = createSessionArchiveAnimation(element, { left: 286, top: 32, width: 16, height: 16 }, overlayHost, (_element, createdKeyframes, createdOptions) => {
			createdAnimations.push({ className: _element.className, left: _element.style.left, top: _element.style.top, keyframes: createdKeyframes, options: createdOptions });
			return animationHandles[createdAnimations.length - 1];
		});
		assert.ok(animation);
		store.add(animation);
		const pulseAttachedToOverlayHost = overlayHost.querySelector('.session-archive-catch-pulse')?.parentElement === overlayHost;

		animationHandles[0].finish();
		animationHandles[1].finish();
		await animation.finished;
		const beforeDispose = {
			hasAnimationClass: element.classList.contains('session-archive-animation'),
			transformOrigin: element.style.transformOrigin,
			pulseCount: overlayHost.querySelectorAll('.session-archive-catch-pulse').length,
			pulseAttachedToOverlayHost,
			createdAnimations,
			cancelled: animationHandles.map(handle => handle.cancelled),
		};

		animation.dispose();
		assert.deepStrictEqual({
			beforeDispose,
			afterDispose: {
				hasAnimationClass: element.classList.contains('session-archive-animation'),
				transformOrigin: element.style.transformOrigin,
				pulseCount: overlayHost.querySelectorAll('.session-archive-catch-pulse').length,
				cancelled: animationHandles.map(handle => handle.cancelled),
			},
		}, {
			beforeDispose: {
				hasAnimationClass: true,
				transformOrigin: '284px 20px',
				pulseCount: 0,
				pulseAttachedToOverlayHost: true,
				createdAnimations: [{
					className: '',
					left: '',
					top: '',
					keyframes: [
						{ opacity: 1, transform: 'translate3d(0, 0, 0) scale(1) rotate(0deg)' },
						{ opacity: 1, transform: 'translate3d(0, -1px, 0) scale(1.008) rotate(-0.25deg)', offset: 0.18 },
						{ opacity: 0.88, transform: 'translate3d(0, 0, 0) scale(0.98, 0.28) rotate(0.5deg)', offset: 0.62 },
						{ opacity: 0, transform: 'translate3d(0, 0, 0) scale(0.04) rotate(1deg)' },
					],
					options: {
						duration: 240,
						easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
						fill: 'forwards',
					},
				}, {
					className: 'session-archive-catch-pulse',
					left: '294px',
					top: '40px',
					keyframes: [
						{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.55)' },
						{ opacity: 0.38, transform: 'translate(-50%, -50%) scale(0.82)', offset: 0.35 },
						{ opacity: 0, transform: 'translate(-50%, -50%) scale(1.35)' },
					],
					options: {
						delay: 110,
						duration: 150,
						easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
						fill: 'both',
					},
				}],
				cancelled: [false, false],
			},
			afterDispose: {
				hasAnimationClass: false,
				transformOrigin: '',
				pulseCount: 0,
				cancelled: [true, true],
			},
		});
	});

	test('disposal settles pending motion and removes the landing ripple', async () => {
		const element = document.createElement('div');
		const overlayHost = document.createElement('div');
		setBounds(element, 10, 20, 300, 40);
		const animationHandles = [new TestAnimationHandle(), new TestAnimationHandle()];
		let animationIndex = 0;
		const animation = createSessionArchiveAnimation(element, { left: 286, top: 32, width: 16, height: 16 }, overlayHost, () => animationHandles[animationIndex++]);
		assert.ok(animation);

		animation.dispose();
		await animation.finished;

		assert.deepStrictEqual({
			hasAnimationClass: element.classList.contains('session-archive-animation'),
			transformOrigin: element.style.transformOrigin,
			pulseCount: overlayHost.querySelectorAll('.session-archive-catch-pulse').length,
			cancelled: animationHandles.map(handle => handle.cancelled),
		}, {
			hasAnimationClass: false,
			transformOrigin: '',
			pulseCount: 0,
			cancelled: [true, true],
		});
	});

	test('restores the row when the landing ripple cannot start', () => {
		const element = document.createElement('div');
		const overlayHost = document.createElement('div');
		element.style.transformOrigin = 'left top';
		setBounds(element, 10, 20, 300, 40);
		const rowAnimation = new TestAnimationHandle();
		let animationIndex = 0;

		assert.throws(() => createSessionArchiveAnimation(element, { left: 286, top: 32, width: 16, height: 16 }, overlayHost, () => {
			if (animationIndex++ === 0) {
				return rowAnimation;
			}
			throw new Error('Landing ripple failed');
		}), /Landing ripple failed/);

		assert.deepStrictEqual({
			hasAnimationClass: element.classList.contains('session-archive-animation'),
			transformOrigin: element.style.transformOrigin,
			pulseCount: overlayHost.querySelectorAll('.session-archive-catch-pulse').length,
			rowAnimationCancelled: rowAnimation.cancelled,
		}, {
			hasAnimationClass: false,
			transformOrigin: 'left top',
			pulseCount: 0,
			rowAnimationCancelled: true,
		});
	});

	test('skips animation when the archive action is not rendered', () => {
		const element = document.createElement('div');
		const overlayHost = document.createElement('div');
		setBounds(element, 10, 20, 300, 40);
		let factoryCalled = false;

		const animation = createSessionArchiveAnimation(element, { left: 0, top: 0, width: 0, height: 0 }, overlayHost, () => {
			factoryCalled = true;
			return new TestAnimationHandle();
		});

		assert.deepStrictEqual({ animation, factoryCalled }, { animation: undefined, factoryCalled: false });
	});
});
