/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { constObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { VoiceModeOnboardingBanner } from '../../../../contrib/agentsVoice/browser/voiceModeOnboarding.js';
import { IVoiceSessionController, VoiceState } from '../../../../contrib/chat/browser/voiceClient/voiceSessionController.js';
import { chatInputStackSlotClass } from '../../../../contrib/chat/browser/widget/input/chatInputStack.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup } from '../fixtureUtils.js';

function renderVoiceModeOnboarding(width: string) {
	return (context: ComponentFixtureContext): void => {
		const { container, disposableStore, theme } = context;
		container.classList.add('monaco-workbench');
		container.style.width = width;
		container.style.padding = '24px';
		container.style.background = 'var(--vscode-editor-background)';

		const instantiationService = createEditorServices(disposableStore, {
			colorTheme: theme,
			additionalServices: services => {
				services.defineInstance(IContextViewService, new class extends mock<IContextViewService>() { }());
				services.definePartialInstance(IVoiceSessionController, {
					voiceState: constObservable<VoiceState>('idle'),
					setAutoListenHeld: () => undefined,
					stopListening: () => undefined,
					pttDown: () => undefined,
					pttUp: () => undefined,
				});
			},
		});
		const host = document.createElement('div');
		// Matches production: the host is a stack slot, visible because a card is
		// attached, i.e. the slot is standalone.
		host.className = `voice-mode-onboarding-container ${chatInputStackSlotClass} chat-input-stack-standalone`;
		container.append(host);

		disposableStore.add(instantiationService.createInstance(VoiceModeOnboardingBanner, {
			container: host,
			onDismiss: () => undefined,
			source: 'automatic',
		}));
	};
}

/**
 * The introduction at the width of a default chat panel (the common case), a
 * wide auxiliary bar, and the narrowest panel the card has to survive.
 */
export default defineThemedFixtureGroup({ path: 'agentsVoice/' }, {
	'Voice Mode onboarding (panel)': defineComponentFixture({
		render: renderVoiceModeOnboarding('280px'),
	}),
	'Voice Mode onboarding (wide)': defineComponentFixture({
		render: renderVoiceModeOnboarding('620px'),
	}),
	'Voice Mode onboarding (narrow)': defineComponentFixture({
		render: renderVoiceModeOnboarding('240px'),
	}),
});
