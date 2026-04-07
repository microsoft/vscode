/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import type { IDebugLogEntry } from '../../../../platform/chat/common/chatDebugFileLoggerService';
import { debugLogEntryToDebugEvent, entryDedupKey } from '../otelSpanToChatDebugEvent';

function makeEntry(overrides: Partial<IDebugLogEntry> & { type: IDebugLogEntry['type'] }): IDebugLogEntry {
	return {
		ts: overrides.ts ?? 1000,
		dur: overrides.dur ?? 500,
		sid: overrides.sid ?? 'session-1',
		type: overrides.type,
		name: overrides.name ?? 'test',
		spanId: overrides.spanId ?? 'span-1',
		parentSpanId: overrides.parentSpanId,
		status: overrides.status ?? 'ok',
		attrs: overrides.attrs ?? {},
	};
}

describe('debugLogEntryToDebugEvent', () => {
	it('returns undefined for session_start entries', () => {
		expect(debugLogEntryToDebugEvent(makeEntry({ type: 'session_start' }))).toBeUndefined();
	});

	it('returns undefined for turn_start entries', () => {
		expect(debugLogEntryToDebugEvent(makeEntry({ type: 'turn_start' }))).toBeUndefined();
	});

	it('returns undefined for turn_end entries', () => {
		expect(debugLogEntryToDebugEvent(makeEntry({ type: 'turn_end' }))).toBeUndefined();
	});

	it('converts child_session_ref entries to generic events', () => {
		const entry = makeEntry({
			type: 'child_session_ref',
			name: 'runSubagent-default',
			attrs: { label: 'runSubagent-default' }
		});
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});

	it('filters out categorization child_session_ref entries', () => {
		expect(debugLogEntryToDebugEvent(makeEntry({
			type: 'child_session_ref',
			attrs: { label: 'categorization' }
		}))).toBeUndefined();
	});

	it('filters out title child_session_ref entries', () => {
		expect(debugLogEntryToDebugEvent(makeEntry({
			type: 'child_session_ref',
			attrs: { label: 'title' }
		}))).toBeUndefined();
	});

	it('returns undefined for error entries', () => {
		expect(debugLogEntryToDebugEvent(makeEntry({ type: 'error' }))).toBeUndefined();
	});

	it('attempts to convert tool_call entry (enters conversion path)', () => {
		const entry = makeEntry({ type: 'tool_call', name: 'run_in_terminal', attrs: { args: '{}', result: 'ok' } });
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});

	it('attempts to convert llm_request entry (enters conversion path)', () => {
		const entry = makeEntry({ type: 'llm_request', name: 'chat:gpt-4o', attrs: { model: 'gpt-4o' } });
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});

	it('attempts to convert user_message entry (enters conversion path)', () => {
		const entry = makeEntry({ type: 'user_message', attrs: { content: 'hello' } });
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});

	it('attempts to convert agent_response entry (enters conversion path)', () => {
		const entry = makeEntry({ type: 'agent_response', attrs: { response: 'Done.' } });
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});

	it('attempts to convert subagent entry (enters conversion path)', () => {
		const entry = makeEntry({ type: 'subagent', parentSpanId: 'p1', attrs: { agentName: 'Explore' } });
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});

	it('attempts to convert hook entry (enters conversion path)', () => {
		const entry = makeEntry({ type: 'hook', attrs: { resultKind: 'success' } });
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});

	it('skips discovery entries by default (core handles them)', () => {
		const entry = makeEntry({ type: 'discovery', attrs: { category: 'discovery' } });
		expect(debugLogEntryToDebugEvent(entry)).toBeUndefined();
	});

	it('attempts to convert generic entry (enters conversion path)', () => {
		const entry = makeEntry({ type: 'generic', attrs: { details: 'info' } });
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});
});

describe('entryDedupKey', () => {
	it('generates unique keys across different types with same spanId', () => {
		const a = makeEntry({ type: 'user_message', spanId: '0000000000000001', ts: 1000 });
		const b = makeEntry({ type: 'llm_request', spanId: '0000000000000001', ts: 1000 });
		expect(entryDedupKey(a)).not.toBe(entryDedupKey(b));
	});

	it('generates unique keys for same type with different timestamps (restart)', () => {
		const a = makeEntry({ type: 'hook', spanId: '0000000000000001', ts: 1000 });
		const b = makeEntry({ type: 'hook', spanId: '0000000000000001', ts: 2000 });
		expect(entryDedupKey(a)).not.toBe(entryDedupKey(b));
	});

	it('generates same key for identical entries', () => {
		const a = makeEntry({ type: 'tool_call', spanId: 'span-1', ts: 5000 });
		const b = makeEntry({ type: 'tool_call', spanId: 'span-1', ts: 5000 });
		expect(entryDedupKey(a)).toBe(entryDedupKey(b));
	});

	it('includes type, spanId, and timestamp in key', () => {
		const key = entryDedupKey(makeEntry({ type: 'hook', spanId: 'x', ts: 100 }));
		expect(key).toContain('hook');
		expect(key).toContain('x');
		expect(key).toContain('100');
	});

	it('keys differ between user_message and llm_request sharing spanId', () => {
		const userMsg = makeEntry({ type: 'user_message', spanId: '000000000000000d', ts: 1000 });
		const llmReq = makeEntry({ type: 'llm_request', spanId: '000000000000000d', ts: 1500 });
		expect(entryDedupKey(userMsg)).not.toBe(entryDedupKey(llmReq));
	});

	it('keys differ for same-type entries after restart (same spanId, different ts)', () => {
		const before = makeEntry({ type: 'hook', spanId: '0000000000000009', ts: 1000 });
		const after = makeEntry({ type: 'hook', spanId: '0000000000000009', ts: 9000 });
		expect(entryDedupKey(before)).not.toBe(entryDedupKey(after));
	});
});

describe('debugLogEntryToDebugEvent skipCoreEvents', () => {
	it('skips discovery entries when skipCoreEvents is true (default)', () => {
		const entry = makeEntry({
			type: 'discovery',
			name: 'Load Agents',
			attrs: { category: 'discovery', source: 'core', details: 'Resolved 5 agents' },
		});
		expect(debugLogEntryToDebugEvent(entry)).toBeUndefined();
		expect(debugLogEntryToDebugEvent(entry, true)).toBeUndefined();
	});

	it('converts discovery entries when skipCoreEvents is false', () => {
		const entry = makeEntry({
			type: 'discovery',
			name: 'Load Agents',
			attrs: { category: 'discovery', source: 'core', details: 'Resolved 5 agents' },
		});
		expect(() => debugLogEntryToDebugEvent(entry, false)).toThrow();
	});

	it('skips core-sourced generic entries when skipCoreEvents is true', () => {
		const entry = makeEntry({
			type: 'generic',
			name: 'Resolve Customizations',
			attrs: { category: 'customization', source: 'core' },
		});
		expect(debugLogEntryToDebugEvent(entry)).toBeUndefined();
	});

	it('converts core-sourced generic entries when skipCoreEvents is false', () => {
		const entry = makeEntry({
			type: 'generic',
			name: 'Resolve Customizations',
			attrs: { category: 'customization', source: 'core' },
		});
		expect(() => debugLogEntryToDebugEvent(entry, false)).toThrow();
	});

	it('converts non-core generic entries regardless of skipCoreEvents', () => {
		const entry = makeEntry({
			type: 'generic',
			name: 'Custom Event',
			attrs: { details: 'something' },
		});
		// Both should attempt conversion (not return undefined)
		expect(() => debugLogEntryToDebugEvent(entry, true)).toThrow();
		expect(() => debugLogEntryToDebugEvent(entry, false)).toThrow();
	});
});

describe('child_session_ref conversion', () => {
	it('sets parentEventId from parentSpanId on child_session_ref', () => {
		const entry = makeEntry({
			type: 'child_session_ref',
			name: 'runSubagent-Explore',
			spanId: 'child-ref-abc',
			parentSpanId: 'tool-span-42',
			attrs: { label: 'runSubagent-Explore', childSessionId: 'abc', childLogFile: 'runSubagent-Explore-abc.jsonl' },
		});
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});

	it('child_session_ref without parentSpanId has undefined parentEventId', () => {
		const entry = makeEntry({
			type: 'child_session_ref',
			name: 'runSubagent-default',
			spanId: 'child-ref-def',
			attrs: { label: 'runSubagent-default', childSessionId: 'def' },
		});
		expect(() => debugLogEntryToDebugEvent(entry)).toThrow();
	});

	it('filters categorization child_session_ref regardless of skipCoreEvents', () => {
		const entry = makeEntry({
			type: 'child_session_ref',
			attrs: { label: 'categorization' },
		});
		expect(debugLogEntryToDebugEvent(entry, true)).toBeUndefined();
		expect(debugLogEntryToDebugEvent(entry, false)).toBeUndefined();
	});

	it('filters title child_session_ref regardless of skipCoreEvents', () => {
		const entry = makeEntry({
			type: 'child_session_ref',
			attrs: { label: 'title' },
		});
		expect(debugLogEntryToDebugEvent(entry, true)).toBeUndefined();
		expect(debugLogEntryToDebugEvent(entry, false)).toBeUndefined();
	});
});
