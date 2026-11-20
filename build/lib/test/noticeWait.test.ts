/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { getNoticeGiveUpReason, MAX_NOTICE_WAIT_MS, type NoticePollState, UNKNOWN_QUALITY_NOTICE_WAIT_MS } from '../../azure-pipelines/common/noticeWait.ts';

const minutes = (n: number) => n * 60_000;

function state(overrides: Partial<NoticePollState>): NoticePollState {
	return { elapsedMs: 0, qualityState: 'inProgress', notice: 'unknown', ...overrides };
}

suite('CG NOTICE wait', () => {
	test('keeps waiting past the old 15 minute budget while the Quality job runs', () => {
		for (const qualityState of ['pending', 'inProgress']) {
			for (const notice of ['absent', 'invalid', 'unknown'] as const) {
				assert.equal(getNoticeGiveUpReason(state({ elapsedMs: minutes(16), qualityState, notice })), undefined);
				assert.equal(getNoticeGiveUpReason(state({ elapsedMs: minutes(44), qualityState, notice })), undefined);
			}
		}
	});

	test('gives up at the hard cap even if the Quality job never finishes', () => {
		assert.match(getNoticeGiveUpReason(state({ elapsedMs: MAX_NOTICE_WAIT_MS }))!, /waited 45 minutes/);
	});

	test('gives up as soon as the completed Quality job left no usable notice', () => {
		assert.match(getNoticeGiveUpReason(state({ qualityState: 'completed', notice: 'absent' }))!, /completed without ThirdPartyNotices\.new\.txt/);
		assert.match(getNoticeGiveUpReason(state({ qualityState: 'completed', notice: 'invalid' }))!, /completed with an incomplete or empty/);
	});

	test('retries a transient error after the Quality job completed', () => {
		assert.equal(getNoticeGiveUpReason(state({ elapsedMs: minutes(40), qualityState: 'completed', notice: 'unknown' })), undefined);
	});

	test('keeps the old 15 minute budget when the Quality job state is unknown', () => {
		assert.equal(getNoticeGiveUpReason(state({ elapsedMs: UNKNOWN_QUALITY_NOTICE_WAIT_MS - 1, qualityState: undefined, notice: 'absent' })), undefined);
		assert.match(getNoticeGiveUpReason(state({ elapsedMs: UNKNOWN_QUALITY_NOTICE_WAIT_MS, qualityState: undefined }))!, /state unavailable for 15 minutes/);
	});

	test('platforms that observe the same completed Quality job at different times decide the same way', () => {
		// Quality completes at T. Platforms first see it completed at T, T+2 and
		// T+6 minutes, and have been polling for different times. What decides is
		// the final notice_output content, which is the same for all of them.
		const observations = [
			{ elapsedMs: minutes(1) },
			{ elapsedMs: minutes(17) },
			{ elapsedMs: minutes(28) },
		];
		for (const notice of ['absent', 'invalid'] as const) {
			const decisions = observations.map(o => getNoticeGiveUpReason(state({ ...o, qualityState: 'completed', notice })));
			assert.equal(new Set(decisions).size, 1, `${notice}: ${decisions.join(' | ')}`);
			assert.ok(decisions[0]);
		}
		// Build 491732: Quality produced the notice 23 minutes after queue, and the
		// earliest platform had been polling for about 16 minutes by then.
		for (const o of observations) {
			assert.equal(getNoticeGiveUpReason(state({ ...o, qualityState: 'inProgress', notice: 'absent' })), undefined);
		}
	});
});