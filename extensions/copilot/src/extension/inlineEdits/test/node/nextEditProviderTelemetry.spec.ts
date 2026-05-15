/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { MutableObservableDocument, MutableObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { URI } from '../../../../util/vs/base/common/uri';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { IEnhancedTelemetrySendingReason, NextEditProviderTelemetryBuilder, TelemetrySender } from '../../node/nextEditProviderTelemetry';
import { INextEditResult } from '../../node/nextEditResult';

class RecordingTelemetryService extends NullTelemetryService {
	readonly enhancedEvents: { eventName: string; properties?: TelemetryEventProperties }[] = [];

	override sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties): void {
		this.enhancedEvents.push({ eventName, properties });
	}
}

function createMockNextEditResult(): INextEditResult {
	return { requestId: 1, result: undefined };
}

function createMockBuilder(doc?: MutableObservableDocument): NextEditProviderTelemetryBuilder {
	return new NextEditProviderTelemetryBuilder(
		undefined, // gitExtensionService
		undefined, // notebookService
		undefined, // workspaceService
		'test-provider',
		doc,
	);
}

const workspaceRoot = URI.parse('file:///workspace');

describe('TelemetrySender', () => {
	let telemetryService: RecordingTelemetryService;
	let sender: TelemetrySender;
	let workspace: MutableObservableWorkspace;

	beforeEach(() => {
		vi.useFakeTimers();
		telemetryService = new RecordingTelemetryService();
		workspace = new MutableObservableWorkspace();
		sender = new TelemetrySender(workspace, telemetryService);
	});

	afterEach(() => {
		sender.dispose();
		workspace.clear();
		vi.useRealTimers();
	});

	describe('scheduleSendingEnhancedTelemetry', () => {
		const initialTimeoutMs = 2 * 60 * 1000; // matches production value

		test('sends after initial timeout when no workspace', async () => {
			const senderNoWorkspace = new TelemetrySender(undefined, telemetryService);
			const result = createMockNextEditResult();
			const builder = createMockBuilder(undefined);

			senderNoWorkspace.scheduleSendingEnhancedTelemetry(result, builder);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			await vi.advanceTimersByTimeAsync(initialTimeoutMs);

			expect(telemetryService.enhancedEvents).toHaveLength(1);
			expect(telemetryService.enhancedEvents[0].eventName).toBe('copilot-nes/provideInlineEdit');
			senderNoWorkspace.dispose();
		});

		test('sends after initial timeout + 5s idle when user is not typing', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot });
			const result = createMockNextEditResult();
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			await vi.advanceTimersByTimeAsync(initialTimeoutMs);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// Advance 5s — idle timer fires
			await vi.advanceTimersByTimeAsync(5_000);
			expect(telemetryService.enhancedEvents).toHaveLength(1);
		});

		test('resets idle timer when user types in any document during idle phase', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot });
			const otherDoc = workspace.addDocument({ id: DocumentId.create('file:///other.ts'), workspaceRoot });
			const result = createMockNextEditResult();
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);

			await vi.advanceTimersByTimeAsync(initialTimeoutMs);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// Wait 3s, then type in a DIFFERENT document
			await vi.advanceTimersByTimeAsync(3_000);
			otherDoc.setValue(new StringText('typing in other file'));

			// 3s after typing → still not sent
			await vi.advanceTimersByTimeAsync(3_000);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// 2 more seconds → 5s since last activity → sends
			await vi.advanceTimersByTimeAsync(2_000);
			expect(telemetryService.enhancedEvents).toHaveLength(1);
		});

		test('hard cap sends after 30s even if user keeps typing', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot });
			const result = createMockNextEditResult();
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);

			await vi.advanceTimersByTimeAsync(initialTimeoutMs);

			// Simulate continuous typing every 2s for 30s
			for (let i = 0; i < 15; i++) {
				await vi.advanceTimersByTimeAsync(2_000);
				doc.setValue(new StringText(`edit ${i}`));
			}

			expect(telemetryService.enhancedEvents).toHaveLength(1);
		});

		test('does not send twice', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot });
			const result = createMockNextEditResult();
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);

			await vi.advanceTimersByTimeAsync(initialTimeoutMs + 5_000);
			expect(telemetryService.enhancedEvents).toHaveLength(1);

			await vi.advanceTimersByTimeAsync(30_000);
			expect(telemetryService.enhancedEvents).toHaveLength(1);
		});

		test('dispose cancels pending initial timeout', async () => {
			const result = createMockNextEditResult();
			const builder = createMockBuilder(undefined);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			sender.dispose();

			await vi.advanceTimersByTimeAsync(initialTimeoutMs + 5_000 + 30_000);
			expect(telemetryService.enhancedEvents).toHaveLength(0);
		});

		test('dispose during idle-wait phase cancels idle timers and subscription', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot });
			const result = createMockNextEditResult();
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);

			// Advance past the 2-minute timeout to enter idle-wait phase
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// Dispose during idle-wait phase (before 5s idle timer fires)
			sender.dispose();

			// Advance past both idle timer and hard cap — nothing should be sent
			await vi.advanceTimersByTimeAsync(5_000 + 30_000);
			expect(telemetryService.enhancedEvents).toHaveLength(0);
		});
	});

	describe('enhancedTelemetrySendingReason', () => {
		const initialTimeoutMs = 2 * 60 * 1000;

		function getSendingReason(event: { properties?: TelemetryEventProperties }): IEnhancedTelemetrySendingReason | undefined {
			// Sending reason may be at top level (when alternativeAction is absent) or embedded in alternativeAction
			const topLevel = event.properties?.['enhancedTelemetrySendingReason'];
			if (topLevel) { return JSON.parse(String(topLevel)); }
			const altAction = event.properties?.['alternativeAction'];
			if (altAction) {
				const parsed = JSON.parse(String(altAction));
				return parsed.enhancedTelemetrySendingReason;
			}
			return undefined;
		}

		test('sends reason "idle" with idleTimeoutMs=0 when no workspace', async () => {
			const senderNoWorkspace = new TelemetrySender(undefined, telemetryService);
			const result = createMockNextEditResult();
			const builder = createMockBuilder(undefined);

			senderNoWorkspace.scheduleSendingEnhancedTelemetry(result, builder);
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);

			expect(telemetryService.enhancedEvents).toHaveLength(1);
			const reason = getSendingReason(telemetryService.enhancedEvents[0]);
			expect(reason).toEqual({ reason: 'idle', details: { idleTimeoutMs: 0 } });
			senderNoWorkspace.dispose();
		});

		test('sends reason "idle" with idleTimeoutMs after 5s of inactivity', async () => {
			workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot });
			const result = createMockNextEditResult();
			const builder = createMockBuilder(undefined);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			await vi.advanceTimersByTimeAsync(initialTimeoutMs + 5_000);

			expect(telemetryService.enhancedEvents).toHaveLength(1);
			const reason = getSendingReason(telemetryService.enhancedEvents[0]);
			expect(reason).toEqual({ reason: 'idle', details: { idleTimeoutMs: 5_000 } });
		});

		test('sends reason "hard_cap" when user keeps typing past 30s', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot });
			const result = createMockNextEditResult();
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);

			// Simulate continuous typing every 2s for 30s
			for (let i = 0; i < 15; i++) {
				await vi.advanceTimersByTimeAsync(2_000);
				doc.setValue(new StringText(`edit ${i}`));
			}

			expect(telemetryService.enhancedEvents).toHaveLength(1);
			const reason = getSendingReason(telemetryService.enhancedEvents[0]);
			expect(reason).toEqual({ reason: 'hard_cap', details: { hardCapTimeoutMs: 30_000 } });
		});

		test('sends reason "user_jump" with from/to when selection moves to different line in same file', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot, initialValue: 'line0\nline1\nline2' });
			const result = createMockNextEditResult();

			// Set initial selection on line 0 BEFORE creating builder (so originalSelectionLine is captured)
			doc.setSelection([OffsetRange.fromTo(0, 0)], undefined, 0);
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// Wait 1s (no recent typing), then jump selection to line 2 (offset 12 = start of "line2")
			await vi.advanceTimersByTimeAsync(1_000);
			doc.setSelection([OffsetRange.fromTo(12, 12)], undefined, 2);

			await vi.advanceTimersByTimeAsync(0); // flush
			expect(telemetryService.enhancedEvents).toHaveLength(1);
			const reason = getSendingReason(telemetryService.enhancedEvents[0]);
			expect(reason).toEqual({
				reason: 'user_jump',
				details: {
					from: { file: 'file:///test.ts', line: 0 },
					to: { file: 'file:///test.ts', line: 2 },
				},
			});
		});

		test('sends reason "user_jump" when user jumps to a different file', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot, initialValue: 'line0\nline1' });
			const otherDoc = workspace.addDocument({ id: DocumentId.create('file:///other.ts'), workspaceRoot, initialValue: 'other0\nother1\nother2' });
			const result = createMockNextEditResult();

			// Set initial selection BEFORE creating builder
			doc.setSelection([OffsetRange.fromTo(0, 0)], undefined, 0);
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// Wait 1s, then "jump" to other file by changing its selection
			await vi.advanceTimersByTimeAsync(1_000);
			otherDoc.setSelection([OffsetRange.fromTo(7, 7)], undefined, 1); // line 1 of other.ts ("other1")

			await vi.advanceTimersByTimeAsync(0); // flush
			expect(telemetryService.enhancedEvents).toHaveLength(1);
			const reason = getSendingReason(telemetryService.enhancedEvents[0]);
			expect(reason).toEqual({
				reason: 'user_jump',
				details: {
					from: { file: 'file:///test.ts', line: 0 },
					to: { file: 'file:///other.ts', line: 1 },
				},
			});
		});

		test('does not trigger user_jump for selection change on same line', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot, initialValue: 'hello world' });
			const result = createMockNextEditResult();

			doc.setSelection([OffsetRange.fromTo(0, 0)], undefined, 0);
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);

			// Move selection within the same line (offset 5 is still line 0)
			await vi.advanceTimersByTimeAsync(1_000);
			doc.setSelection([OffsetRange.fromTo(5, 5)], undefined, 0);

			await vi.advanceTimersByTimeAsync(0);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// Eventually sends via idle timer
			await vi.advanceTimersByTimeAsync(5_000);
			expect(telemetryService.enhancedEvents).toHaveLength(1);
			expect(getSendingReason(telemetryService.enhancedEvents[0])?.reason).toBe('idle');
		});

		test('does not trigger user_jump for selection change during typing', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot, initialValue: 'line0\nline1\nline2' });
			const result = createMockNextEditResult();

			doc.setSelection([OffsetRange.fromTo(0, 0)], undefined, 0);
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);

			// Type first (triggers lastTypingTime update), then immediately move selection
			doc.setValue(new StringText('line0\nline1\nline2!'));
			doc.setSelection([OffsetRange.fromTo(12, 12)], undefined, 2);

			await vi.advanceTimersByTimeAsync(0);
			// Should NOT have sent — selection change within 200ms of typing is ignored
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// Sends via idle timer instead
			await vi.advanceTimersByTimeAsync(5_000);
			expect(telemetryService.enhancedEvents).toHaveLength(1);
			expect(getSendingReason(telemetryService.enhancedEvents[0])?.reason).toBe('idle');
		});

		test('pre-existing selection on another file does not trigger false jump', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot, initialValue: 'line0\nline1' });
			const otherDoc = workspace.addDocument({ id: DocumentId.create('file:///other.ts'), workspaceRoot, initialValue: 'other0\nother1' });

			// Both docs have pre-existing selections before idle-wait starts
			doc.setSelection([OffsetRange.fromTo(0, 0)], undefined, 0);
			otherDoc.setSelection([OffsetRange.fromTo(7, 7)], undefined, 1);

			const result = createMockNextEditResult();
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);

			// No selection changes — should NOT trigger user_jump
			await vi.advanceTimersByTimeAsync(1_000);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// Eventually sends via idle timer
			await vi.advanceTimersByTimeAsync(5_000);
			expect(telemetryService.enhancedEvents).toHaveLength(1);
			expect(getSendingReason(telemetryService.enhancedEvents[0])?.reason).toBe('idle');
		});

		test('sendTelemetry during idle-wait cancels pending idle timers', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot });
			const result = createMockNextEditResult();
			const builder = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder);

			// Enter idle-wait phase
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);
			expect(telemetryService.enhancedEvents).toHaveLength(0);

			// Send via the direct path (error/cancel scenario)
			const directBuilder = createMockBuilder(undefined);
			sender.sendTelemetry(result, directBuilder);

			// Flush async _doSendEnhancedTelemetry
			await vi.advanceTimersByTimeAsync(0);
			expect(telemetryService.enhancedEvents).toHaveLength(1);

			// Advance past idle and hard cap — should NOT send again
			await vi.advanceTimersByTimeAsync(5_000 + 30_000);
			expect(telemetryService.enhancedEvents).toHaveLength(1);
		});

		test('sends undefined "from" when builder has no doc', async () => {
			workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot, initialValue: 'line0\nline1' });
			const result = createMockNextEditResult();
			// No doc on builder — nesDocId and nesDocLine will be undefined
			const builder = createMockBuilder(undefined);

			sender.scheduleSendingEnhancedTelemetry(result, builder);
			await vi.advanceTimersByTimeAsync(initialTimeoutMs);

			// Idle sends — reason should have no nesDocId so from is undefined
			await vi.advanceTimersByTimeAsync(5_000);
			expect(telemetryService.enhancedEvents).toHaveLength(1);
			const reason = getSendingReason(telemetryService.enhancedEvents[0]);
			expect(reason).toEqual({ reason: 'idle', details: { idleTimeoutMs: 5_000 } });
		});

		test('rescheduling for same result cancels previous schedule', async () => {
			const doc = workspace.addDocument({ id: DocumentId.create('file:///test.ts'), workspaceRoot });
			const result = createMockNextEditResult();
			const builder1 = createMockBuilder(doc);
			const builder2 = createMockBuilder(doc);

			sender.scheduleSendingEnhancedTelemetry(result, builder1);

			// After 1 minute, reschedule with a new builder
			await vi.advanceTimersByTimeAsync(60_000);
			sender.scheduleSendingEnhancedTelemetry(result, builder2);

			// Original 2-min timeout would fire at 120s, but it was cancelled
			// New 2-min timeout fires at 60s + 120s = 180s
			await vi.advanceTimersByTimeAsync(60_000); // at 120s total
			expect(telemetryService.enhancedEvents).toHaveLength(0); // old one cancelled

			await vi.advanceTimersByTimeAsync(60_000 + 5_000); // at 185s total — new timeout + idle
			expect(telemetryService.enhancedEvents).toHaveLength(1);
		});
	});
});
