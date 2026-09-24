/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { ChatUserInteractionTelemetryReporter, ChatUserInteractionTimingResult, ChatUserInteractionTimingTracker, isChatFirstVisibleProgress } from '../../browser/chatUserInteractionTelemetry.js';
import { IChatToolInvocation } from '../../common/chatService/chatService.js';
import { ToolInvocationPresentation } from '../../common/tools/languageModelToolsService.js';

suite('ChatUserInteractionTelemetry', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	class TestTelemetryService extends NullTelemetryServiceShape {
		readonly events: { readonly name: string; readonly data: Record<string, unknown> }[] = [];

		override publicLog2(eventName?: string, data?: Record<string, unknown>): void {
			if (eventName && data) {
				this.events.push({ name: eventName, data });
			}
		}
	}

	class TestLogService extends NullLogService {
		readonly entries: { readonly message: string; readonly args: unknown[] }[] = [];

		override trace(message: string, ...args: unknown[]): void {
			this.entries.push({ message, args });
		}
	}

	function createWindow() {
		const windowEvents = new EventTarget();
		const documentEvents = new EventTarget();
		let visibilityState: DocumentVisibilityState = 'visible';
		let focused = true;
		let nextFrame = 0;
		const callbacks = new Map<number, FrameRequestCallback>();
		const cancelledFrames: number[] = [];
		const window = upcastPartial<Window>({
			document: upcastPartial<Document>({
				get visibilityState() { return visibilityState; },
				hasFocus: () => focused,
				createElement: () => { throw new Error('Telemetry must not create DOM elements, including in auxiliary windows'); },
				addEventListener: (...args: Parameters<EventTarget['addEventListener']>) => documentEvents.addEventListener(...args),
				removeEventListener: (...args: Parameters<EventTarget['removeEventListener']>) => documentEvents.removeEventListener(...args),
			}),
			addEventListener: (...args: Parameters<EventTarget['addEventListener']>) => windowEvents.addEventListener(...args),
			removeEventListener: (...args: Parameters<EventTarget['removeEventListener']>) => windowEvents.removeEventListener(...args),
			requestAnimationFrame: callback => {
				const id = ++nextFrame;
				callbacks.set(id, callback);
				return id;
			},
			cancelAnimationFrame: id => {
				cancelledFrames.push(id);
				callbacks.delete(id);
			},
		});
		return {
			window,
			callbacks,
			cancelledFrames,
			frame: () => {
				const pending = [...callbacks.values()];
				callbacks.clear();
				for (const callback of pending) {
					callback(0);
				}
			},
			hide: () => {
				visibilityState = 'hidden';
				documentEvents.dispatchEvent(new globalThis.Event('visibilitychange'));
			},
			show: () => {
				visibilityState = 'visible';
				documentEvents.dispatchEvent(new globalThis.Event('visibilitychange'));
			},
			blur: () => { focused = false; },
			close: () => windowEvents.dispatchEvent(new globalThis.Event('pagehide')),
		};
	}

	function createHarness() {
		let now = 100;
		const tracker = disposables.add(new ChatUserInteractionTimingTracker(() => now));
		const telemetryService = new TestTelemetryService();
		const logService = new TestLogService();
		const reporter = disposables.add(new ChatUserInteractionTelemetryReporter(tracker, telemetryService, logService));
		return { tracker, reporter, telemetryService, logService, setTime: (value: number) => { now = value; } };
	}

	test('uses provider-neutral meaningful progress semantics', () => {
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking' }), false);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking', value: '' }), false);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking', value: [' ', ''] }), false);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking', value: 'Reasoning' }), true);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'thinking', value: ['', 'Reasoning'] }), true);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'progressMessage', content: new MarkdownString('Thinking'), shimmer: true }), false);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'markdownContent', content: new MarkdownString(' \n') }), false);
		assert.strictEqual(isChatFirstVisibleProgress({ kind: 'markdownContent', content: new MarkdownString('Response') }), true);
		assert.strictEqual(isChatFirstVisibleProgress(upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation', presentation: ToolInvocationPresentation.Hidden })), false);
		assert.strictEqual(isChatFirstVisibleProgress(upcastPartial<IChatToolInvocation>({ kind: 'toolInvocation' })), true);
	});

	test('completes once after two animation frames', () => {
		const target = createWindow();
		const { tracker, telemetryService, setTime } = createHarness();
		const timer = tracker.start('turn', target.window);
		tracker.completeAfterRender(timer, target.window, () => true);
		tracker.completeAfterRender(timer, target.window, () => true);
		assert.strictEqual(target.callbacks.size, 1);
		setTime(200);
		target.frame();
		assert.strictEqual(telemetryService.events.length, 0);
		setTime(350);
		target.frame();
		tracker.complete(timer);
		tracker.cancel(timer);
		assert.deepStrictEqual(telemetryService.events.map(event => ({
			result: event.data.result,
			timeToFirstProgress: event.data.timeToFirstProgress,
			timeToTermination: event.data.timeToTermination,
		})), [{ result: 'success', timeToFirstProgress: 250, timeToTermination: undefined }]);
		assert.strictEqual(target.callbacks.size, 0);
	});

	test('cancellation clears pending animation frames and prevents completion', () => {
		const target = createWindow();
		const { tracker, telemetryService } = createHarness();
		const timer = tracker.start('turn', target.window);
		tracker.completeAfterRender(timer, target.window, () => true);
		target.frame();
		tracker.cancel(timer, 'cancelled');
		target.frame();
		tracker.complete(timer);
		assert.deepStrictEqual({
			pendingFrames: target.callbacks.size,
			cancelledFrames: target.cancelledFrames,
			results: telemetryService.events.map(event => event.data.result),
		}, { pendingFrames: 0, cancelledFrames: [2], results: ['cancelled'] });
	});

	test('logs correlated start and end boundaries without creating DOM elements', () => {
		const target = createWindow();
		const { tracker, telemetryService, logService, setTime } = createHarness();
		const timer = tracker.start('turn', target.window);
		tracker.setContext(timer, {
			chatSessionId: 'session-id',
			sessionType: 'remote-agent-host',
			harness: 'copilotcli',
		});
		tracker.setContext(timer, {
			requestId: 'request-id',
			agent: 'agent-id',
		});
		tracker.completeAfterRender(timer, target.window, () => true);
		setTime(350);
		target.frame();
		target.frame();
		tracker.setContext(timer, { requestId: 'too-late' });
		const data = {
			timeToFirstProgress: 250,
			timeToTermination: undefined,
			result: 'success',
			interactionKind: 'turn',
			requestId: 'request-id',
			chatSessionId: 'session-id',
			agent: 'agent-id',
			agentExtensionId: undefined,
			location: undefined,
			model: undefined,
			permissionLevel: undefined,
			chatMode: undefined,
			sessionType: 'remote-agent-host',
			harness: 'copilotcli',
			windowVisible: true,
			windowFocused: true,
		};
		assert.deepStrictEqual({ events: telemetryService.events, logs: logService.entries }, {
			events: [{ name: 'chat.userPerceivedTimeToFirstProgress', data }],
			logs: [
				{ message: '[ChatTTFP] start', args: [{ interactionId: timer.id, interactionKind: 'turn' }] },
				{ message: '[ChatTTFP] end', args: [{ interactionId: timer.id, ...data }] },
			],
		});
	});

	for (const result of ['cancelled', 'error', 'completedWithoutProgress', 'notDispatched', 'navigated', 'hidden', 'timedOut', 'disposed'] satisfies Exclude<ChatUserInteractionTimingResult, 'success'>[]) {
		test(`reports ${result} without a time to first progress`, () => {
			const target = createWindow();
			const { tracker, telemetryService, setTime } = createHarness();
			target.blur();
			const timer = tracker.start('fork', target.window);
			setTime(175);
			tracker.cancel(timer, result);
			assert.deepStrictEqual(telemetryService.events.map(event => ({
				result: event.data.result,
				interactionKind: event.data.interactionKind,
				timeToFirstProgress: event.data.timeToFirstProgress,
				timeToTermination: event.data.timeToTermination,
				windowVisible: event.data.windowVisible,
				windowFocused: event.data.windowFocused,
			})), [{ result, interactionKind: 'fork', timeToFirstProgress: undefined, timeToTermination: 75, windowVisible: true, windowFocused: false }]);
		});
	}

	for (const frameCount of [0, 1]) {
		test(`rechecks widget visibility after ${frameCount} animation frames`, () => {
			const target = createWindow();
			const { tracker, telemetryService } = createHarness();
			const timer = tracker.start('turn', target.window);
			let visible = true;
			tracker.completeAfterRender(timer, target.window, () => visible);
			for (let i = 0; i < frameCount; i++) {
				target.frame();
			}
			visible = false;
			target.frame();
			assert.deepStrictEqual(telemetryService.events.map(event => event.data.result), ['hidden']);
			assert.strictEqual(target.callbacks.size, 0);
		});
	}

	test('hiding the render document cancels a pending render measurement', () => {
		const source = createWindow();
		const target = createWindow();
		const { tracker, telemetryService } = createHarness();
		const timer = tracker.start('fork', source.window);
		tracker.completeAfterRender(timer, target.window, () => true);
		target.hide();
		assert.deepStrictEqual({
			results: telemetryService.events.map(event => event.data.result),
			pendingFrames: target.callbacks.size,
		}, { results: ['hidden'], pendingFrames: 0 });
	});

	test('hiding before progress ends the observation and showing never resumes it', () => {
		const target = createWindow();
		const { tracker, telemetryService, setTime } = createHarness();
		const timer = tracker.start('turn', target.window);
		setTime(160);
		target.hide();
		setTime(1000);
		tracker.completeAfterRender(timer, target.window, () => true);
		target.show();
		target.frame();
		target.frame();
		tracker.complete(timer);
		assert.deepStrictEqual(telemetryService.events.map(event => ({
			result: event.data.result,
			timeToFirstProgress: event.data.timeToFirstProgress,
			timeToTermination: event.data.timeToTermination,
		})), [{ result: 'hidden', timeToFirstProgress: undefined, timeToTermination: 60 }]);
		assert.strictEqual(tracker.isActive(timer), false);
	});

	for (const hiddenSource of ['document', 'widget'] as const) {
		test(`a submission starting in a hidden ${hiddenSource} is ineligible`, () => {
			const target = createWindow();
			const { tracker, telemetryService } = createHarness();
			if (hiddenSource === 'document') {
				target.hide();
			}
			const timer = tracker.start('turn', target.window, { sessionType: 'local' }, hiddenSource !== 'widget');
			target.show();
			tracker.completeAfterRender(timer, target.window, () => true);
			target.frame();
			assert.deepStrictEqual(telemetryService.events.map(event => ({
				result: event.data.result,
				sessionType: event.data.sessionType,
				timeToFirstProgress: event.data.timeToFirstProgress,
				timeToTermination: event.data.timeToTermination,
			})), [{ result: 'hidden', sessionType: 'local', timeToFirstProgress: undefined, timeToTermination: 0 }]);
		});
	}

	test('losing focus alone does not end a visible observation', () => {
		const target = createWindow();
		const { tracker, telemetryService, setTime } = createHarness();
		const timer = tracker.start('turn', target.window);
		target.blur();
		tracker.completeAfterRender(timer, target.window, () => true);
		setTime(180);
		target.frame();
		target.frame();
		assert.deepStrictEqual(telemetryService.events.map(event => ({
			result: event.data.result,
			timeToFirstProgress: event.data.timeToFirstProgress,
			windowVisible: event.data.windowVisible,
			windowFocused: event.data.windowFocused,
		})), [{ result: 'success', timeToFirstProgress: 80, windowVisible: true, windowFocused: false }]);
	});

	test('closing the source or render window disposes the interaction', () => {
		const source = createWindow();
		const target = createWindow();
		const { tracker, telemetryService } = createHarness();
		const pending = tracker.start('turn', source.window);
		source.close();
		const rendering = tracker.start('fork', source.window);
		tracker.completeAfterRender(rendering, target.window, () => true);
		target.close();
		tracker.complete(pending);
		assert.deepStrictEqual({
			results: telemetryService.events.map(event => event.data.result),
			pendingFrames: target.callbacks.size,
		}, { results: ['disposed', 'disposed'], pendingFrames: 0 });
	});

	test('disposing the tracker ends all active interactions and releases frames', () => {
		const target = createWindow();
		const { tracker, telemetryService } = createHarness();
		tracker.start('turn', target.window);
		const timer = tracker.start('fork', target.window);
		tracker.completeAfterRender(timer, target.window, () => true);
		tracker.dispose();
		target.close();
		target.frame();
		assert.deepStrictEqual({
			results: telemetryService.events.map(event => event.data.result),
			pendingFrames: target.callbacks.size,
		}, { results: ['disposed', 'disposed'], pendingFrames: 0 });
	});
});
