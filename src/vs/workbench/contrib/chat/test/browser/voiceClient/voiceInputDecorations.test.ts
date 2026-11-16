/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../../base/browser/dom.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
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

	test('keeps the blue glow connected without listening or barge-in hints', async () => {
		const connected = observableValue('connected', true);
		const active = observableValue('active', true);
		const resource = URI.parse('chat-session:/a');
		const otherResource = URI.parse('chat-session:/b');
		const owner = observableValue<URI | undefined>('owner', resource);
		const currentResource = observableValue<URI | undefined>('currentResource', resource);
		const state = observableValue<VoiceState>('state', 'idle');
		const muted = observableValue('muted', false);
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
			keybindingService: new MockKeybindingService(),
			themeService: new TestThemeService(),
			accessibilityService: new TestAccessibilityService(),
		}, {
			inputContainer: input,
			isActive: active,
			getCurrentResource: reader => currentResource.read(reader),
			currentVoiceInputResource: owner,
		}));

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
			});
		}
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
		owner.set(undefined, undefined);
		await nextFrame();
		const nonOwnerActive = input.classList.contains('voice-active');
		owner.set(resource, undefined);
		await nextFrame();
		active.set(false, undefined);
		await nextFrame();
		const inactiveActive = input.classList.contains('voice-active');
		active.set(true, undefined);
		await nextFrame();
		const reboundSnapshots = [];
		for (const target of [otherResource, resource]) {
			owner.set(target, undefined);
			await nextFrame();
			const beforeBinding = input.classList.contains('voice-active');
			currentResource.set(target, undefined);
			await nextFrame();
			reboundSnapshots.push({ beforeBinding, afterBinding: input.classList.contains('voice-active') });
		}
		connected.set(false, undefined);
		await nextFrame();

		assert.deepStrictEqual({
			snapshots,
			manualHint,
			listeningOverlayHidden,
			mutedSnapshot,
			nonOwnerActive,
			inactiveActive,
			reboundSnapshots,
			disconnectedActive: input.classList.contains('voice-active'),
		}, {
			snapshots: ['idle', 'listening', 'processing', 'speaking', 'error'].map(state => ({
				state, active: true, listening: true, warmRims: 0, overlayHidden: true,
			})),
			manualHint: 'Click voice mode to talk',
			listeningOverlayHidden: true,
			mutedSnapshot: { active: true, hint: 'Unmute to speak...' },
			nonOwnerActive: false,
			inactiveActive: false,
			reboundSnapshots: [
				{ beforeBinding: false, afterBinding: true },
				{ beforeBinding: false, afterBinding: true },
			],
			disconnectedActive: false,
		});
	});
});
