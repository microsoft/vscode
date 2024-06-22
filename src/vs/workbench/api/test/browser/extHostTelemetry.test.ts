/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { DEFAULT_LOG_LEVEL, LogLevel } from 'vs/platform/log/common/log';
import { TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { TestTelemetryLoggerService } from 'vs/platform/telemetry/test/common/telemetryLogAppender.test';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { ExtHostTelemetry, ExtHostTelemetryLogger } from 'vs/workbench/api/common/extHostTelemetry';
import { IEnvironment } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { mock } from 'vs/workbench/test/common/workbenchTestServices';
import type { TelemetryLoggerOptions, TelemetrySender } from 'vscode';

interface TelemetryLoggerSpy {
	dataArr: any[];
	exceptionArr: any[];
	flushCalled: boolean;
}

suite('ExtHostTelemetry', function () {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const mockEnvironment: IEnvironment = {
		isExtensionDevelopmentDebug: false,
		extensionDevelopmentLocationURI: undefined,
		extensionTestsLocationURI: undefined,
		appRoot: undefined,
		appName: 'test',
		extensionTelemetryLogResource: URI.parse('fake'),
		isExtensionTelemetryLoggingOnly: false,
		appHost: 'test',
		appLanguage: 'en',
		globalStorageHome: URI.parse('fake'),
		workspaceStorageHome: URI.parse('fake'),
		appUriScheme: 'test',
	};

	const mockTelemetryInfo = {
		firstSessionDate: '2020-01-01T00:00:00.000Z',
		sessionId: 'test',
		machineId: 'test',
		sqmId: 'test',
		devDeviceId: 'test'
	};

	const mockRemote = {
		authority: 'test',
		isRemote: false,
		connectionData: null
	};

	const mockExtensionIdentifier: IExtensionDescription = {
		identifier: new ExtensionIdentifier('test-extension'),
		targetPlatform: TargetPlatform.UNIVERSAL,
		isBuiltin: true,
		isUserBuiltin: true,
		isUnderDevelopment: true,
		name: 'test-extension',
		publisher: 'vscode',
		version: '1.0.0',
		engines: { vscode: '*' },
		extensionLocation: URI.parse('fake'),
		enabledApiProposals: undefined,
	};

	const createExtHostTelemetry = () => {
		const extensionTelemetry = new ExtHostTelemetry(new class extends mock<IExtHostInitDataService>() {
			override environment: IEnvironment = mockEnvironment;
			override telemetryInfo = mockTelemetryInfo;
			override remote = mockRemote;
		}, new TestTelemetryLoggerService(DEFAULT_LOG_LEVEL));
		store.add(extensionTelemetry);
		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.USAGE, true, { usage: true, error: true });
		return extensionTelemetry;
	};

	const createLogger = (functionSpy: TelemetryLoggerSpy, extHostTelemetry?: ExtHostTelemetry, options?: TelemetryLoggerOptions) => {
		const extensionTelemetry = extHostTelemetry ?? createExtHostTelemetry();
		// This is the appender which the extension would contribute
		const appender: TelemetrySender = {
			sendEventData: (eventName: string, data) => {
				functionSpy.dataArr.push({ eventName, data });
			},
			sendErrorData: (exception, data) => {
				functionSpy.exceptionArr.push({ exception, data });
			},
			flush: () => {
				functionSpy.flushCalled = true;
			}
		};

		if (extHostTelemetry) {
			store.add(extHostTelemetry);
		}

		const logger = extensionTelemetry.instantiateLogger(mockExtensionIdentifier, appender, options);
		store.add(logger);
		return logger;
	};

	test('Validate sender instances', function () {
		assert.throws(() => ExtHostTelemetryLogger.validateSender(<any>null));
		assert.throws(() => ExtHostTelemetryLogger.validateSender(<any>1));
		assert.throws(() => ExtHostTelemetryLogger.validateSender(<any>{}));
		assert.throws(() => {
			ExtHostTelemetryLogger.validateSender(<any>{
				sendErrorData: () => { },
				sendEventData: true
			});
		});
		assert.throws(() => {
			ExtHostTelemetryLogger.validateSender(<any>{
				sendErrorData: 123,
				sendEventData: () => { },
			});
		});
		assert.throws(() => {
			ExtHostTelemetryLogger.validateSender(<any>{
				sendErrorData: () => { },
				sendEventData: () => { },
				flush: true
			});
		});
	});

	test('Ensure logger gets proper telemetry level during initialization', function () {
		const extensionTelemetry = createExtHostTelemetry();
		let config = extensionTelemetry.getTelemetryDetails();
		assert.strictEqual(config.isCrashEnabled, true);
		assert.strictEqual(config.isUsageEnabled, true);
		assert.strictEqual(config.isErrorsEnabled, true);

		// Initialize would never be called twice, but this is just for testing
		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.ERROR, true, { usage: true, error: true });
		config = extensionTelemetry.getTelemetryDetails();
		assert.strictEqual(config.isCrashEnabled, true);
		assert.strictEqual(config.isUsageEnabled, false);
		assert.strictEqual(config.isErrorsEnabled, true);

		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.CRASH, true, { usage: true, error: true });
		config = extensionTelemetry.getTelemetryDetails();
		assert.strictEqual(config.isCrashEnabled, true);
		assert.strictEqual(config.isUsageEnabled, false);
		assert.strictEqual(config.isErrorsEnabled, false);

		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.USAGE, true, { usage: false, error: true });
		config = extensionTelemetry.getTelemetryDetails();
		assert.strictEqual(config.isCrashEnabled, true);
		assert.strictEqual(config.isUsageEnabled, false);
		assert.strictEqual(config.isErrorsEnabled, true);
		extensionTelemetry.dispose();
	});

	test('Simple log event to TelemetryLogger', function () {
		const functionSpy: TelemetryLoggerSpy = { dataArr: [], exceptionArr: [], flushCalled: false };

		const logger = createLogger(functionSpy);

		logger.logUsage('test-event', { 'test-data': 'test-data' });
		assert.strictEqual(functionSpy.dataArr.length, 1);
		assert.strictEqual(functionSpy.dataArr[0].eventName, `${mockExtensionIdentifier.name}/test-event`);
		assert.strictEqual(functionSpy.dataArr[0].data['test-data'], 'test-data');

		logger.logUsage('test-event', { 'test-data': 'test-data' });
		assert.strictEqual(functionSpy.dataArr.length, 2);

		logger.logError('test-event', { 'test-data': 'test-data' });
		assert.strictEqual(functionSpy.dataArr.length, 3);

		logger.logError(new Error('test-error'), { 'test-data': 'test-data' });
		assert.strictEqual(functionSpy.dataArr.length, 3);
		assert.strictEqual(functionSpy.exceptionArr.length, 1);


		// Assert not flushed
		assert.strictEqual(functionSpy.flushCalled, false);

		// Call flush and assert that flush occurs
		logger.dispose();
		assert.strictEqual(functionSpy.flushCalled, true);

	});

	test('Simple log event to TelemetryLogger with options', function () {
		const functionSpy: TelemetryLoggerSpy = { dataArr: [], exceptionArr: [], flushCalled: false };

		const logger = createLogger(functionSpy, undefined, { additionalCommonProperties: { 'common.foo': 'bar' } });

		logger.logUsage('test-event', { 'test-data': 'test-data' });
		assert.strictEqual(functionSpy.dataArr.length, 1);
		assert.strictEqual(functionSpy.dataArr[0].eventName, `${mockExtensionIdentifier.name}/test-event`);
		assert.strictEqual(functionSpy.dataArr[0].data['test-data'], 'test-data');
		assert.strictEqual(functionSpy.dataArr[0].data['common.foo'], 'bar');

		logger.logUsage('test-event', { 'test-data': 'test-data' });
		assert.strictEqual(functionSpy.dataArr.length, 2);

		logger.logError('test-event', { 'test-data': 'test-data' });
		assert.strictEqual(functionSpy.dataArr.length, 3);

		logger.logError(new Error('test-error'), { 'test-data': 'test-data' });
		assert.strictEqual(functionSpy.dataArr.length, 3);
		assert.strictEqual(functionSpy.exceptionArr.length, 1);


		// Assert not flushed
		assert.strictEqual(functionSpy.flushCalled, false);

		// Call flush and assert that flush occurs
		logger.dispose();
		assert.strictEqual(functionSpy.flushCalled, true);

	});

	test('Log error should get common properties #193205', function () {
		const functionSpy: TelemetryLoggerSpy = { dataArr: [], exceptionArr: [], flushCalled: false };

		const logger = createLogger(functionSpy, undefined, { additionalCommonProperties: { 'common.foo': 'bar' } });
		logger.logError(new Error('Test error'));
		assert.strictEqual(functionSpy.exceptionArr.length, 1);
		assert.strictEqual(functionSpy.exceptionArr[0].data['common.foo'], 'bar');
		assert.strictEqual(functionSpy.exceptionArr[0].data['common.product'], 'test');

		logger.logError('test-error-event');
		assert.strictEqual(functionSpy.dataArr.length, 1);
		assert.strictEqual(functionSpy.dataArr[0].data['common.foo'], 'bar');
		assert.strictEqual(functionSpy.dataArr[0].data['common.product'], 'test');

		logger.logError('test-error-event', { 'test-data': 'test-data' });
		assert.strictEqual(functionSpy.dataArr.length, 2);
		assert.strictEqual(functionSpy.dataArr[1].data['common.foo'], 'bar');
		assert.strictEqual(functionSpy.dataArr[1].data['common.product'], 'test');

		logger.logError('test-error-event', { properties: { 'test-data': 'test-data' } });
		assert.strictEqual(functionSpy.dataArr.length, 3);
		assert.strictEqual(functionSpy.dataArr[2].data.properties['common.foo'], 'bar');
		assert.strictEqual(functionSpy.dataArr[2].data.properties['common.product'], 'test');

		logger.dispose();
		assert.strictEqual(functionSpy.flushCalled, true);
	});


	test('Ensure logger properly cleans PII', function () {
		const functionSpy: TelemetryLoggerSpy = { dataArr: [], exceptionArr: [], flushCalled: false };

		const logger = createLogger(functionSpy);

		// Log an event with a bunch of PII, this should all get cleaned out
		logger.logUsage('test-event', {
			'fake-password': 'pwd=123',
			'fake-email': 'no-reply@example.com',
			'fake-token': 'token=123',
			'fake-slack-token': 'xoxp-123',
			'fake-path': '/Users/username/.vscode/extensions',
		});

		assert.strictEqual(functionSpy.dataArr.length, 1);
		assert.strictEqual(functionSpy.dataArr[0].eventName, `${mockExtensionIdentifier.name}/test-event`);
		assert.strictEqual(functionSpy.dataArr[0].data['fake-password'], '<REDACTED: Generic Secret>');
		assert.strictEqual(functionSpy.dataArr[0].data['fake-email'], '<REDACTED: Email>');
		assert.strictEqual(functionSpy.dataArr[0].data['fake-token'], '<REDACTED: Generic Secret>');
		assert.strictEqual(functionSpy.dataArr[0].data['fake-slack-token'], '<REDACTED: Slack Token>');
		assert.strictEqual(functionSpy.dataArr[0].data['fake-path'], '<REDACTED: user-file-path>');
	});

	test('Ensure output channel is logged to', function () {

		// Have to re-duplicate code here because I the logger service isn't exposed in the simple setup functions
		const loggerService = new TestTelemetryLoggerService(LogLevel.Trace);
		const extensionTelemetry = new ExtHostTelemetry(new class extends mock<IExtHostInitDataService>() {
			override environment: IEnvironment = mockEnvironment;
			override telemetryInfo = mockTelemetryInfo;
			override remote = mockRemote;
		}, loggerService);
		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.USAGE, true, { usage: true, error: true });

		const functionSpy: TelemetryLoggerSpy = { dataArr: [], exceptionArr: [], flushCalled: false };

		const logger = createLogger(functionSpy, extensionTelemetry);

		// Ensure headers are logged on instantiation
		assert.strictEqual(loggerService.createLogger().logs.length, 2);

		logger.logUsage('test-event', { 'test-data': 'test-data' });
		// Initial header is logged then the event
		assert.strictEqual(loggerService.createLogger().logs.length, 3);
		assert.ok(loggerService.createLogger().logs[2].startsWith('test-extension/test-event'));
	});
});
