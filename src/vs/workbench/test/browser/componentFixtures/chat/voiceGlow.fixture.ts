/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDark } from '../../../../../platform/theme/common/theme.js';
import { resolveVoiceGlowColors, VoiceGlowState } from '../../../../contrib/chat/browser/voiceClient/voiceGlow.js';
import { createVoiceGlowController } from '../../../../contrib/chat/browser/voiceClient/voiceGlowController.js';
import { ComponentFixtureContext, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

/**
 * The Voice Mode ambient glow on a stand-in chat input box. Every state is pinned
 * to a representative still frame (the reduced-motion path), so the screenshots
 * are stable while still exercising the real controller and CSS.
 */
function renderVoiceGlow(state: VoiceGlowState, level: number) {
	return (context: ComponentFixtureContext): void => {
		const { container, disposableStore, theme } = context;
		container.classList.add('monaco-workbench');
		container.style.width = '420px';
		container.style.padding = '24px';
		container.style.background = 'var(--vscode-editor-background)';

		const inputBox = document.createElement('div');
		inputBox.className = 'chat-input-container';
		inputBox.style.cssText = 'box-sizing:border-box;background-color:var(--vscode-input-background);border:1px solid var(--vscode-input-border, transparent);border-radius:var(--vscode-cornerRadius-large);padding:10px 12px;min-height:64px;position:relative;';
		const placeholder = document.createElement('span');
		placeholder.style.cssText = 'color:var(--vscode-input-placeholderForeground, var(--vscode-descriptionForeground));';
		placeholder.textContent = 'Ask Copilot';
		inputBox.append(placeholder);
		container.append(inputBox);

		const controller = disposableStore.add(createVoiceGlowController(
			inputBox,
			() => isDark(theme.type) ? 'dark' : 'light',
			() => resolveVoiceGlowColors(theme),
		));
		controller.render(state, level, true);
	};
}

/**
 * The rim's two moods. Both are pinned to a representative still frame (the
 * reduced-motion path), so the screenshots are stable while still exercising the
 * real controller and CSS.
 *
 * The high-contrast variants matter here: HC replaces the soft light with a
 * solid line, so it needs covering rather than being assumed to follow from the
 * dark theme.
 */
export default defineThemedFixtureGroup({ path: 'chat/' }, {
	'Voice glow (listening)': defineComponentFixture({
		render: renderVoiceGlow('listening', 0.7),
		additionalThemes: ['darkHighContrast'],
	}),
	'Voice glow (speaking)': defineComponentFixture({
		render: renderVoiceGlow('speaking', 0.7),
		additionalThemes: ['darkHighContrast'],
	}),
});
