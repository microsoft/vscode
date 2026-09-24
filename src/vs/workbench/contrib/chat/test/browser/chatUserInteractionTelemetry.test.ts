/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatUserInteractionTelemetryReporter, ChatUserInteractionTimingTracker, isChatFirstVisibleProgress } from '../../browser/chatUserInteractionTelemetry.js';

suite('ChatUserInteractionTelemetry', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	class TestTelemetryService extends NullTelemetryServiceShape {
		readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

		override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
			if (eventName && data) {
				this.events.push({ name: eventName, data });
			}
		}
	}

	test('uses provider-neutral meaningful progress semantics', () => {
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking' }), false);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking', value: '' }), false);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking', value: [' ', ''] }), false);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking', value: 'Reasoning' }), true);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking', value: ['', 'Reasoning'] }), true);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'progressMessage', content: new MarkdownString('Thinking'), shimmer: true }), false);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'markdownContent', content: new MarkdownString('Response') }), true);
	});

	test('completes once after two animation frames', () => {
		const callbacks: FrameRequestCallback[] = [];
		const window = {
			requestAnimationFrame: (callback: FrameRequestCallback) => {
				callbacks.push(callback);
				return callbacks.length;
			},
		} as unknown as Window;
		const tracker = new ChatUserInteractionTimingTracker();
		const timer = tracker.start('turn', window);
		let completions = 0;
		const listener = tracker.onDidComplete(() => completions++);

		tracker.completeAfterRender(timer, window);
		tracker.completeAfterRender(timer, window);
		assert.strictEqual(callbacks.length, 1);

		callbacks.shift()!(0);
		assert.strictEqual(completions, 0);
		callbacks.shift()!(0);
		tracker.complete(timer);
		assert.strictEqual(completions, 1);
		listener.dispose();
		tracker.dispose();
	});

	test('cancellation prevents completion', () => {
		const window = { requestAnimationFrame: () => 0 } as unknown as Window;
		const tracker = new ChatUserInteractionTimingTracker();
		const timer = tracker.start('fork', window);
		let cancellations = 0;
		let completions = 0;
		const cancellationListener = tracker.onDidCancel(() => cancellations++);
		const completionListener = tracker.onDidComplete(() => completions++);

		tracker.cancel(timer);
		tracker.complete(timer);

		assert.strictEqual(cancellations, 1);
		assert.strictEqual(completions, 0);
		cancellationListener.dispose();
		completionListener.dispose();
		tracker.dispose();
	});

	test('reports end-to-end time and chat context after rendered progress', () => {
		const callbacks: FrameRequestCallback[] = [];
		const window = {
			document: {
				visibilityState: 'visible',
				hasFocus: () => true,
			},
			requestAnimationFrame: (callback: FrameRequestCallback) => {
				callbacks.push(callback);
				return callbacks.length;
			},
		} as unknown as Window;
		const tracker = new ChatUserInteractionTimingTracker();
		const telemetryService = new TestTelemetryService();
		const reporter = new ChatUserInteractionTelemetryReporter(tracker, telemetryService);
		const timer = tracker.start('turn', window);

		tracker.setContext(timer, {
			requestId: 'request-id',
			chatSessionId: 'session-id',
			agent: 'agent-id',
			sessionType: 'agent-host-copilotcli',
			harness: 'copilotcli',
		});
		tracker.completeAfterRender(timer, window);
		callbacks.shift()!(0);
		callbacks.shift()!(0);

		assert.strictEqual(telemetryService.events.length, 1);
		const event = telemetryService.events[0];
		assert.strictEqual(event.name, 'chat.userPerceivedTimeToFirstProgress');
		assert.strictEqual(event.data.result, 'success');
		assert.strictEqual(event.data.interactionKind, 'turn');
		assert.strictEqual(event.data.requestId, 'request-id');
		assert.strictEqual(event.data.chatSessionId, 'session-id');
		assert.strictEqual(event.data.agent, 'agent-id');
		assert.strictEqual(event.data.sessionType, 'agent-host-copilotcli');
		assert.strictEqual(event.data.harness, 'copilotcli');
		assert.strictEqual(event.data.windowVisible, true);
		assert.strictEqual(event.data.windowFocused, true);
		assert.ok(typeof event.data.timeToFirstProgress === 'number');
		assert.strictEqual(event.data.timeToTermination, undefined);

		reporter.dispose();
		tracker.dispose();
	});

	test('reports ended interactions without a time to first progress', () => {
		const window = {
			document: {
				visibilityState: 'hidden',
				hasFocus: () => false,
			},
			requestAnimationFrame: () => 0,
		} as unknown as Window;
		const tracker = new ChatUserInteractionTimingTracker();
		const telemetryService = new TestTelemetryService();
		const reporter = new ChatUserInteractionTelemetryReporter(tracker, telemetryService);
		const timer = tracker.start('fork', window);

		tracker.cancel(timer, 'timedOut');

		assert.strictEqual(telemetryService.events.length, 1);
		const event = telemetryService.events[0];
		assert.strictEqual(event.data.result, 'timedOut');
		assert.strictEqual(event.data.interactionKind, 'fork');
		assert.strictEqual(event.data.timeToFirstProgress, undefined);
		assert.ok(typeof event.data.timeToTermination === 'number');
		assert.strictEqual(event.data.windowVisible, false);
		assert.strictEqual(event.data.windowFocused, false);

		reporter.dispose();
		tracker.dispose();
	});
});
