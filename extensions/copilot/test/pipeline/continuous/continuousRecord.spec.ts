/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { parseContinuousRecord } from './continuousRecord';

const entries = [{ kind: 'documentEncountered', id: 0, time: 1, relativePath: 'a.ts' }];

describe('parseContinuousRecord', () => {
	it('parses a stringified recording payload', () => {
		const recording = { entries, entriesSize: 10, windowStart: 1, windowEnd: 2, sessionId: 's', sequenceNumber: 3 };
		const record = parseContinuousRecord({ recording: JSON.stringify(recording) }, 4);
		expect(record).toEqual({ originalRowIndex: 4, value: recording });
	});

	it('tolerates a pre-parsed recording object (fixtures)', () => {
		const recording = { entries, entriesSize: 10 };
		expect(parseContinuousRecord({ recording }, 0).value.entriesSize).toBe(10);
	});

	it('throws when the recording column is missing', () => {
		expect(() => parseContinuousRecord({}, 0)).toThrow(/Missing key/);
	});

	it('throws when entries were dropped at send time (over cap)', () => {
		const record = { recording: JSON.stringify({ entriesSize: 999999 }) };
		expect(() => parseContinuousRecord(record, 0)).toThrow(/entries is missing or empty/);
	});

	it('throws when entries are empty', () => {
		const record = { recording: JSON.stringify({ entries: [], entriesSize: 0 }) };
		expect(() => parseContinuousRecord(record, 0)).toThrow(/entries is missing or empty/);
	});
});
