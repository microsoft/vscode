/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { AbstractLogger, DEFAULT_LOG_LEVEL, ILogger, ILoggerService, LogLevel, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { TelemetryLogAppender } from '../../common/telemetryLogAppender.js';

class TestTelemetryLogger extends AbstractLogger implements ILogger {

	public logs: string[] = [];

	constructor(logLevel: LogLevel = DEFAULT_LOG_LEVEL) {
		super();
		this.setLevel(logLevel);
	}

	trace(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Trace)) {
			this.logs.push(message + JSON.stringify(args));
		}
	}

	debug(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Debug)) {
			this.logs.push(message);
		}
	}

	info(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Info)) {
			this.logs.push(message);
		}
	}

	warn(message: string | Error, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Warning)) {
			this.logs.push(message.toString());
		}
	}

	error(message: string, ...args: any[]): void {
		if (this.checkLogLevel(LogLevel.Error)) {
			this.logs.push(message);
		}
	}
	flush(): void { }
}

export class TestTelemetryLoggerService implements ILoggerService {
	_serviceBrand: undefined;

	logger?: TestTelemetryLogger;

	constructor(private readonly logLevel: LogLevel) { }

	getLogger() {
		return this.logger;
	}

	createLogger() {
		if (!this.logger) {
			this.logger = new TestTelemetryLogger(this.logLevel);
		}

		return this.logger;
	}

	onDidChangeVisibility = Event.None;
	onDidChangeLogLevel = Event.None;
	onDidChangeLoggers = Event.None;
	setLogLevel(): void { }
	getLogLevel() { return LogLevel.Info; }
	setVisibility(): void { }
	getDefaultLogLevel() { return this.logLevel; }
	registerLogger() { }
	deregisterLogger(): void { }
	getRegisteredLoggers() { return []; }
	getRegisteredLogger() { return undefined; }
}

suite('TelemetryLogAdapter', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('Do not Log Telemetry if log level is not trace', async () => {
		const testLoggerService = new TestTelemetryLoggerService(DEFAULT_LOG_LEVEL);
		const testInstantiationService = new TestInstantiationService();
		const testObject = new TelemetryLogAppender(new NullLogService(), testLoggerService, testInstantiationService.stub(IEnvironmentService, {}), testInstantiationService.stub(IProductService, {}));
		testObject.log('testEvent', { hello: 'world', isTrue: true, numberBetween1And3: 2 });
		assert.strictEqual(testLoggerService.createLogger().logs.length, 2);
		testObject.dispose();
		testInstantiationService.dispose();
	});

	test('Log Telemetry if log level is trace', async () => {
		const testLoggerService = new TestTelemetryLoggerService(LogLevel.Trace);
		const testInstantiationService = new TestInstantiationService();
		const testObject = new TelemetryLogAppender(new NullLogService(), testLoggerService, testInstantiationService.stub(IEnvironmentService, {}), testInstantiationService.stub(IProductService, {}));
		testObject.log('testEvent', { hello: 'world', isTrue: true, numberBetween1And3: 2 });
		assert.strictEqual(testLoggerService.createLogger().logs[2], 'telemetry/testEvent' + JSON.stringify([{
			properties: {
				hello: 'world',
			},
			measurements: {
				isTrue: 1, numberBetween1And3: 2
			}
		}]));
		testObject.dispose();
		testInstantiationService.dispose();
	});
});
