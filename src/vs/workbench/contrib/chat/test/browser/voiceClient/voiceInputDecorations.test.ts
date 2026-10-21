/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock } from '../../../../../../base/test/common/mock.js';
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

	test('keeps the blue glow connected across voice states and mute without a listening placeholder', async () => {
		const connected = observableValue('connected', true);
		const active = observableValue('active', true);
		const owner = observableValue('owner', true);
		const state = observableValue<VoiceState>('state', 'idle');
		const muted = observableValue('muted', false);
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
			configurationService: new TestConfigurationService({ 'agents.voice.showTranscript': false }),
			keybindingService: new MockKeybindingService(),
			themeService: new TestThemeService(),
			accessibilityService: new TestAccessibilityService(),
		}, { inputContainer: input, isActive: active, isOwner: owner }));

		const nextFrame = () => new Promise<void>(resolve => dom.getWindow(input).requestAnimationFrame(() => resolve()));
		const snapshots = [];
		for (const voiceState of ['idle', 'listening', 'processing', 'speaking', 'error'] as const) {
			state.set(voiceState, undefined);
			await nextFrame();
			snapshots.push({
				state: voiceState,
				active: input.classList.contains('voice-active'),
				listening: input.classList.contains('voice-listening'),
				warmRims: input.querySelectorAll('.voice-glow-rim-warm').length,
			});
		}
		state.set('listening', undefined);
		const overlay = input.querySelector<HTMLElement>('.voice-transcript-overlay-scrollable')!;
		const listeningOverlayHidden = overlay.style.display === 'none';
		muted.set(true, undefined);
		await nextFrame();
		const mutedSnapshot = {
			active: input.classList.contains('voice-active'),
			hint: overlay.textContent,
		};
		owner.set(false, undefined);
		const nonOwnerActive = input.classList.contains('voice-active');
		owner.set(true, undefined);
		await nextFrame();
		active.set(false, undefined);
		const inactiveActive = input.classList.contains('voice-active');
		active.set(true, undefined);
		await nextFrame();
		connected.set(false, undefined);

		assert.deepStrictEqual({
			snapshots,
			listeningOverlayHidden,
			mutedSnapshot,
			nonOwnerActive,
			inactiveActive,
			disconnectedActive: input.classList.contains('voice-active'),
		}, {
			snapshots: ['idle', 'listening', 'processing', 'speaking', 'error'].map(state => ({
				state, active: true, listening: true, warmRims: 0,
			})),
			listeningOverlayHidden: true,
			mutedSnapshot: { active: true, hint: 'Unmute to speak...' },
			nonOwnerActive: false,
			inactiveActive: false,
			disconnectedActive: false,
		});
	});
});
