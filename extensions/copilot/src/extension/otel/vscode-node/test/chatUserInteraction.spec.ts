/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ReadableSpan } from '@opentelemetry/sdk-trace-node';
import { describe, expect, it, vi } from 'vitest';
import { resolveOTelConfig } from '../../../../platform/otel/common/otelConfig';
import { CapturingOTelService } from '../../../../platform/otel/common/test/capturingOTelService';
import { NodeOTelService } from '../../../../platform/otel/node/otelServiceImpl';
import { DeferredPromise } from '../../../../util/vs/base/common/async';
import { recordChatUserInteraction } from '../chatUserInteraction';

const timing = {
	schemaVersion: 1, rendererId: 'renderer', interactionOrdinal: 1, requestId: 'request-1',
	result: 'success', requestPhase: 'first', firstProgressKind: 'reasoning',
	timeToFirstProgress: 123.25, windowVisible: true, windowFocused: false,
};

describe('Chat user interaction OTel command', () => {
	it('exports producer milliseconds and an allowlist without message capture', async () => {
		const otel = new CapturingOTelService({ captureContent: false });
		await recordChatUserInteraction(otel, { ...timing, prompt: 'private', path: 'file:///private' });
		expect(otel.spans).toHaveLength(1);
		expect(otel.spans[0]).toMatchObject({
			name: 'vscode.chat.user_perceived_time_to_first_progress', ended: true,
			attributes: Object.fromEntries(Object.entries(timing).map(([key, value]) => [`vscode.chat.user_interaction.${key}`, value])),
		});
		expect(Object.keys(otel.spans[0].attributes)).toHaveLength(Object.keys(timing).length);
		expect(otel.spans[0].attributes).not.toHaveProperty('vscode.chat.user_interaction.timeToTermination');
	});

	it('preserves unsuccessful observations without inventing first progress', async () => {
		const otel = new CapturingOTelService();
		await recordChatUserInteraction(otel, {
			...timing, result: 'hidden', requestId: undefined, requestPhase: 'unknown',
			firstProgressKind: undefined, timeToFirstProgress: undefined, timeToTermination: 0,
			windowVisible: false,
		});
		expect(otel.spans[0].attributes['vscode.chat.user_interaction.timeToTermination']).toBe(0);
		expect(otel.spans[0].attributes).not.toHaveProperty('vscode.chat.user_interaction.timeToFirstProgress');
	});

	it('rejects invalid measurements and respects OTel disablement', async () => {
		const otel = new CapturingOTelService();
		for (const override of [
			{ timeToFirstProgress: NaN }, { timeToFirstProgress: -1 }, { timeToFirstProgress: Infinity },
			{ interactionOrdinal: 0 }, { schemaVersion: 2 }, { requestId: 'file:///private' },
			{ windowVisible: false }, { timeToTermination: 0 }, { firstProgressKind: 'progress' },
		]) {
			await expect(recordChatUserInteraction(otel, { ...timing, ...override })).rejects.toThrow();
		}
		expect(otel.spans).toHaveLength(0);
		const disabled = new CapturingOTelService({ enabled: false });
		const flush = vi.spyOn(disabled, 'flush');
		await recordChatUserInteraction(disabled, timing);
		expect(disabled.spans).toHaveLength(0);
		expect(flush).not.toHaveBeenCalled();
	});

	it('waits for exporter flush and propagates export failures', async () => {
		const otel = new CapturingOTelService();
		const flushed = new DeferredPromise<void>();
		const flush = vi.spyOn(otel, 'flush').mockImplementation(() => flushed.p);
		let acknowledged = false;
		const report = recordChatUserInteraction(otel, timing).then(() => { acknowledged = true; });
		try {
			await Promise.resolve();
			expect({ ended: otel.spans[0].ended, flushCalls: flush.mock.calls.length, acknowledged }).toEqual({
				ended: true, flushCalls: 1, acknowledged: false,
			});
		} finally {
			await flushed.complete();
			await report;
		}
		expect(acknowledged).toBe(true);
		flush.mockRejectedValue(new Error('export failed'));
		await expect(recordChatUserInteraction(otel, timing)).rejects.toThrow('export failed');
	});

	for (const initialized of [false, true]) {
		it(`drains the real span processor before acknowledging (${initialized ? 'initialized' : 'initializing'})`, async () => {
			const spans: ReadableSpan[] = [];
			const otel = new NodeOTelService(resolveOTelConfig({
				env: {}, extensionVersion: 'test', sessionId: 'test', settingEnabled: true,
			}), undefined, undefined, () => false, async () => ({
				spanExporter: {
					export: (batch, callback) => { spans.push(...batch); callback({ code: 0 }); },
					shutdown: async () => { },
				},
				logExporter: {
					export: (_records, callback) => callback({ code: 0 }),
					shutdown: async () => { },
				},
				metricExporter: {
					export: (_metrics, callback) => callback({ code: 0 }),
					forceFlush: async () => { },
					shutdown: async () => { },
				},
			}));
			try {
				if (initialized) {
					await otel.flush();
				}
				await recordChatUserInteraction(otel, timing);
				expect(spans.map(span => ({
					name: span.name, duration: span.attributes['vscode.chat.user_interaction.timeToFirstProgress'],
				}))).toEqual([{ name: 'vscode.chat.user_perceived_time_to_first_progress', duration: timing.timeToFirstProgress }]);
			} finally {
				await otel.shutdown();
			}
		});
	}
});
