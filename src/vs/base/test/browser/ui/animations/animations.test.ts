/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { triggerConfettiAnimation } from '../../../../browser/ui/animations/animations.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Animations', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('creates consecutive rainbow confetti animations', () => {
		const target = document.createElement('button');
		document.body.appendChild(target);
		const overlaysBefore = document.querySelectorAll('.animation-overlay').length;
		const overlays: HTMLElement[] = [];
		disposables.add(toDisposable(() => {
			target.remove();
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
				colorCount: new Set(particles.map(particle => particle.style.backgroundColor)).size,
				shapes: Array.from(new Set(particles.map(particle => particle.style.borderRadius))).sort(),
			};
		}), [
			{ particleCount: 24, allParticlesAreConfetti: true, allDelaysBackfilled: true, colorCount: 6, shapes: ['1px', '50%'] },
			{ particleCount: 24, allParticlesAreConfetti: true, allDelaysBackfilled: true, colorCount: 6, shapes: ['1px', '50%'] },
		]);
	});
});
