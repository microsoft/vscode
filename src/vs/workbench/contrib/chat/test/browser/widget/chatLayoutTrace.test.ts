/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { LogLevel, NullLogService } from '../../../../../../platform/log/common/log.js';
import { ChatLayoutTrace } from '../../../browser/widget/chatLayoutTrace.js';

suite('ChatLayoutTrace', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	class RecordingLogService extends NullLogService {
		readonly messages: string[] = [];
		level = LogLevel.Trace;
		override getLevel(): LogLevel { return this.level; }
		override trace(message: string): void { this.messages.push(message); }
	}

	test('bounds a sustained render/dispose storm even when no timers can run', () => {
		const logger = store.add(new RecordingLogService());
		let now = 0;
		let formatted = 0;
		const trace = store.add(new ChatLayoutTrace(() => now, logger));
		const events = 266_384;
		for (let index = 0; index < events; index++) {
			now = Math.floor(index * 120_000 / events);
			trace.trace(index % 2 ? 'disposeElement' : 'renderElement', () => {
				formatted++;
				return `index=${index % 600}`;
			}, index % 600);
		}
		trace.dispose();
		const records = logger.messages.map(message => JSON.parse(message.slice(message.indexOf('{'))) as Record<string, { count: number; samples: string[]; firstIndex: number; lastIndex: number }>);
		assert.deepStrictEqual({
			events: records.reduce((sum, record) => sum + Object.values(record).reduce((sum, value) => sum + value.count, 0), 0),
			boundedLines: records.length <= 121,
			boundedBytes: logger.messages.every(message => message.length < 2000),
			boundedSamples: records.every(record => Object.values(record).every(value => value.samples.length <= 2)),
			boundedFormatting: formatted <= records.length * 4,
			ranges: records.every(record => record.renderElement.firstIndex === 0 && record.renderElement.lastIndex === 598
				&& record.disposeElement.firstIndex === 1 && record.disposeElement.lastIndex === 599),
		}, { events, boundedLines: true, boundedBytes: true, boundedSamples: true, boundedFormatting: true, ranges: true });
	});

	test('does not format trace messages when tracing is disabled or disposed', () => {
		const logger = store.add(new RecordingLogService());
		logger.level = LogLevel.Info;
		let formatted = 0;
		const trace = store.add(new ChatLayoutTrace(() => 0, logger));
		trace.trace('renderElement', () => { formatted++; return 'not needed'; }, 0);
		trace.dispose();
		logger.level = LogLevel.Trace;
		trace.trace('renderElement', () => { formatted++; return 'disposed'; }, 0);
		assert.deepStrictEqual({ formatted, messages: logger.messages }, { formatted: 0, messages: [] });
	});

	test('retains the final partial interval and bounds individual samples', () => {
		const logger = store.add(new RecordingLogService());
		const trace = store.add(new ChatLayoutTrace(() => 100, logger));
		trace.trace('renderElement', () => 'x'.repeat(10_000), 115);
		trace.trace('renderElement', () => 'another row', 176);
		trace.trace('disposeElement', () => 'disposed row', 107);
		trace.dispose();
		const data = JSON.parse(logger.messages[0].slice(logger.messages[0].indexOf('{'))) as Record<string, { count: number; samples: string[]; firstIndex: number; lastIndex: number }>;
		assert.deepStrictEqual({ lines: logger.messages.length, data }, {
			lines: 1,
			data: {
				renderElement: { count: 2, samples: ['x'.repeat(180), 'another row'], firstIndex: 115, lastIndex: 176 },
				disposeElement: { count: 1, samples: ['disposed row'], firstIndex: 107, lastIndex: 107 },
			},
		});
	});

	test('flushes an idle interval once and respects a change away from trace logging', () => {
		const clock = sinon.useFakeTimers();
		try {
			const logger = store.add(new RecordingLogService());
			const trace = store.add(new ChatLayoutTrace(() => clock.now, logger));
			trace.trace('renderElement', () => 'first row', 0);
			clock.tick(999);
			const beforeFlush = logger.messages.length;
			clock.tick(1);
			const afterFlush = logger.messages.length;
			trace.trace('disposeElement', () => 'last row', 0);
			logger.level = LogLevel.Info;
			clock.tick(1000);
			trace.dispose();
			assert.deepStrictEqual({ beforeFlush, afterFlush, final: logger.messages.length }, { beforeFlush: 0, afterFlush: 1, final: 1 });
		} finally {
			clock.restore();
		}
	});
});
