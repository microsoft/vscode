/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IResponseDelta } from '../../../networking/common/fetch';
import { FetchStreamRecorder } from '../../common/chatMLFetcher';

describe('FetchStreamRecorder streaming chunk timing', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('stamps first-token time on the first content chunk and records inter-chunk gaps thereafter', async () => {
		const recorder = new FetchStreamRecorder(undefined);

		vi.setSystemTime(1000);
		await recorder.callback('a', 0, { text: 'a' } satisfies IResponseDelta);
		expect(recorder.firstTokenEmittedTime).toBe(1000);
		expect(recorder.outputChunkGapsMs).toEqual([]);

		vi.setSystemTime(1030);
		await recorder.callback('b', 0, { text: 'b' } satisfies IResponseDelta);
		vi.setSystemTime(1050);
		await recorder.callback('c', 0, { text: 'c' } satisfies IResponseDelta);

		expect(recorder.outputChunkGapsMs).toEqual([30, 20]);
	});

	it('ignores empty deltas that carry no content', async () => {
		const recorder = new FetchStreamRecorder(undefined);

		vi.setSystemTime(2000);
		await recorder.callback('', 0, { text: '' } satisfies IResponseDelta);
		expect(recorder.firstTokenEmittedTime).toBeUndefined();
		expect(recorder.outputChunkGapsMs).toEqual([]);

		vi.setSystemTime(2010);
		await recorder.callback('x', 0, { text: 'x' } satisfies IResponseDelta);
		expect(recorder.firstTokenEmittedTime).toBe(2010);
		expect(recorder.outputChunkGapsMs).toEqual([]);
	});
});
