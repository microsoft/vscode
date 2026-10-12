/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ChatInputPart } from '../../../../browser/widget/input/chatInputPart.js';
import '../../../../browser/widget/media/chat.css';

suite('ChatInputPart', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the Sessions content gutter for composer layout', () => {
		const followupsContainer = dom.$('div');
		const editorLayouts: { width: number; height: number }[] = [];
		const inputPart = Object.assign(Object.create(ChatInputPart.prototype), {
			options: { isSessionsWindow: true },
			inputContainer: dom.$('div'),
			followupsContainer,
			_inputEditor: {
				getScrollWidth: () => 100,
				getContentHeight: () => 20,
				layout: (dimension: { width: number; height: number }) => editorLayouts.push(dimension),
			},
			inputEditorMaxHeight: 250,
			inputEditorMinHeight: undefined,
			singleLineInputEditorHeight: 20,
			inputEditorTrailingSpace: 0,
			ignoreInputEditorContentSizeChanges: false,
		}) as ChatInputPart;

		inputPart.layout(800);

		assert.deepStrictEqual({
			followupsWidth: followupsContainer.style.width,
			editorLayouts,
		}, {
			followupsWidth: '752px',
			editorLayouts: [{ width: 740, height: 20 }],
		});

		test('working borders rotate fixed gradients inside masks at any input aspect ratio', () => {
			const host = mainWindow.document.body.appendChild(dom.$('.monaco-workbench'));
			host.style.cssText = '--vscode-strokeThickness: 1px; --vscode-cornerRadius-large: 8px;';
			store.add(toDisposable(() => host.remove()));
			const session = dom.append(host, dom.$('.interactive-session'));
			const inputPart = dom.append(session, dom.$('.interactive-input-part'));
			const input = dom.append(inputPart, dom.$('.chat-input-container.working'));
			const beam = dom.append(input, dom.$('.chat-input-working-border'));
			const glow = dom.append(input, dom.$('.chat-input-working-border.chat-input-working-border-glow'));
			const geometry = [];
			for (const [width, height] of [[400, 80], [200, 300]]) {
				input.style.width = `${width}px`;
				input.style.height = `${height}px`;
				geometry.push(...[beam, glow].map(border => {
					const bounds = border.getBoundingClientRect();
					const style = mainWindow.getComputedStyle(border, '::before');
					return {
						coversCorners: Math.abs(parseFloat(style.width) - Math.hypot(bounds.width, bounds.height)) < 0.01,
						animation: style.animationName,
						timing: style.animationTimingFunction,
					};
				}));
			}
			const animations = input.getAnimations({ subtree: true }).filter(animation => animation instanceof mainWindow.CSSAnimation);
			const keyframes = animations.map(animation => animation.effect instanceof mainWindow.KeyframeEffect
				? animation.effect.getKeyframes().map(frame => frame.transform)
				: []);
			const reduced = mainWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
			input.classList.remove('working');

			assert.deepStrictEqual({
				geometry,
				keyframes,
				idleAnimations: input.getAnimations({ subtree: true }).filter(animation => animation instanceof mainWindow.CSSAnimation).length,
			}, {
				geometry: Array.from({ length: 4 }, () => ({
					coversCorners: true, animation: reduced ? 'none' : 'chat-input-working-border-spin', timing: reduced ? 'ease' : 'linear',
				})),
				keyframes: reduced ? [] : Array.from({ length: 2 }, () => ['translate(-50%, -50%) rotate(0deg)', 'translate(-50%, -50%) rotate(360deg)']),
				idleAnimations: 0,
			});
		});
	});
});
