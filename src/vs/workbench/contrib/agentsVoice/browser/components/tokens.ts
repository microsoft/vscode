/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isMacintosh } from '../../../../../base/common/platform.js';

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

/**
 * Add Enter/Space keyboard activation to a non-native button element.
 * Required for elements with role="button" + tabindex="0".
 */
export function addKeyboardActivation(el: HTMLElement): void {
	el.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			el.click();
		}
	});
}

/**
 * Whether a mouse event is a secondary-click / context-menu gesture (right-click,
 * or Ctrl-click on macOS) rather than a primary press. Used to keep such gestures
 * from starting/stopping push-to-talk when the mic also opens a context menu.
 */
export function isSecondaryPointerGesture(e: MouseEvent): boolean {
	return e.button !== 0 || (isMacintosh && e.ctrlKey);
}
