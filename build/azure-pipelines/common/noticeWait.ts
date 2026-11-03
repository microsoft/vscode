/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// When downloadNotice.ts stops waiting for the CG NOTICE from the Quality job.
// Every platform must make the same fresh-vs-fallback decision, so the wait is
// tied to the Quality job rather than to each platform's own clock.

const SHIPPING_NOTICE_NAME = 'ThirdPartyNotices.new.txt';

// The Quality job times out after 30 minutes. This leaves room for it to start
// late (it ran 23 minutes before producing the notice in 491732 after a
// node_modules cache miss, and 29 minutes in 487627 after NOTICE API timeouts).
export const MAX_NOTICE_WAIT_MS = 45 * 60_000;
// Without a readable Quality job state, keep the previous 15 minute budget.
export const UNKNOWN_QUALITY_NOTICE_WAIT_MS = 15 * 60_000;
/**
 * What the last poll found in notice_output. After the Quality job completes its
 * uploads are final, so every platform finds the same thing.
 * - `absent`: no shipping notice listed
 * - `invalid`: listed, but missing from the download or too small to use
 * - `unknown`: not determined, e.g. a transient API or download error
 */
export type NoticeAvailability = 'absent' | 'invalid' | 'unknown';

export interface NoticePollState {
	/** Time since polling started. */
	readonly elapsedMs: number;
	/** Last Quality job state read from the timeline, or undefined if it was never read. */
	readonly qualityState: string | undefined;
	/** What this poll found, read after the Quality job state. */
	readonly notice: NoticeAvailability;
}

/**
 * Decides whether to stop waiting for the CG notice and keep the legacy one.
 * Returns the reason to give up, or undefined to keep polling.
 */
export function getNoticeGiveUpReason(state: NoticePollState): string | undefined {
	if (state.elapsedMs >= MAX_NOTICE_WAIT_MS) {
		return `waited ${MAX_NOTICE_WAIT_MS / 60_000} minutes`;
	}
	if (state.qualityState === undefined) {
		return state.elapsedMs >= UNKNOWN_QUALITY_NOTICE_WAIT_MS ? `Quality job state unavailable for ${UNKNOWN_QUALITY_NOTICE_WAIT_MS / 60_000} minutes` : undefined;
	}
	if (state.qualityState !== 'completed') {
		return undefined;
	}
	// Decide only on what the completed Quality job left behind, never on how long
	// this platform has been looking at it, so every platform decides the same way.
	switch (state.notice) {
		case 'absent': return `Quality job completed without ${SHIPPING_NOTICE_NAME}`;
		case 'invalid': return `Quality job completed with an incomplete or empty ${SHIPPING_NOTICE_NAME}`;
		case 'unknown': return undefined;
	}
}
