/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import '../../../browser/widget/media/chat.css';
import { $, getWindow } from '../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';

async function waitForWorkingBorderStyles(input: HTMLElement): Promise<void> {
	const targetWindow = getWindow(input);
	for (let attempt = 0; attempt < 60; attempt++) {
		if (targetWindow.getComputedStyle(input, '::before').animationName === 'chat-input-working-border-spin') {
			return;
		}
		await new Promise<void>(resolve => targetWindow.requestAnimationFrame(() => resolve()));
	}
	assert.fail('Chat working border styles were not loaded.');
}

suite('Chat working border styling', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('runs both color phases, suppresses reduced motion, and preserves high-contrast feedback', async () => {
		const workbench = $('.monaco-workbench.monaco-enable-motion.vs-dark');
		workbench.style.setProperty('--vscode-strokeThickness', '1px');
		workbench.style.setProperty('--vscode-input-border', '#444444');
		workbench.style.setProperty('--vscode-contrastActiveBorder', '#ffffff');
		const session = $('.interactive-session');
		const inputPart = $('.interactive-input-part');
		const input = $('.chat-input-container.working');
		input.style.setProperty('--chat-input-anim-duration', '3.7s');
		input.style.setProperty('--chat-input-working-border-listening-color', '#58a6ff');
		input.style.setProperty('--chat-input-working-border-speaking-color', '#e258ff');
		inputPart.appendChild(input);
		session.appendChild(inputPart);
		workbench.appendChild(session);
		mainWindow.document.body.appendChild(workbench);
		store.add(toDisposable(() => workbench.remove()));

		const targetWindow = getWindow(workbench);
		const readPseudo = () => {
			const style = targetWindow.getComputedStyle(input, '::before');
			return {
				animationDuration: style.animationDuration,
				animationName: style.animationName,
				display: style.display,
			};
		};
		const readAnimatedColor = () => targetWindow.getComputedStyle(input, '::before').getPropertyValue('--chat-input-anim-color').trim();

		await waitForWorkingBorderStyles(input);
		const active = readPseudo();
		const animations = input.getAnimations({ subtree: true });
		for (const animation of animations) {
			animation.pause();
			animation.currentTime = 925;
		}
		const listening = readAnimatedColor();
		for (const animation of animations) {
			animation.currentTime = 2775;
		}
		const speaking = readAnimatedColor();

		workbench.classList.remove('monaco-enable-motion');
		workbench.classList.add('monaco-reduce-motion');
		const reducedMotion = {
			beam: readPseudo(),
			working: input.classList.contains('working'),
		};

		workbench.classList.remove('vs-dark');
		workbench.classList.add('hc-black');
		const highContrast = {
			beam: readPseudo(),
			borderColor: targetWindow.getComputedStyle(input).borderColor,
		};

		workbench.classList.remove('hc-black');
		workbench.classList.add('vs-dark');
		input.classList.remove('working');
		const idle = readPseudo();

		assert.deepStrictEqual({ active, listening, speaking, reducedMotion, highContrast, idle }, {
			active: {
				animationDuration: '3.7s',
				animationName: 'chat-input-working-border-spin',
				display: 'block',
			},
			listening: 'rgb(88, 166, 255)',
			speaking: 'rgb(226, 88, 255)',
			reducedMotion: {
				beam: {
					animationDuration: '0s',
					animationName: 'none',
					display: 'block',
				},
				working: true,
			},
			highContrast: {
				beam: {
					animationDuration: '0s',
					animationName: 'none',
					display: 'none',
				},
				borderColor: 'rgb(255, 255, 255)',
			},
			idle: {
				animationDuration: '0s',
				animationName: 'none',
				display: 'block',
			},
		});
	});
});
