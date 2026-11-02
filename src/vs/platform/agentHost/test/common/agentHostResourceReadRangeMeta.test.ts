/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { getAgentHostExtensionInitializeResultMeta } from '../../common/agentHostExtensionProtocol.js';
import { AgentHostResourceReadRangeMetaKey, readAgentHostResourceReadRange, supportsAgentHostResourceReadRanges, withAgentHostResourceReadRange } from '../../common/meta/agentHostResourceReadRangeMeta.js';
import type { InitializeResult } from '../../common/state/protocol/common/commands.js';

suite('Agent host resourceRead range metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips ranges through JSON, preserving unrelated metadata', () => {
		const read = [{ position: 0, length: 16384 }, { position: 16384 }, { position: 7, length: 0 }].map(range => {
			const meta = JSON.parse(JSON.stringify(withAgentHostResourceReadRange({ other: 1 }, range)));
			return { other: meta.other, range: readAgentHostResourceReadRange({ _meta: meta }) };
		});
		assert.deepStrictEqual(read, [
			{ other: 1, range: { position: 0, length: 16384 } },
			{ other: 1, range: { position: 16384 } },
			{ other: 1, range: { position: 7, length: 0 } },
		]);
	});

	test('absent metadata reads as a whole read and malformed values as invalid', () => {
		const malformed: unknown[] = [
			null, 0, 'all', [], {},
			{ length: 10 },
			{ position: -1 },
			{ position: 1.5 },
			{ position: '0' },
			{ position: Number.MAX_SAFE_INTEGER + 1 },
			{ position: 0, length: -1 },
			{ position: 0, length: 0.5 },
			{ position: 0, length: null },
		];
		assert.deepStrictEqual({
			absent: [readAgentHostResourceReadRange({}), readAgentHostResourceReadRange({ _meta: { other: 1 } })],
			malformed: malformed.map(value => readAgentHostResourceReadRange({ _meta: { [AgentHostResourceReadRangeMetaKey]: value } })),
		}, {
			absent: [undefined, undefined],
			malformed: malformed.map(() => 'invalid'),
		});
	});

	test('only an advertised true capability enables ranged reads', () => {
		const result = (meta?: Record<string, unknown>): InitializeResult => ({ protocolVersion: '1.0.0', serverSeq: 0, snapshots: [], ...(meta ? { _meta: meta } : {}) });
		assert.deepStrictEqual({
			vscodeHost: supportsAgentHostResourceReadRanges(result(getAgentHostExtensionInitializeResultMeta())),
			otherHost: supportsAgentHostResourceReadRanges(result()),
			malformed: supportsAgentHostResourceReadRanges(result({ 'vscode.resourceReadRanges': 'true' })),
			noResult: supportsAgentHostResourceReadRanges(undefined),
		}, { vscodeHost: true, otherHost: false, malformed: false, noResult: false });
	});
});
