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
import { asCssVariableName } from '../../../../../../platform/theme/common/colorRegistry.js';
import { ColorScheme, isHighContrast } from '../../../../../../platform/theme/common/theme.js';
import { ColorThemeData } from '../../../../../services/themes/common/colorThemeData.js';
import { chatSessionInProgressBorder, chatSessionNeedsInputBorder, chatSessionUnvisitedBorder } from '../../../common/widget/chatColors.js';

suite('Chat session state indicator theming', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const scheme of Object.values(ColorScheme)) {
		test(`updates custom border colors without changing state behavior in ${scheme}`, () => {
			const theme = ColorThemeData.createUnloadedThemeForThemeType(scheme, {
				[chatSessionInProgressBorder]: '#123456',
				[chatSessionUnvisitedBorder]: '#112233',
				[chatSessionNeedsInputBorder]: '#445566',
			});
			const workbench = $('.monaco-workbench.monaco-reduce-motion');
			workbench.classList.add(...theme.classNames);
			workbench.style.setProperty('--vscode-strokeThickness', '1px');
			workbench.style.setProperty('--vscode-spacing-size80', '8px');
			workbench.style.setProperty('--vscode-contrastActiveBorder', '#abcdef');
			const session = $('.interactive-session');
			const shadowReference = $('div');
			workbench.append(session, shadowReference);
			store.add(toDisposable(() => workbench.remove()));
			mainWindow.document.body.appendChild(workbench);

			const applyColors = () => {
				for (const colorId of [chatSessionInProgressBorder, chatSessionUnvisitedBorder, chatSessionNeedsInputBorder]) {
					const color = theme.getColor(colorId);
					assert.ok(color);
					workbench.style.setProperty(asCssVariableName(colorId), color.toString());
				}
			};
			const targetWindow = getWindow(workbench);
			const readState = (state: string) => {
				session.className = `interactive-session ${state}`;
				const style = targetWindow.getComputedStyle(session, '::before');
				return { content: style.content, color: style.borderColor, width: style.borderWidth, stroke: style.borderStyle, shadow: style.boxShadow };
			};
			const expectedShadow = (color: string) => {
				shadowReference.style.boxShadow = `0 0 8px color-mix(in srgb, ${color} 60%, transparent)`;
				return isHighContrast(scheme) ? 'none' : targetWindow.getComputedStyle(shadowReference).boxShadow;
			};

			applyColors();
			const inProgress = readState('chat-session-state-indicator chat-state-in-progress');
			const unvisited = readState('chat-session-state-indicator chat-state-idle chat-state-idle-unvisited');
			const blocked = readState('chat-session-state-indicator chat-state-needs-input');
			theme.setCustomColors({
				[chatSessionInProgressBorder]: '#fedcba',
				[chatSessionUnvisitedBorder]: '#778899',
				[chatSessionNeedsInputBorder]: '#aabbcc',
			});
			applyColors();
			const updatedInProgress = readState('chat-session-state-indicator chat-state-in-progress');
			const updatedUnvisited = readState('chat-session-state-indicator chat-state-idle chat-state-idle-unvisited');
			const updatedBlocked = readState('chat-session-state-indicator chat-state-needs-input');
			const hiddenStates = [
				'chat-state-in-progress',
				'chat-state-idle-unvisited',
				'chat-state-needs-input',
				'chat-session-state-indicator chat-state-idle',
			].map(state => readState(state).content);
			workbench.classList.remove('monaco-reduce-motion');
			session.className = 'interactive-session chat-session-state-indicator chat-state-in-progress';
			// Finish pseudo-element transitions before checking the steady-state color.
			for (const animation of session.getAnimations({ subtree: true })) {
				animation.finish();
			}
			const inProgressWithoutReducedMotion = readState('chat-session-state-indicator chat-state-in-progress');
			const inProgressAnimation = targetWindow.getComputedStyle(session, '::before').animationName;

			assert.deepStrictEqual({ inProgress, unvisited, blocked, updatedInProgress, updatedUnvisited, updatedBlocked, hiddenStates, inProgressWithoutReducedMotion, inProgressAnimation }, {
				inProgress: { content: '""', color: 'rgb(18, 52, 86)', width: '1px', stroke: 'solid', shadow: 'none' },
				unvisited: { content: '""', color: 'rgb(17, 34, 51)', width: '1px', stroke: 'dotted', shadow: 'none' },
				blocked: { content: '""', color: 'rgb(68, 85, 102)', width: '1px', stroke: 'dashed', shadow: expectedShadow('#445566') },
				updatedInProgress: { content: '""', color: 'rgb(254, 220, 186)', width: '1px', stroke: 'solid', shadow: 'none' },
				updatedUnvisited: { content: '""', color: 'rgb(119, 136, 153)', width: '1px', stroke: 'dotted', shadow: 'none' },
				updatedBlocked: { content: '""', color: 'rgb(170, 187, 204)', width: '1px', stroke: 'dashed', shadow: expectedShadow('#aabbcc') },
				hiddenStates: ['none', 'none', 'none', 'none'],
				inProgressWithoutReducedMotion: { content: '""', color: 'rgb(254, 220, 186)', width: '1px', stroke: 'solid', shadow: 'none' },
				inProgressAnimation: 'none',
			});
		});
	}
});
