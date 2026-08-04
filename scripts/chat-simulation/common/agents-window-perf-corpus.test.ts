/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const assert = require('assert');
const test = require('node:test');
const { AGENTS_PERF_CONCURRENT_BURST_TICKS, createAgentsWindowConcurrentPerfCorpus, createAgentsWindowPerfCorpus } = require('./agents-window-perf-corpus.ts');

test('creates deterministic rich Agents window history', () => {
	const first = createAgentsWindowPerfCorpus({
		sessionCount: 4,
		primaryTurnCount: 20,
		secondaryTurnCount: 3,
		peerChatCount: 2,
		subagentToolCount: 16,
	});

	const second = createAgentsWindowPerfCorpus({
		sessionCount: 4,
		primaryTurnCount: 20,
		secondaryTurnCount: 3,
		peerChatCount: 2,
		subagentToolCount: 16,
	});
	const primary = first.chatFiles[first.expected.primarySessionId];
	const responseParts = primary.requests.flatMap(request => request.response);
	const parentSubagent = responseParts.find(part => part.toolSpecificData?.kind === 'subagent');
	const childTools = responseParts.filter(part => part.subAgentInvocationId === parentSubagent?.toolCallId);

	assert.deepStrictEqual({
		deterministic: first,
		sessionCount: first.storedSessions.filter(session => !session.parentUri).length,
		chatCount: first.storedSessions.length,
		primaryTurns: primary.requests.length,
		primaryHasSentinel: JSON.stringify(primary).includes(first.expected.primarySentinel),
		subagentChildren: childTools.length,
	}, {
		deterministic: second,
		sessionCount: 4,
		chatCount: 6,
		primaryTurns: 20,
		primaryHasSentinel: true,
		subagentChildren: 16,
	});
});

test('creates a deterministic concurrent-session corpus', () => {
	const first = createAgentsWindowConcurrentPerfCorpus();
	const second = createAgentsWindowConcurrentPerfCorpus();

	assert.deepStrictEqual({
		deterministic: first,
		sessionCount: first.expected.sessionCount,
		chatCount: first.expected.chatCount,
		turnCounts: Object.values(first.chatFiles).map(chat => chat.requests.length),
		subagentToolCount: first.expected.subagentToolCount,
		burstTicks: AGENTS_PERF_CONCURRENT_BURST_TICKS,
	}, {
		deterministic: second,
		sessionCount: 3,
		chatCount: 3,
		turnCounts: [40, 40, 40],
		subagentToolCount: 0,
		burstTicks: 48,
	});
});
