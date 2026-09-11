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

	test('allows consecutive confetti animations', () => {
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

		assert.strictEqual(overlays.length, 2);
	});
});
