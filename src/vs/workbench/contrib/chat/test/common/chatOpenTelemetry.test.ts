/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/runWithFakedTimers.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { CHAT_OPEN_TIMEOUT_MS, ChatOpenClassification, ChatOpenEvent, ChatOpenTelemetryService, IChatOpenTracker, getChatOpenSessionType } from '../../common/chatOpenTelemetry.js';

class TestChatOpenTelemetryService extends ChatOpenTelemetryService {
	time = 1000;

	protected override now(): number {
		return this.time;
	}
}

class RecordingLogService extends NullLogService {
	readonly lines: { level: 'info' | 'other'; message: string }[] = [];

	override info(message: string): void {
		this.lines.push({ level: 'info', message });
	}

	override trace(message: string): void {
		this.lines.push({ level: 'other', message });
	}

	override debug(message: string): void {
		this.lines.push({ level: 'other', message });
	}
}

suite('ChatOpenTelemetryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sessionResource = URI.parse('agent-host-copilotcli:/session-a');
	const chatResource = URI.parse('agent-host-copilotcli:/chat-a');

	function createService() {
		const events: { name: string; data: ChatOpenEvent }[] = [];
		const telemetryService = new class extends NullTelemetryServiceShape { override publicLog2(name?: string, data?: unknown) { events.push({ name: name ?? '', data: data as ChatOpenEvent }); } }();
		const logService = new RecordingLogService();
		const service = disposables.add(new TestChatOpenTelemetryService(telemetryService, logService));
		return { service, events, logService };
	}

	test('reports one completed open with the duration of each phase', () => {
		const { service, events } = createService();

		const tracker = service.start('agentsWindow', { sessionResource });
		service.time += 5;
		assert.strictEqual(service.claim(sessionResource, chatResource), tracker);
		tracker.setViewReused(true);
		tracker.setModelWasLoaded(false);
		tracker.mark('selectionHandled');
		service.time += 10;
		service.getTracker(chatResource)?.mark('contentRequested');
		service.time += 200;
		tracker.setHistoryItemCount(42);
		tracker.mark('contentReceived');
		service.time += 30;
		tracker.setRestoreYieldCount(3);
		tracker.mark('replayDone');
		service.time += 2;
		tracker.mark('modelPublished');
		service.time += 8;
		tracker.setInputEnabled(true);
		tracker.mark('modelAttached');
		tracker.setProgressHidden(true);
		service.time += 16;
		tracker.mark('firstRender');
		service.time += 100;
		tracker.mark('firstRender');
		tracker.finish('cancelled');

		assert.deepStrictEqual(events, [{
			name: 'chat.open',
			data: {
				surface: 'agentsWindow',
				outcome: 'completed',
				sessionType: 'localAgentHost',
				totalMs: 271,
				selectionHandledMs: 5,
				contentRequestedMs: 10,
				contentReceivedMs: 200,
				replayDoneMs: 30,
				modelPublishedMs: 2,
				modelAttachedMs: 8,
				firstRenderMs: 16,
				loadedMs: 0,
				historyItemCount: 42,
				restoreYieldCount: 3,
				modelWasLoaded: false,
				viewReused: true,
			},
		}]);
		assert.strictEqual(service.getTracker(chatResource), undefined);
	});

	test('waits for the input and the progress before completing', () => {
		const { service, events } = createService();
		const tracker = service.start('panel', { chatResource });
		tracker.bindChat(chatResource);
		tracker.mark('modelAttached');
		tracker.mark('firstRender');
		tracker.setProgressHidden(true);
		service.time += 40;
		tracker.setInputEnabled(true);

		assert.deepStrictEqual(events.map(event => ({ outcome: event.data.outcome, totalMs: event.data.totalMs, loadedMs: event.data.loadedMs })), [{ outcome: 'completed', totalMs: 40, loadedMs: 40 }]);
	});

	test('reports an open the user switched away from once and ignores its later milestones', () => {
		const { service, events } = createService();

		const first = service.start('agentsWindow', { sessionResource });
		service.claim(sessionResource, chatResource);
		first.mark('selectionHandled');
		service.time += 50;
		first.mark('contentRequested');
		service.time += 25;

		const otherChat = URI.parse('agent-host-copilotcli:/chat-b');
		const second = service.start('agentsWindow', { chatResource: otherChat });
		first.mark('contentReceived');
		first.mark('modelAttached');
		first.mark('firstRender');
		first.setProgressHidden(true);
		first.setInputEnabled(true);
		first.finish('cancelled');

		assert.deepStrictEqual(events.map(event => ({ outcome: event.data.outcome, totalMs: event.data.totalMs, selectionHandledMs: event.data.selectionHandledMs, contentRequestedMs: event.data.contentRequestedMs, contentReceivedMs: event.data.contentReceivedMs, loadedMs: event.data.loadedMs })), [
			{ outcome: 'switchedAway', totalMs: 75, selectionHandledMs: 0, contentRequestedMs: 50, contentReceivedMs: undefined, loadedMs: undefined },
		]);
		assert.strictEqual(service.getTracker(chatResource), undefined);
		assert.strictEqual(service.getTracker(otherChat), second);
	});

	function complete(tracker: IChatOpenTracker): void {
		tracker.mark('modelAttached');
		tracker.mark('firstRender');
		tracker.setProgressHidden(true);
		tracker.setInputEnabled(true);
	}

	test('tracks an Agents window open and an editor open independently', () => {
		const { service, events } = createService();
		const editorChat = URI.parse('agent-host-copilotcli:/chat-b');

		const agentsWindowOpen = service.start('agentsWindow', { sessionResource });
		service.time += 10;
		const editorOpen = service.start('editor', { chatResource: editorChat }, 1);
		editorOpen.bindChat(editorChat);
		service.time += 10;
		const claimed = service.claim(sessionResource, chatResource);
		service.getTracker(chatResource)?.mark('contentRequested');
		service.getTracker(editorChat)?.mark('contentRequested');
		service.time += 5;
		complete(editorOpen);
		service.time += 5;
		complete(agentsWindowOpen);

		assert.deepStrictEqual({
			claimed: claimed === agentsWindowOpen,
			events: events.map(event => ({ surface: event.data.surface, outcome: event.data.outcome, totalMs: event.data.totalMs, contentRequestedMs: event.data.contentRequestedMs })),
		}, {
			claimed: true,
			events: [
				{ surface: 'editor', outcome: 'completed', totalMs: 15, contentRequestedMs: 10 },
				{ surface: 'agentsWindow', outcome: 'completed', totalMs: 30, contentRequestedMs: 20 },
			],
		});
	});

	test('switches away only from the open of the same editor group', () => {
		const { service, events } = createService();
		const chatB = URI.parse('agent-host-copilotcli:/chat-b');
		const chatC = URI.parse('agent-host-copilotcli:/chat-c');

		const group1 = service.start('editor', { chatResource }, 1);
		group1.bindChat(chatResource);
		const group2 = service.start('editor', { chatResource: chatB }, 2);
		group2.bindChat(chatB);
		const panel = service.start('panel', { chatResource: chatC });
		panel.bindChat(chatC);
		service.time += 10;
		const group1Again = service.start('editor', { chatResource: chatC }, 1);
		group1Again.bindChat(chatC);
		complete(group2);
		complete(panel);

		assert.deepStrictEqual({
			events: events.map(event => ({ surface: event.data.surface, outcome: event.data.outcome })),
			chatCTracker: service.getTracker(chatC) === group1Again,
		}, {
			events: [
				{ surface: 'editor', outcome: 'switchedAway' },
				{ surface: 'editor', outcome: 'completed' },
				{ surface: 'panel', outcome: 'completed' },
			],
			chatCTracker: true,
		});
	});

	test('reports an open that does not load within the timeout as timed out', () => runWithFakedTimers({ startTime: 1000 }, async () => {
		const events: ChatOpenEvent[] = [];
		const service = disposables.add(new ChatOpenTelemetryService(new class extends NullTelemetryServiceShape { override publicLog2(_name?: string, data?: unknown) { events.push(data as ChatOpenEvent); } }(), new NullLogService()));
		const tracker = service.start('panel', { chatResource });
		tracker.bindChat(chatResource);
		tracker.mark('selectionHandled');

		await timeout(CHAT_OPEN_TIMEOUT_MS - 1);
		const beforeTimeout = events.length;
		await timeout(1);
		complete(tracker);

		assert.deepStrictEqual({ beforeTimeout, events: events.map(event => ({ outcome: event.outcome, totalMs: event.totalMs, loaded: event.loadedMs !== undefined })), tracked: service.getTracker(chatResource) }, {
			beforeTimeout: 0,
			events: [{ outcome: 'timeout', totalMs: CHAT_OPEN_TIMEOUT_MS, loaded: false }],
			tracked: undefined,
		});
	}));

	test('omits the restore milestones of an open whose model was in memory and logs them as skipped', () => {
		const { service, events, logService } = createService();

		const tracker = service.start('editor', { chatResource });
		tracker.bindChat(chatResource);
		tracker.setModelWasLoaded(true);
		tracker.mark('selectionHandled');
		service.time += 3;
		tracker.mark('modelAttached');
		service.time += 16;
		tracker.mark('firstRender');
		tracker.setProgressHidden(true);
		tracker.setInputEnabled(true);

		assert.deepStrictEqual(events.map(event => event.data), [{
			surface: 'editor',
			outcome: 'completed',
			sessionType: 'localAgentHost',
			totalMs: 19,
			selectionHandledMs: 0,
			contentRequestedMs: undefined,
			contentReceivedMs: undefined,
			replayDoneMs: undefined,
			modelPublishedMs: undefined,
			modelAttachedMs: 3,
			firstRenderMs: 16,
			loadedMs: 0,
			historyItemCount: undefined,
			restoreYieldCount: undefined,
			modelWasLoaded: true,
			viewReused: undefined,
		}]);
		assert.ok(logService.lines.at(-1)?.message.includes('skipped: contentRequested,contentReceived,replayDone,modelPublished'));
	});

	test('logs every milestone and one summary at info level, with the chat resource', () => {
		const { service, logService } = createService();

		const tracker = service.start('agentsWindow', { sessionResource });
		service.claim(sessionResource, chatResource);
		tracker.setViewReused(false);
		tracker.mark('selectionHandled');
		service.time += 12;
		tracker.setHistoryItemCount(4);
		tracker.mark('contentReceived', 'historyItems=4');
		tracker.mark('modelAttached');
		service.time += 16;
		tracker.mark('firstRender');
		tracker.setProgressHidden(true);
		tracker.setInputEnabled(true);

		assert.deepStrictEqual(logService.lines, [
			{ level: 'info', message: '[ChatOpen] #1 agentsWindow started resource=agent-host-copilotcli:/session-a' },
			{ level: 'info', message: '[ChatOpen] #1 agentsWindow selectionHandled +0ms' },
			{ level: 'info', message: '[ChatOpen] #1 agentsWindow contentReceived +12ms historyItems=4' },
			{ level: 'info', message: '[ChatOpen] #1 agentsWindow modelAttached +12ms' },
			{ level: 'info', message: '[ChatOpen] #1 agentsWindow firstRender +28ms' },
			{ level: 'info', message: '[ChatOpen] #1 agentsWindow loaded +28ms' },
			{ level: 'info', message: '[ChatOpen] #1 agentsWindow completed total=28ms sessionType=localAgentHost viewReused=false historyItems=4 phases: selectionHandled=0ms contentReceived=12ms modelAttached=0ms firstRender=16ms loaded=0ms skipped: contentRequested,replayDone,modelPublished resource=agent-host-copilotcli:/chat-a' },
		]);
	});

	test('discards a selection that never bound a chat without reporting it', () => {
		const { service, events, logService } = createService();

		const tracker = service.start('agentsWindow', { sessionResource });
		assert.strictEqual(service.claim(URI.parse('agent-host-copilotcli:/other-session'), chatResource), undefined);
		tracker.discardIfUnbound();
		tracker.finish('failed');

		assert.deepStrictEqual({ events, lastLine: logService.lines.at(-1)?.message }, {
			events: [],
			lastLine: '[ChatOpen] #1 agentsWindow discarded: no chat was loaded for the selection resource=agent-host-copilotcli:/session-a',
		});
	});

	test('claims an open that targets a chat only for that chat', () => {
		const { service } = createService();

		const tracker = service.start('agentsWindow', { sessionResource, chatResource });
		const claims = [
			service.claim(sessionResource, URI.parse('agent-host-copilotcli:/main-chat')),
			service.claim(sessionResource, chatResource),
			service.claim(sessionResource, chatResource),
		];
		tracker.discardIfUnbound();

		assert.deepStrictEqual({ claims: claims.map(claim => claim === tracker), finished: tracker.isFinished }, { claims: [false, true, false], finished: false });
	});

	test('reports an open still loading when the service is disposed as cancelled', () => {
		const events: ChatOpenEvent[] = [];
		const service = new TestChatOpenTelemetryService(new class extends NullTelemetryServiceShape { override publicLog2(_name?: string, data?: unknown) { events.push(data as ChatOpenEvent); } }(), new NullLogService());
		service.start('panel', { chatResource }).bindChat(chatResource);
		service.dispose();

		assert.deepStrictEqual(events.map(event => event.outcome), ['cancelled']);
	});

	test('categorizes session types without connection details', () => {
		assert.deepStrictEqual([
			URI.parse('vscode-chat-session://local/abc'),
			URI.parse('agent-host-claude:/abc'),
			URI.parse('remote-myhost.example.com-copilotcli:/abc'),
			URI.parse('copilot-cloud-agent:/abc'),
			URI.parse('cloud-sandbox:/abc'),
			URI.parse('openai-codex:/abc'),
			undefined,
		].map(getChatOpenSessionType), ['local', 'localAgentHost', 'remoteAgentHost', 'cloud', 'cloud', 'other', 'other']);
	});

	test('GDPR classification marks every numeric and boolean field as a measurement and no string field', () => {
		type CheckMeasurements<E, C> = {
			[K in keyof E]-?: K extends keyof C
			? NonNullable<E[K]> extends number | boolean
			? C[K] extends { isMeasurement: true } ? true : never
			: 'isMeasurement' extends keyof C[K] ? never : true
			: never;
		};
		const checked: CheckMeasurements<ChatOpenEvent, ChatOpenClassification> = {
			surface: true, outcome: true, sessionType: true, totalMs: true,
			selectionHandledMs: true, contentRequestedMs: true, contentReceivedMs: true, replayDoneMs: true, modelPublishedMs: true, modelAttachedMs: true, firstRenderMs: true, loadedMs: true,
			historyItemCount: true, restoreYieldCount: true, modelWasLoaded: true, viewReused: true,
		};
		assert.deepStrictEqual(Object.values(checked), Array(16).fill(true));
	});
});
