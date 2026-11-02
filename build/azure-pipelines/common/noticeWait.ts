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
// The artifact upload is asynchronous, so a notice listed when Quality completes
// may still be committing.
export const COMPLETED_QUALITY_GRACE_MS = 5 * 60_000;

export interface NoticePollState {
	/** Time since polling started. */
	readonly elapsedMs: number;
	/** Last Quality job state read from the timeline, or undefined if it was never read. */
	readonly qualityState: string | undefined;
	/** Time since the Quality job was first seen completed. */
	readonly qualityCompletedForMs: number | undefined;
	/** Whether the shipping notice is listed in notice_output, or undefined if that is unknown. */
	readonly shippingListed: boolean | undefined;
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
	if (state.shippingListed === false) {
		return `Quality job completed without ${SHIPPING_NOTICE_NAME}`;
	}
	if ((state.qualityCompletedForMs ?? 0) >= COMPLETED_QUALITY_GRACE_MS) {
		return `${SHIPPING_NOTICE_NAME} still not valid ${COMPLETED_QUALITY_GRACE_MS / 60_000} minutes after the Quality job completed`;
	}
	return undefined;
}
