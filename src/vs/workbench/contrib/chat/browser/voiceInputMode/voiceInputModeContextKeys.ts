/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ContextKeyExpr, ContextKeyExpression } from '../../../../../platform/contextkey/common/contextkey.js';
import { AGENTS_VOICE_CONNECTED } from '../../../agentsVoice/common/agentsVoice.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

const VoiceModeEnabled = ContextKeyExpr.equals('config.agents.voice.enabled', true);
/** Mirrors `ChatSpeechToTextConfigured` (built-in on-device dictation available). */
const DictationConfigured = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(ChatContextKeys.speechToTextConfigured.key))!;
/** Voice Mode runs manual push-to-talk rather than hands-free auto-listen. */
const HandsFreeDisabled = ContextKeyExpr.equals('config.agents.voice.handsFree', false);

/**
 * When the segmented voice/dictation pill should render. The pill only earns its
 * place when it would host at least two cells; otherwise the single standalone
 * control for the lone available mode is clearer:
 *   - both dictation and Voice Mode are enabled (dictation + voice-connect cells), or
 *   - only Voice Mode is enabled in manual (non-hands-free) mode AND a session is
 *     active, so the voice-connection + listen cells both render.
 * In every other single-mode case the standalone controls (gated on the negation
 * below) take over.
 */
export const SegmentedVoiceInputModePillActive: ContextKeyExpression = ContextKeyExpr.or(
	ContextKeyExpr.and(DictationConfigured, VoiceModeEnabled),
	ContextKeyExpr.and(VoiceModeEnabled, DictationConfigured.negate(), HandsFreeDisabled, AGENTS_VOICE_CONNECTED),
)!;

/** Standalone voice/dictation controls show when the pill does not apply. */
export const SegmentedVoiceInputModePillInactive: ContextKeyExpression = SegmentedVoiceInputModePillActive.negate();
