/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LogLevel } from '../../../log/common/log.js';
import {
	buildOtlpLogsChannelUri,
	extractLevelFromOtlpLogsUri,
	iterateOtlpLogRecords,
	levelToSeverityNumber,
	logLevelToOtlpLevelName,
	logLevelToOtlpSeverity,
	OtlpEmitterLogger,
	OtlpLogEmitter,
	parseOtlpLogLevel,
	severityNumberToLogLevel,
	toResourceLogsPayload,
	type IOtlpLogRecord,
} from '../../common/otlp/otlpLogEmitter.js';

suite('OtlpLogEmitter', () => {

	const disposables = new DisposableStore();

	teardown(() => disposables.clear());
	ensureNoDisposablesAreLeakedInTestSuite();

	test('level <-> severity number mappings are inverse-ish', () => {
		// Each VS Code level → severity number, then back, should land on
		// the same level (the boundary numbers are picked to make this hold).
		const cases: [LogLevel, number][] = [
			[LogLevel.Trace, 1],
			[LogLevel.Debug, 5],
			[LogLevel.Info, 9],
			[LogLevel.Warning, 13],
			[LogLevel.Error, 17],
		];
		const observed = cases.map(([level]) => {
			const { severityNumber, severityText } = logLevelToOtlpSeverity(level);
			return { level, severityNumber, severityText, roundTrip: severityNumberToLogLevel(severityNumber) };
		});
		assert.deepStrictEqual(observed, [
			{ level: LogLevel.Trace, severityNumber: 1, severityText: 'trace', roundTrip: LogLevel.Trace },
			{ level: LogLevel.Debug, severityNumber: 5, severityText: 'debug', roundTrip: LogLevel.Debug },
			{ level: LogLevel.Info, severityNumber: 9, severityText: 'info', roundTrip: LogLevel.Info },
			{ level: LogLevel.Warning, severityNumber: 13, severityText: 'warn', roundTrip: LogLevel.Warning },
			{ level: LogLevel.Error, severityNumber: 17, severityText: 'error', roundTrip: LogLevel.Error },
		]);
	});

	test('parseOtlpLogLevel + level name helpers', () => {
		assert.deepStrictEqual(
			{
				trace: parseOtlpLogLevel('trace'),
				TRACE: parseOtlpLogLevel('TRACE'),
				fatal: parseOtlpLogLevel('Fatal'),
				bogus: parseOtlpLogLevel('verbose'),
				off: logLevelToOtlpLevelName(LogLevel.Off),
				info: logLevelToOtlpLevelName(LogLevel.Info),
				traceBoundary: levelToSeverityNumber('trace'),
				warnBoundary: levelToSeverityNumber('warn'),
			},
			{
				trace: 'trace',
				TRACE: 'trace',
				fatal: 'fatal',
				bogus: undefined,
				off: undefined,
				info: 'info',
				traceBoundary: 1,
				warnBoundary: 13,
			},
		);
	});

	test('OtlpEmitterLogger fans logs onto the shared emitter', () => {
		const emitter = disposables.add(new OtlpLogEmitter());
		const logger = disposables.add(new OtlpEmitterLogger(emitter, LogLevel.Trace));
		const received: IOtlpLogRecord[] = [];
		disposables.add(emitter.onDidLog(record => received.push(record)));

		logger.trace('hello trace');
		logger.debug('hello debug');
		logger.info('hello info');
		logger.warn('hello warn');
		logger.error('hello error');

		// Filter out timestamp for stable assertion (timeUnixNano is real-time).
		const sanitised = received.map(r => ({ severityNumber: r.severityNumber, severityText: r.severityText, body: r.body }));
		assert.deepStrictEqual(sanitised, [
			{ severityNumber: 1, severityText: 'trace', body: 'hello trace' },
			{ severityNumber: 5, severityText: 'debug', body: 'hello debug' },
			{ severityNumber: 9, severityText: 'info', body: 'hello info' },
			{ severityNumber: 13, severityText: 'warn', body: 'hello warn' },
			{ severityNumber: 17, severityText: 'error', body: 'hello error' },
		]);
	});

	test('logger level gates which records reach the OTLP emitter', () => {
		const emitter = disposables.add(new OtlpLogEmitter());
		const otlpLogger = disposables.add(new OtlpEmitterLogger(emitter, LogLevel.Warning));
		const received: IOtlpLogRecord[] = [];
		disposables.add(emitter.onDidLog(record => received.push(record)));

		otlpLogger.trace('should-drop');
		otlpLogger.debug('should-drop');
		otlpLogger.info('should-drop');
		otlpLogger.warn('should-pass');
		otlpLogger.error('should-pass');

		assert.deepStrictEqual(received.map(r => r.body), ['should-pass', 'should-pass']);
	});

	test('toResourceLogsPayload + iterateOtlpLogRecords round-trip', () => {
		const record: IOtlpLogRecord = {
			timeUnixNano: '123000000',
			severityNumber: 9,
			severityText: 'info',
			body: 'a body',
		};
		const payload = toResourceLogsPayload(record);
		const decoded = [...iterateOtlpLogRecords(payload)];
		assert.deepStrictEqual(decoded, [record]);
	});

	test('iterateOtlpLogRecords tolerates malformed shapes', () => {
		const decoded = [
			...iterateOtlpLogRecords({ resourceLogs: [{ scopeLogs: [{ logRecords: [null, { severityNumber: 'bad' }] }] }] }),
			...iterateOtlpLogRecords({ resourceLogs: 'nope' }),
			...iterateOtlpLogRecords(undefined),
		];
		// One malformed record passes through with sensible defaults; the
		// rest are silently dropped without throwing.
		assert.deepStrictEqual(decoded, [{
			timeUnixNano: '0',
			severityNumber: 0,
			severityText: 'trace',
			body: '',
		}]);
	});

	test('buildOtlpLogsChannelUri + extractLevelFromOtlpLogsUri round-trip', () => {
		const cases = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
		assert.deepStrictEqual(
			cases.map(level => ({ level, uri: buildOtlpLogsChannelUri(level), parsed: extractLevelFromOtlpLogsUri(buildOtlpLogsChannelUri(level)) })),
			cases.map(level => ({ level, uri: `ahp-otlp://logs/${level}`, parsed: level })),
		);
	});

	test('extractLevelFromOtlpLogsUri rejects unknown shapes', () => {
		assert.deepStrictEqual(
			{
				bareScheme: extractLevelFromOtlpLogsUri('ahp-otlp://logs'),
				unknownLevel: extractLevelFromOtlpLogsUri('ahp-otlp://logs/verbose'),
				wrongScheme: extractLevelFromOtlpLogsUri('ahp-state://logs/info'),
			},
			{
				bareScheme: undefined,
				unknownLevel: undefined,
				wrongScheme: undefined,
			},
		);
	});
});
