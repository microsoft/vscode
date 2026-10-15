/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { CHAT_OPEN_TIMEOUT_MS, ChatOpenClassification, ChatOpenEvent, finishChatOpenRequest, getChatOpenSessionType, IChatOpenRequest, markChatOpen, markChatOpenSessionLoaded, registerChatOpenHost, requestChatOpen, resetChatOpenMeasurementsForTests, SessionOpenClassification, SessionOpenEvent, setChatOpenModelWasLoaded, startChatOpen, takeChatOpenRequest, waitForChatOpenSession } from '../../common/chatOpenTelemetry.js';

class RecordingLogService extends NullLogService {
	readonly lines: string[] = [];

	override info(message: string): void {
		this.lines.push(`info ${message}`);
	}

	override trace(message: string): void {
		this.lines.push(`trace ${message}`);
	}
}

class RecordingTelemetryService extends NullTelemetryServiceShape {
	readonly all: { name: string | undefined; data: unknown }[] = [];

	get events(): { name: string | undefined; data: ChatOpenEvent }[] {
		return this.all.filter(event => event.name === 'agents/chatOpen') as { name: string | undefined; data: ChatOpenEvent }[];
	}

	get sessionOpenEvents(): { name: string | undefined; data: SessionOpenEvent }[] {
		return this.all.filter(event => event.name === 'agents/sessionOpen') as { name: string | undefined; data: SessionOpenEvent }[];
	}

	override publicLog2(name?: string, data?: unknown): void {
		this.all.push({ name, data });
	}
}

/** Every number and boolean of the event is a measurement, and no string is. */
type MeasurementsAreExact<TEvent, TClassification> = {
	[K in keyof TEvent]-?: [Exclude<TEvent[K], undefined>] extends [string]
	? TClassification extends { [P in K]: { isMeasurement: true } } ? never : true
	: TClassification extends { [P in K]: { isMeasurement: true } } ? true : never;
};
const chatOpenIsExact: MeasurementsAreExact<ChatOpenEvent, ChatOpenClassification> = {
	surface: true, outcome: true, sessionType: true, source: true, totalDurationMs: true, modelWasLoaded: true, alreadyShown: true,
};
const sessionOpenIsExact: MeasurementsAreExact<SessionOpenEvent, SessionOpenClassification> = {
	outcome: true, source: true, provider: true, alreadyActive: true, sessionWasLoading: true, modelAlreadyBound: true,
	resourceResolvedDurationMs: true, sessionLoadedDurationMs: true, modelBoundDurationMs: true, totalDurationMs: true,
};

suite('ChatOpenTelemetry', () => {
	// Registered first so the opens in flight are dropped before the leak check runs.
	teardown(() => resetChatOpenMeasurementsForTests());
	ensureNoDisposablesAreLeakedInTestSuite();

	const chat = URI.parse('vscode-chat-session://local/abc');
	const otherChat = URI.parse('vscode-chat-session://local/def');
	let log: RecordingLogService;
	let telemetry: RecordingTelemetryService;

	setup(() => {
		log = new RecordingLogService();
		telemetry = new RecordingTelemetryService();
	});

	function makeRequest(overrides: Partial<IChatOpenRequest> = {}): IChatOpenRequest {
		const now = Date.now();
		return { resource: chat, startTime: now, resolvedTime: now, source: 'link', provider: 'unknown', alreadyActive: false, chatAlreadyShown: false, sessionWasLoading: false, ...overrides };
	}

	function outcomes(): string[] {
		return telemetry.events.map(event => event.data.outcome);
	}

	test('classification marks exactly the numbers and booleans as measurements', () => {
		assert.ok(chatOpenIsExact && sessionOpenIsExact);
	});

	test('reports a completed open with trace steps, an info summary and the exact duration', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const open = startChatOpen('panel', chat, log, telemetry);
		setChatOpenModelWasLoaded(chat, false);
		setChatOpenModelWasLoaded(chat, true);
		await new Promise(resolve => setTimeout(resolve, 40));
		markChatOpen(chat, 'selectionHandled');
		open.complete();
		open.end();
		open.end();

		assert.deepStrictEqual({ events: telemetry.all, log: log.lines.map(line => line.replace(/ resource=.*/, '')) }, {
			events: [{
				name: 'agents/chatOpen',
				data: { surface: 'panel', outcome: 'completed', sessionType: 'local', source: 'unknown', totalDurationMs: 40, modelWasLoaded: false, alreadyShown: false },
			}],
			log: [
				'trace [ChatOpen] panel start +0ms',
				'trace [ChatOpen] panel selectionHandled +40ms',
				'trace [ChatOpen] panel loaded +40ms',
				'info [ChatOpen] panel completed total=40ms sessionType=local modelWasLoaded=false',
			],
		});
	}));

	test('a step never completes an open and is ignored without one', () => {
		markChatOpen(chat, 'firstRender');
		const open = startChatOpen('panel', chat, log, telemetry);
		markChatOpen(chat, 'firstRender');
		open.end();
		assert.deepStrictEqual(outcomes(), ['cancelled']);
	});

	test('an open ends as cancelled, failed or hidden as its owner decides', () => {
		startChatOpen('panel', chat, log, telemetry).end();
		const cancelled = startChatOpen('panel', chat, log, telemetry);
		cancelled.fail(new CancellationError());
		cancelled.end();
		const failed = startChatOpen('panel', chat, log, telemetry);
		failed.fail(new Error('boom'));
		failed.end();
		const hidden = startChatOpen('panel', chat, log, telemetry);
		hidden.complete(false);
		hidden.end();
		const failedAfterComplete = startChatOpen('panel', chat, log, telemetry);
		failedAfterComplete.complete();
		failedAfterComplete.fail(new Error('late'));
		failedAfterComplete.end();
		assert.deepStrictEqual(outcomes(), ['cancelled', 'cancelled', 'failed', 'hidden', 'completed']);
	});

	test('an open of the same surface or chat ends the previous one as switchedAway', () => {
		startChatOpen('panel', chat, log, telemetry);
		startChatOpen('panel', otherChat, log, telemetry);
		startChatOpen('editor', otherChat, log, telemetry, { groupId: 1 });
		startChatOpen('editor', chat, log, telemetry, { groupId: 2 }).end();
		assert.deepStrictEqual(outcomes(), ['switchedAway', 'switchedAway', 'cancelled']);
	});

	test('editor groups open side by side', () => {
		const first = startChatOpen('editor', chat, log, telemetry, { groupId: 1 });
		const second = startChatOpen('editor', otherChat, log, telemetry, { groupId: 2 });
		first.complete();
		first.end();
		second.complete();
		second.end();
		assert.deepStrictEqual(outcomes(), ['completed', 'completed']);
	});

	test('a re-show reports alreadyActive and completes at once', () => {
		const open = startChatOpen('editor', chat, log, telemetry, { groupId: 1, alreadyShown: true });
		open.complete();
		open.end();
		assert.deepStrictEqual(telemetry.events.map(({ data }) => [data.outcome, data.alreadyShown]), [['completed', true]]);
	});

	test('reports Agents window intermediates measured from the click, and none elsewhere', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const clicked = Date.now();
		await new Promise(resolve => setTimeout(resolve, 10));
		const request = makeRequest({ startTime: clicked, resolvedTime: Date.now(), source: 'sessionsList', provider: 'copilotCli', sessionWasLoading: true });
		requestChatOpen(request, log, telemetry);
		await new Promise(resolve => setTimeout(resolve, 10));
		const open = startChatOpen('agentsWindow', chat, log, telemetry, { request: takeChatOpenRequest(chat), groupId: 1 });
		request.sessionLoadedTime = Date.now();
		await new Promise(resolve => setTimeout(resolve, 30));
		open.complete();
		open.end();

		assert.deepStrictEqual(telemetry.sessionOpenEvents.map(({ data }) => [data.outcome, data.source, data.provider, data.sessionWasLoading, data.resourceResolvedDurationMs, data.sessionLoadedDurationMs, data.modelBoundDurationMs, data.totalDurationMs]), [
			['success', 'sessionsList', 'copilotCli', true, 10, 20, 50, 50],
		]);
	}));

	test('an Agents window open emits both events with one total and a consistent outcome, other surfaces only agents/chatOpen', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const request = makeRequest({ startTime: Date.now(), resolvedTime: Date.now(), source: 'link', provider: 'copilotCli', sessionWasLoading: false });
		const agents = startChatOpen('agentsWindow', chat, log, telemetry, { request, groupId: 1 });
		await new Promise(resolve => setTimeout(resolve, 25));
		agents.fail(new CancellationError());
		agents.end();
		const editor = startChatOpen('editor', otherChat, log, telemetry, { groupId: 1 });
		editor.complete();
		editor.end();
		const panel = startChatOpen('panel', chat, log, telemetry);
		panel.complete();
		panel.end();

		assert.deepStrictEqual({
			chatOpen: telemetry.events.map(({ data }) => [data.surface, data.outcome, data.source, data.totalDurationMs]),
			sessionOpen: telemetry.sessionOpenEvents.map(({ data }) => [data.outcome, data.source, data.totalDurationMs]),
		}, {
			chatOpen: [['agentsWindow', 'cancelled', 'link', 25], ['editor', 'completed', 'unknown', 0], ['panel', 'completed', 'unknown', 0]],
			sessionOpen: [['cancelled', 'link', 25]],
		});
	}));

	test('a hidden Agents window open is reported as success to agents/sessionOpen', () => {
		const request = makeRequest({ startTime: Date.now(), resolvedTime: Date.now(), source: 'link', provider: 'unknown', sessionWasLoading: false });
		const open = startChatOpen('agentsWindow', chat, log, telemetry, { request, groupId: 1 });
		open.complete(false);
		open.end();
		assert.deepStrictEqual([telemetry.events[0].data.outcome, telemetry.sessionOpenEvents[0].data.outcome], ['hidden', 'success']);
	});

	suite('opens no chat view took', () => {
		function pending(sessionOpenOnly: boolean, loaded: boolean): IChatOpenRequest {
			const request = makeRequest({ sessionOpenOnly, sessionLoadedTime: loaded ? Date.now() : undefined, provider: 'copilotCli' });
			requestChatOpen(request, log, telemetry);
			return request;
		}

		test('a session shown without a chat view is reported to agents/sessionOpen only', () => {
			finishChatOpenRequest(pending(false, true));
			assert.deepStrictEqual({ chatOpen: telemetry.events.length, sessionOpen: telemetry.sessionOpenEvents.map(({ data }) => [data.outcome, data.source, data.provider]) }, { chatOpen: 0, sessionOpen: [['success', 'link', 'copilotCli']] });
		});

		test('an untitled chat or startup restore is reported to agents/sessionOpen and not handed to a view', () => {
			const request = pending(true, true);
			assert.strictEqual(takeChatOpenRequest(chat), undefined);
			finishChatOpenRequest(request);
			assert.deepStrictEqual({ chatOpen: telemetry.events.length, sessionOpen: telemetry.sessionOpenEvents.map(({ data }) => data.outcome) }, { chatOpen: 0, sessionOpen: ['success'] });
		});

		test('failures and early exits keep their outcome', () => {
			finishChatOpenRequest(pending(false, true), new Error('boom'));
			finishChatOpenRequest(pending(false, false), new CancellationError());
			finishChatOpenRequest(pending(false, false));
			assert.deepStrictEqual(telemetry.sessionOpenEvents.map(({ data }) => data.outcome), ['failure', 'cancelled', 'cancelled']);
		});

		test('an open a chat view took is not reported twice', () => {
			const request = pending(false, true);
			const taken = takeChatOpenRequest(chat);
			finishChatOpenRequest(request);
			assert.deepStrictEqual([taken, telemetry.sessionOpenEvents.length], [request, 0]);
		});
	});

	test('a request is taken once, and one nobody finishes is reported as timed out', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const request = makeRequest();
		requestChatOpen(request, log, telemetry);
		assert.deepStrictEqual([takeChatOpenRequest(chat), takeChatOpenRequest(chat)], [request, undefined]);
		requestChatOpen(makeRequest(), log, telemetry);
		await new Promise(resolve => setTimeout(resolve, CHAT_OPEN_TIMEOUT_MS + 1));
		assert.deepStrictEqual([takeChatOpenRequest(chat), telemetry.sessionOpenEvents.map(({ data }) => [data.outcome, data.totalDurationMs])], [undefined, [['timeout', CHAT_OPEN_TIMEOUT_MS]]]);
	}));

	test('a view-owned open times out 60s after the click, not after it started', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const request = makeRequest();
		requestChatOpen(request, log, telemetry);
		await new Promise(resolve => setTimeout(resolve, 20_000));
		startChatOpen('agentsWindow', chat, log, telemetry, { request: takeChatOpenRequest(chat), groupId: 1 });
		await new Promise(resolve => setTimeout(resolve, CHAT_OPEN_TIMEOUT_MS));
		assert.deepStrictEqual(telemetry.sessionOpenEvents.map(({ data }) => [data.outcome, data.totalDurationMs]), [['timeout', CHAT_OPEN_TIMEOUT_MS]]);
	}));

	test('a replaced request is reported as cancelled', () => {
		requestChatOpen(makeRequest(), log, telemetry);
		requestChatOpen(makeRequest(), log, telemetry);
		assert.deepStrictEqual(telemetry.sessionOpenEvents.map(({ data }) => data.outcome), ['cancelled']);
	});

	test('a newer click cancels an Agents window open in agents/sessionOpen only, and the open itself goes on', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const first = makeRequest({ sessionLoadedTime: Date.now() });
		requestChatOpen(first, log, telemetry);
		const open = startChatOpen('agentsWindow', chat, log, telemetry, { request: takeChatOpenRequest(chat), groupId: 1 });
		await new Promise(resolve => setTimeout(resolve, 10));
		const pendingElsewhere = makeRequest({ resource: otherChat });
		requestChatOpen(pendingElsewhere, log, telemetry);
		requestChatOpen(makeRequest({ resource: URI.parse('vscode-chat-session://local/ghi') }), log, telemetry);
		await new Promise(resolve => setTimeout(resolve, 10));
		open.complete();
		open.end();

		assert.deepStrictEqual({
			chatOpen: telemetry.events.map(({ data }) => [data.outcome, data.totalDurationMs]),
			sessionOpen: telemetry.sessionOpenEvents.map(({ data }) => [data.outcome, data.totalDurationMs]),
		}, {
			chatOpen: [['completed', 20]],
			// The open in flight, then the click no view took yet.
			sessionOpen: [['cancelled', 10], ['cancelled', 0]],
		});
	}));

	test('a click on a chat that a host shows bound is a re-show of that host and sets modelAlreadyBound', () => {
		const reshown: IChatOpenRequest[] = [];
		const registration = registerChatOpenHost(chat, { reshow: request => { reshown.push(request); return true; } });
		const notShowing = registerChatOpenHost(otherChat, { reshow: () => false });
		const shown = makeRequest();
		const other = makeRequest({ resource: otherChat });
		requestChatOpen(shown, log, telemetry);
		requestChatOpen(other, log, telemetry);
		registration.dispose();
		notShowing.dispose();
		const afterDispose = makeRequest();
		requestChatOpen(afterDispose, log, telemetry);

		assert.deepStrictEqual([reshown.length, shown.modelAlreadyBound, other.modelAlreadyBound, afterDispose.modelAlreadyBound], [1, true, undefined, undefined]);
	});

	test('success waits for the session to load, and fails when its handling ended without loading', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const request = makeRequest();
		requestChatOpen(request, log, telemetry);
		const open = startChatOpen('agentsWindow', chat, log, telemetry, { request: takeChatOpenRequest(chat), groupId: 1 });
		let settled = false;
		const waiting = waitForChatOpenSession(request, CancellationToken.None).then(() => settled = true);
		await new Promise(resolve => setTimeout(resolve, 10));
		assert.strictEqual(settled, false);
		markChatOpenSessionLoaded(request);
		await waiting;
		open.complete();
		open.end();

		const second = makeRequest({ resource: otherChat });
		requestChatOpen(second, log, telemetry);
		const secondOpen = startChatOpen('agentsWindow', otherChat, log, telemetry, { request: takeChatOpenRequest(otherChat), groupId: 2 });
		finishChatOpenRequest(second);
		await waitForChatOpenSession(second, CancellationToken.None);
		secondOpen.fail(second.serviceError ?? new CancellationError());
		secondOpen.end();
		assert.deepStrictEqual(telemetry.sessionOpenEvents.map(({ data }) => data.outcome), ['success', 'cancelled']);
	}));

	test('a re-show reports the pending request with the model bound as the session loaded', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const request = makeRequest({ alreadyActive: true, chatAlreadyShown: true, source: 'sessionsList', provider: 'copilotCli' });
		requestChatOpen(request, log, telemetry);
		request.modelAlreadyBound = true;
		const open = startChatOpen('agentsWindow', chat, log, telemetry, { groupId: 1, alreadyShown: true, source: request.source, startTime: request.startTime });
		open.complete();
		open.end();
		await new Promise(resolve => setTimeout(resolve, 15));
		markChatOpenSessionLoaded(request);
		finishChatOpenRequest(request);
		assert.deepStrictEqual({
			chatOpen: telemetry.events.map(({ data }) => [data.outcome, data.source, data.alreadyShown]),
			sessionOpen: telemetry.sessionOpenEvents.map(({ data }) => [data.outcome, data.alreadyActive, data.modelAlreadyBound, data.sessionLoadedDurationMs, data.modelBoundDurationMs, data.totalDurationMs]),
		}, {
			chatOpen: [['completed', 'sessionsList', true]],
			sessionOpen: [['success', true, true, 15, 15, 15]],
		});
	}));

	test('an automatic open is reported to agents/sessionOpen only', () => {
		const request = makeRequest({ automatic: true });
		requestChatOpen(request, log, telemetry);
		const open = startChatOpen('agentsWindow', chat, log, telemetry, { request: takeChatOpenRequest(chat), groupId: 1 });
		open.complete();
		open.end();
		assert.deepStrictEqual([telemetry.events.length, telemetry.sessionOpenEvents.length], [0, 1]);
	});

	test('an open that never ends is reported as timed out', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		startChatOpen('panel', chat, log, telemetry);
		await new Promise(resolve => setTimeout(resolve, CHAT_OPEN_TIMEOUT_MS + 1));
		assert.deepStrictEqual(outcomes(), ['timeout']);
	}));

	test('reports a bounded session type', () => {
		assert.deepStrictEqual([
			getChatOpenSessionType(chat),
			getChatOpenSessionType(URI.parse('vscode-chat-session://copilot-cloud-agent/abc')),
			getChatOpenSessionType(URI.parse('vscode-chat-session://unknown-provider/abc')),
			getChatOpenSessionType(undefined),
		], ['local', 'cloud', 'other', 'other']);
	});
});
