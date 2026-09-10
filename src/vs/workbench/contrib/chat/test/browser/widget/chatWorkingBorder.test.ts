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

suite('Chat working border styling', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('runs listening then speaking and falls back to a solid high-contrast border', () => {
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
		const reducedMotion = readPseudo();

		workbench.classList.remove('monaco-reduce-motion', 'vs-dark');
		workbench.classList.add('monaco-enable-motion', 'hc-black');
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
				animationDuration: '0s',
				animationName: 'none',
				display: 'block',
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
