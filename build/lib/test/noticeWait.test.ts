/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { COMPLETED_QUALITY_GRACE_MS, getNoticeGiveUpReason, MAX_NOTICE_WAIT_MS, type NoticePollState, UNKNOWN_QUALITY_NOTICE_WAIT_MS } from '../../azure-pipelines/common/noticeWait.ts';

const minutes = (n: number) => n * 60_000;

function state(overrides: Partial<NoticePollState>): NoticePollState {
	return { elapsedMs: 0, qualityState: 'inProgress', qualityCompletedForMs: undefined, shippingListed: undefined, ...overrides };
}

suite('CG NOTICE wait', () => {
	test('keeps waiting past the old 15 minute budget while the Quality job runs', () => {
		for (const qualityState of ['pending', 'inProgress']) {
			assert.equal(getNoticeGiveUpReason(state({ elapsedMs: minutes(16), qualityState, shippingListed: false })), undefined);
			assert.equal(getNoticeGiveUpReason(state({ elapsedMs: minutes(44), qualityState })), undefined);
		}
	});

	test('gives up at the hard cap even if the Quality job never finishes', () => {
		assert.match(getNoticeGiveUpReason(state({ elapsedMs: MAX_NOTICE_WAIT_MS }))!, /waited 45 minutes/);
	});

	test('gives up as soon as the Quality job completes without the notice', () => {
		const reason = getNoticeGiveUpReason(state({ elapsedMs: minutes(3), qualityState: 'completed', qualityCompletedForMs: 0, shippingListed: false }));
		assert.match(reason!, /Quality job completed without ThirdPartyNotices\.new\.txt/);
	});

	test('waits for a listed notice to finish committing after the Quality job completes', () => {
		for (const shippingListed of [true, undefined]) {
			assert.equal(getNoticeGiveUpReason(state({ qualityState: 'completed', qualityCompletedForMs: COMPLETED_QUALITY_GRACE_MS - 1, shippingListed })), undefined);
			assert.match(getNoticeGiveUpReason(state({ qualityState: 'completed', qualityCompletedForMs: COMPLETED_QUALITY_GRACE_MS, shippingListed }))!, /still not valid 5 minutes after/);
		}
	});

	test('keeps the old 15 minute budget when the Quality job state is unknown', () => {
		assert.equal(getNoticeGiveUpReason(state({ elapsedMs: UNKNOWN_QUALITY_NOTICE_WAIT_MS - 1, qualityState: undefined, shippingListed: false })), undefined);
		assert.match(getNoticeGiveUpReason(state({ elapsedMs: UNKNOWN_QUALITY_NOTICE_WAIT_MS, qualityState: undefined }))!, /state unavailable for 15 minutes/);
	});

	test('platforms that start polling at different times make the same decision', () => {
		// Build 491732: Quality produced the notice 23 minutes after queue, and the
		// earliest platform started polling about 16 minutes before that.
		for (const elapsedMs of [minutes(1), minutes(16), minutes(22)]) {
			assert.equal(getNoticeGiveUpReason(state({ elapsedMs, qualityState: 'inProgress', shippingListed: false })), undefined);
		}
	});
});
