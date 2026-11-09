/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Switch } from '../../../../browser/ui/toggle/switch.js';
import { mainWindow } from '../../../../browser/window.js';
import { toDisposable } from '../../../../common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../common/utils.js';

suite('Switch', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createSwitch(): Switch {
		const control = disposables.add(new Switch({ ariaLabel: 'Switch', title: false }));
		const container = mainWindow.document.createElement('div');
		container.className = 'monaco-enable-motion';
		container.style.cssText = `
			--vscode-spacing-size280: 28px;
			--vscode-spacing-size160: 16px;
			--vscode-strokeThickness: 1px;
			--vscode-cornerRadius-circle: 9999px;
		`;
		container.appendChild(control.domNode);
		mainWindow.document.body.appendChild(container);
		disposables.add(toDisposable(() => container.remove()));
		return control;
	}

	test('standalone thumb feedback reverses without moving layout or delaying state', () => {
		const control = createSwitch();
		const button = control.domNode;
		const thumb = button.firstElementChild as HTMLElement;
		const bounds = button.getBoundingClientRect().toJSON();
		const off = thumb.getBoundingClientRect().x;
		const changes: boolean[] = [];
		disposables.add(control.onChange(checked => changes.push(checked)));

		button.click();
		const forward = thumb.getAnimations()[0] as CSSTransition;
		assert.ok(forward);
		forward.pause();
		forward.currentTime = 60;
		const halfway = thumb.getBoundingClientRect().x;
		const during = {
			checked: control.checked, aria: button.getAttribute('aria-checked'),
			bounds: button.getBoundingClientRect().toJSON(), layoutLeft: thumb.offsetLeft,
			property: forward.transitionProperty, duration: forward.effect!.getTiming().duration,
			easing: forward.effect!.getTiming().easing, moving: halfway > off && halfway < off + 12,
		};

		button.click();
		const reversed = thumb.getBoundingClientRect().x;
		const backward = thumb.getAnimations()[0];
		assert.ok(backward);
		backward.finish();

		assert.deepStrictEqual({
			during, changes, continuous: Math.abs(halfway - reversed) < 0.001,
			checked: control.checked, aria: button.getAttribute('aria-checked'),
			finalX: thumb.getBoundingClientRect().x, animations: thumb.getAnimations().length,
		}, {
			during: { checked: true, aria: 'true', bounds, layoutLeft: 0, property: 'transform', duration: 120, easing: 'ease', moving: true },
			changes: [true, false], continuous: true,
			checked: false, aria: 'false', finalX: off, animations: 0,
		});
	});

	test('reduced motion during thumb travel immediately applies the checked position', () => {
		const control = createSwitch();
		const button = control.domNode;
		const thumb = button.firstElementChild as HTMLElement;
		const off = thumb.getBoundingClientRect().x;
		control.checked = true;
		const animation = thumb.getAnimations()[0];
		assert.ok(animation);
		animation.pause();
		animation.currentTime = 60;
		const halfway = thumb.getBoundingClientRect().x;
		button.parentElement!.classList.add('monaco-reduce-motion');

		assert.deepStrictEqual({
			checked: control.checked, aria: button.getAttribute('aria-checked'),
			movingBeforeReduction: halfway > off && halfway < off + 12,
			travel: thumb.getBoundingClientRect().x - off, layoutLeft: thumb.offsetLeft,
			animations: thumb.getAnimations().length,
		}, { checked: true, aria: 'true', movingBeforeReduction: true, travel: 12, layoutLeft: 0, animations: 0 });
	});
});
