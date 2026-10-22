/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ResolvedKeybinding } from '../../../../../../base/common/keybindings.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestAccessibilityService } from '../../../../../../platform/accessibility/test/common/testAccessibilityService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { MockKeybindingService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestThemeService } from '../../../../../../platform/theme/test/common/testThemeService.js';
import { IMicCaptureService } from '../../../browser/voiceClient/micCaptureService.js';
import { ITtsPlaybackService } from '../../../browser/voiceClient/ttsPlaybackService.js';
import { setupVoiceInputDecorations } from '../../../browser/voiceClient/voiceInputDecorations.js';
import { ITranscriptTurn, IVoiceSessionController, VoiceState } from '../../../browser/voiceClient/voiceSessionController.js';

suite('Voice input decorations', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('keeps the blue glow connected and shows the barge-in hint only while speaking', async () => {
		const connected = observableValue('connected', true);
		const active = observableValue('active', true);
		const owner = observableValue('owner', true);
		const state = observableValue<VoiceState>('state', 'idle');
		const muted = observableValue('muted', false);
		const inputValue = observableValue('inputValue', '');
		const keybindings = new Map<string, string>();
		const keybindingsChanged = store.add(new Emitter<void>());
		const configurationService = new TestConfigurationService({ 'agents.voice.showTranscript': false });
		const input = dom.$('div');
		store.add(setupVoiceInputDecorations({
			voiceSessionController: new class extends mock<IVoiceSessionController>() {
				override readonly isConnected = connected;
				override readonly voiceState = state;
				override readonly isMuted = muted;
				override readonly transcriptTurns = observableValue<readonly ITranscriptTurn[]>('turns', []);
			},
			ttsPlaybackService: new class extends mock<ITtsPlaybackService>() {
				override readonly analyserNode = undefined;
			},
			micCaptureService: new class extends mock<IMicCaptureService>() {
				override readonly analyserNode = undefined;
			},
			configurationService,
			keybindingService: new class extends MockKeybindingService {
				override get onDidUpdateKeybindings() { return keybindingsChanged.event; }
				override lookupKeybinding(commandId: string): ResolvedKeybinding | undefined {
					const label = keybindings.get(commandId);
					return label ? upcastPartial<ResolvedKeybinding>({ getLabel: () => label }) : undefined;
				}
			}(),
			themeService: new TestThemeService(),
			accessibilityService: new TestAccessibilityService(),
		}, { inputContainer: input, isActive: active, isOwner: owner, inputValue }));

		const nextFrame = () => new Promise<void>(resolve => dom.getWindow(input).requestAnimationFrame(() => resolve()));
		const overlay = input.querySelector<HTMLElement>('.voice-transcript-overlay-scrollable')!;
		const snapshots = [];
		for (const voiceState of ['idle', 'listening', 'processing', 'speaking', 'error'] as const) {
			state.set(voiceState, undefined);
			await nextFrame();
			snapshots.push({
				state: voiceState,
				active: input.classList.contains('voice-active'),
				listening: input.classList.contains('voice-listening'),
				warmRims: input.querySelectorAll('.voice-glow-rim-warm').length,
				overlayHidden: overlay.style.display === 'none',
				hint: overlay.style.display === 'none' ? undefined : overlay.textContent,
			});
		}
		state.set('speaking', undefined);
		keybindings.set('agentsVoice.pushToTalk', 'Alt+V');
		keybindings.set('workbench.action.chat.voiceInputMode.holdToTalk', 'Ctrl+Space');
		keybindingsChanged.fire();
		const configuredHint = overlay.textContent;
		keybindings.set('workbench.action.chat.voiceInputMode.holdToTalk', 'Ctrl+K');
		keybindingsChanged.fire();
		const remappedHint = overlay.textContent;
		keybindings.delete('workbench.action.chat.voiceInputMode.holdToTalk');
		keybindingsChanged.fire();
		const legacyHint = overlay.textContent;
		inputValue.set('Typed draft', undefined);
		const hiddenWithInput = overlay.style.display === 'none';
		inputValue.set('', undefined);
		keybindings.clear();
		keybindingsChanged.fire();
		await configurationService.setUserConfiguration('agents.voice.showTranscript', true);
		state.set('idle', undefined);
		await nextFrame();
		const manualHint = overlay.textContent;
		await configurationService.setUserConfiguration('agents.voice.showTranscript', false);
		state.set('listening', undefined);
		await nextFrame();
		const listeningOverlayHidden = overlay.style.display === 'none';
		muted.set(true, undefined);
		await nextFrame();
		const mutedSnapshot = {
			active: input.classList.contains('voice-active'),
			hint: overlay.textContent,
		};
		owner.set(false, undefined);
		await nextFrame();
		const nonOwnerActive = input.classList.contains('voice-active');
		owner.set(true, undefined);
		await nextFrame();
		active.set(false, undefined);
		await nextFrame();
		const inactiveActive = input.classList.contains('voice-active');
		active.set(true, undefined);
		await nextFrame();
		connected.set(false, undefined);
		await nextFrame();

		assert.deepStrictEqual({
			snapshots,
			configuredHint,
			remappedHint,
			legacyHint,
			hiddenWithInput,
			manualHint,
			listeningOverlayHidden,
			mutedSnapshot,
			nonOwnerActive,
			inactiveActive,
			disconnectedActive: input.classList.contains('voice-active'),
		}, {
			snapshots: ['idle', 'listening', 'processing', 'speaking', 'error'].map(state => ({
				state, active: true, listening: true, warmRims: 0, overlayHidden: state !== 'speaking',
				hint: state === 'speaking' ? 'Speak to barge in' : undefined,
			})),
			configuredHint: 'Speak or use Ctrl+Space',
			remappedHint: 'Speak or use Ctrl+K',
			legacyHint: 'Speak or use Alt+V',
			hiddenWithInput: true,
			manualHint: 'Click voice mode to talk',
			listeningOverlayHidden: true,
			mutedSnapshot: { active: true, hint: 'Unmute to speak...' },
			nonOwnerActive: false,
			inactiveActive: false,
			disconnectedActive: false,
		});
	});
});
