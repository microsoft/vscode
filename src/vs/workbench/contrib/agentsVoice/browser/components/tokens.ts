/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Visual design tokens for the agentsVoice floating pane.
 * Centralize sizes and colors so every component pulls from the same palette.
 */

export const FONT_SIZE = {
	micro: '10px',  // group headers, PTT key chip
	body: '12px',   // primary text: status counts, session labels, transcripts, confirmations
	base: '13px',   // widget root cascade
	iconSm: '14px', // small codicons (chevrons, close, row actions)
	iconMd: '16px', // mic icon
} as const;

export const FONT_WEIGHT = {
	normal: '400',
	medium: '500',
	semibold: '600',
	bold: '700',
} as const;

export const COLOR = {
	// Match the waveform/glow colors from agentsVoiceWidget._view()
	userTranscript: 'rgb(88,166,255)',       // listening / user voice
	assistantTranscript: 'rgb(163,113,247)', // speaking / assistant voice
} as const;
