/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NullGitExtensionService } from '../../../../platform/git/common/nullGitExtensionService';
import { DocumentId } from '../../../../platform/inlineEdits/common/dataTypes/documentId';
import { MutableObservableWorkspace } from '../../../../platform/inlineEdits/common/observableWorkspace';
import { NullTelemetryService } from '../../../../platform/telemetry/common/nullTelemetryService';
import { TelemetryEventMeasurements, TelemetryEventProperties } from '../../../../platform/telemetry/common/telemetry';
import { URI } from '../../../../util/vs/base/common/uri';
import { StringEdit, StringReplacement } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../util/vs/editor/common/core/ranges/offsetRange';
import { ContinuousEnhancedTelemetrySender } from '../../node/continuousEnhancedTelemetrySender';
import { DebugRecorder } from '../../node/debugRecorder';

interface CapturedEvent {
	eventName: string;
	properties?: TelemetryEventProperties;
	measurements?: TelemetryEventMeasurements;
}

class RecordingTelemetryService extends NullTelemetryService {
	readonly enhancedEvents: CapturedEvent[] = [];

	override sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
		this.enhancedEvents.push({ eventName, properties, measurements });
	}
}

const workspaceRoot = URI.parse('file:///workspace');

const { WINDOW_MS, OVERLAP_MS, INTERVAL_MS, IDLE_MS, HARD_CAP_MS } = ContinuousEnhancedTelemetrySender;

describe('ContinuousEnhancedTelemetrySender', () => {
	let telemetry: RecordingTelemetryService;
	let workspace: MutableObservableWorkspace;
	let recorder: DebugRecorder;
	let sender: ContinuousEnhancedTelemetrySender | undefined;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		telemetry = new RecordingTelemetryService();
		workspace = new MutableObservableWorkspace();
		recorder = new DebugRecorder(workspace, () => Date.now());
	});

	afterEach(() => {
		sender?.dispose();
		sender = undefined;
		recorder.dispose();
		workspace.clear();
		vi.useRealTimers();
	});

	function makeSender(): ContinuousEnhancedTelemetrySender {
		return new ContinuousEnhancedTelemetrySender(
			recorder,
			workspace,
			telemetry,
			new NullGitExtensionService(),
		);
	}

	function addDocAndEdit(text: string): void {
		const id = DocumentId.create(`file:///workspace/${Math.random().toString(36).slice(2)}.ts`);
		const doc = workspace.addDocument({ id, workspaceRoot, initialValue: '' });
		doc.applyEdit(new StringEdit([StringReplacement.replace(new OffsetRange(0, 0), text)]));
	}

	function editExistingDoc(): void {
		const docs = workspace.openDocuments.get();
		if (docs.length === 0) {
			addDocAndEdit('x');
			return;
		}
		const doc = workspace.getDocument(docs[0].id)!;
		const cur = doc.value.get().value;
		doc.applyEdit(new StringEdit([StringReplacement.replace(new OffsetRange(cur.length, cur.length), 'y')]));
	}

	test('skips empty slices (no edits)', async () => {
		sender = makeSender();

		// No edits at all — after a full tick + idle wait, nothing should be sent
		await vi.advanceTimersByTimeAsync(INTERVAL_MS + IDLE_MS);
		expect(telemetry.enhancedEvents).toHaveLength(0);
	});

	test('sends after interval + idle when user pauses', async () => {
		sender = makeSender();

		addDocAndEdit('hello');

		// Before interval, nothing fired
		await vi.advanceTimersByTimeAsync(INTERVAL_MS - 1);
		expect(telemetry.enhancedEvents).toHaveLength(0);

		// Tick fires at INTERVAL_MS; then idle wait of IDLE_MS (no edits during this period)
		await vi.advanceTimersByTimeAsync(1 + IDLE_MS);
		expect(telemetry.enhancedEvents).toHaveLength(1);

		const evt = telemetry.enhancedEvents[0];
		expect(evt.eventName).toBe('copilot-nes/provideInlineEdit');
		expect(evt.properties?.continuous).toBe('true');
		const recording = JSON.parse(evt.properties!.recording as string);
		expect(recording.sequenceNumber).toBe(0);
		expect(typeof recording.sessionId).toBe('string');
		expect(recording.windowEnd - recording.windowStart).toBe(WINDOW_MS);
	});

	test('hard cap forces a send even while user keeps typing', async () => {
		sender = makeSender();

		addDocAndEdit('initial');

		// Reach the first tick
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);

		// Type continuously for 30s — idle timer keeps resetting but hard cap should still fire
		for (let i = 0; i < 15; i++) {
			await vi.advanceTimersByTimeAsync(2_000);
			editExistingDoc();
		}

		expect(telemetry.enhancedEvents).toHaveLength(1);
	});

	test('two consecutive slices overlap by at least 30 s (under steady idle behaviour)', async () => {
		sender = makeSender();

		addDocAndEdit('a');

		// First send (tick + idle wait, no edits during idle)
		await vi.advanceTimersByTimeAsync(INTERVAL_MS + IDLE_MS);
		expect(telemetry.enhancedEvents).toHaveLength(1);

		// Keep editing periodically so the second slice has content
		for (let i = 0; i < 4; i++) {
			await vi.advanceTimersByTimeAsync(60_000);
			editExistingDoc();
		}
		// Drain idle wait
		await vi.advanceTimersByTimeAsync(IDLE_MS);
		expect(telemetry.enhancedEvents).toHaveLength(2);

		const r0 = JSON.parse(telemetry.enhancedEvents[0].properties!.recording as string);
		const r1 = JSON.parse(telemetry.enhancedEvents[1].properties!.recording as string);

		expect(r1.sequenceNumber).toBe(r0.sequenceNumber + 1);
		expect(r1.sessionId).toBe(r0.sessionId);

		const overlap = r0.windowEnd - r1.windowStart;
		expect(overlap).toBeGreaterThanOrEqual(OVERLAP_MS);
	});

	test('caps entries when serialised payload exceeds 200 KB', async () => {
		sender = makeSender();

		// Add an edit large enough to push the serialised payload past the cap
		const id = DocumentId.create('file:///workspace/large.ts');
		const doc = workspace.addDocument({ id, workspaceRoot, initialValue: '' });
		const huge = 'x'.repeat(250 * 1024);
		doc.applyEdit(new StringEdit([StringReplacement.replace(new OffsetRange(0, 0), huge)]));

		await vi.advanceTimersByTimeAsync(INTERVAL_MS + IDLE_MS);
		expect(telemetry.enhancedEvents).toHaveLength(1);

		const recording = JSON.parse(telemetry.enhancedEvents[0].properties!.recording as string);
		expect(recording.entries).toBeUndefined();
		expect(recording.entriesSize).toBeGreaterThan(200 * 1024);
	});

	test('dispose during idle wait cancels the pending send', async () => {
		sender = makeSender();

		addDocAndEdit('hello');

		// Reach idle-wait phase
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);
		expect(telemetry.enhancedEvents).toHaveLength(0);

		sender.dispose();
		sender = undefined;

		// Past idle + hard cap — still nothing
		await vi.advanceTimersByTimeAsync(IDLE_MS + HARD_CAP_MS);
		expect(telemetry.enhancedEvents).toHaveLength(0);
	});

	test('a throw from the telemetry service does not kill the loop', async () => {
		// First call throws, subsequent calls succeed — emulates a transient failure.
		let calls = 0;
		const throwingTelemetry = new (class extends RecordingTelemetryService {
			override sendEnhancedGHTelemetryEvent(eventName: string, properties?: TelemetryEventProperties, measurements?: TelemetryEventMeasurements): void {
				calls++;
				if (calls === 1) {
					throw new Error('boom');
				}
				super.sendEnhancedGHTelemetryEvent(eventName, properties, measurements);
			}
		})();
		sender = new ContinuousEnhancedTelemetrySender(
			recorder,
			workspace,
			throwingTelemetry,
			new NullGitExtensionService(),
		);

		addDocAndEdit('a');

		// First tick — _sendNow throws, but reschedule() must still fire.
		await expect(vi.advanceTimersByTimeAsync(INTERVAL_MS + IDLE_MS)).rejects.toThrow('boom');
		expect(calls).toBe(1);
		expect(throwingTelemetry.enhancedEvents).toHaveLength(0);

		// Type something so the next slice has content and produce another full cycle.
		editExistingDoc();
		await vi.advanceTimersByTimeAsync(INTERVAL_MS + IDLE_MS);

		// Second tick succeeded — loop kept ticking.
		expect(calls).toBe(2);
		expect(throwingTelemetry.enhancedEvents).toHaveLength(1);
	});
});
