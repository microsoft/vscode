/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier, IExtensionDescription, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { DEFAULT_LOG_LEVEL } from 'vs/platform/log/common/log';
import { ITelemetryInfo, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { TestTelemetryLoggerService } from 'vs/platform/telemetry/test/common/telemetryLogAppender.test';
import { IExtHostInitDataService } from 'vs/workbench/api/common/extHostInitDataService';
import { ExtHostTelemetry } from 'vs/workbench/api/common/extHostTelemetry';
import { IEnvironment } from 'vs/workbench/services/extensions/common/extensionHostProtocol';
import { mock } from 'vs/workbench/test/common/workbenchTestServices';
import type { TelemetryAppender } from 'vscode';

suite('ExtHostTelemetry', function () {

	const mockEnvironment: IEnvironment = {
		isExtensionDevelopmentDebug: false,
		extensionDevelopmentLocationURI: undefined,
		extensionTestsLocationURI: undefined,
		appRoot: undefined,
		appName: 'test',
		extensionTelemetryLogResource: URI.parse('fake'),
		appHost: 'test',
		appLanguage: 'en',
		globalStorageHome: URI.parse('fake'),
		workspaceStorageHome: URI.parse('fake'),
		appUriScheme: 'test',
	};

	const mockTelemetryInfo: ITelemetryInfo = {
		firstSessionDate: '2020-01-01T00:00:00.000Z',
		sessionId: 'test',
		machineId: 'test',
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
		extensionLocation: URI.parse('fake')
	};

	test('Ensure logger gets proper telemetry level during initialization', function () {
		const extensionTelemetry = new ExtHostTelemetry(new class extends mock<IExtHostInitDataService>() {
			override environment: IEnvironment = mockEnvironment;
			override telemetryInfo: ITelemetryInfo = mockTelemetryInfo;
			override remote = mockRemote;
		}, new TestTelemetryLoggerService(DEFAULT_LOG_LEVEL));
		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.USAGE, { usage: true, error: true });
		let config = extensionTelemetry.getTelemetryDetails();
		assert.strictEqual(config.isCrashEnabled, true);
		assert.strictEqual(config.isUsageEnabled, true);
		assert.strictEqual(config.isErrorsEnabled, true);

		// Initialize would never be called twice, but this is just for testing
		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.ERROR, { usage: true, error: true });
		config = extensionTelemetry.getTelemetryDetails();
		assert.strictEqual(config.isCrashEnabled, true);
		assert.strictEqual(config.isUsageEnabled, false);
		assert.strictEqual(config.isErrorsEnabled, true);

		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.CRASH, { usage: true, error: true });
		config = extensionTelemetry.getTelemetryDetails();
		assert.strictEqual(config.isCrashEnabled, true);
		assert.strictEqual(config.isUsageEnabled, false);
		assert.strictEqual(config.isErrorsEnabled, false);

		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.USAGE, { usage: false, error: true });
		config = extensionTelemetry.getTelemetryDetails();
		assert.strictEqual(config.isCrashEnabled, true);
		assert.strictEqual(config.isUsageEnabled, false);
		assert.strictEqual(config.isErrorsEnabled, true);
	});

	test('Simple log event to TelemetryLogger', function () {
		const sentData: any[] = [];
		const sentExceptions: any[] = [];
		let flushCalled = false;

		// This is the appender which the extension would contribute
		const appender: TelemetryAppender = {
			logEvent: (eventName: string, data) => {
				sentData.push({ eventName, data });
			},
			logException: (exception, data) => {
				sentExceptions.push({ exception, data });
			},
			ignoreBuiltInCommonProperties: false,
			flush: () => {
				flushCalled = true;
			}
		};

		const extensionTelemetry = new ExtHostTelemetry(new class extends mock<IExtHostInitDataService>() {
			override environment: IEnvironment = mockEnvironment;
			override telemetryInfo: ITelemetryInfo = mockTelemetryInfo;
			override remote = mockRemote;
		}, new TestTelemetryLoggerService(DEFAULT_LOG_LEVEL));

		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.USAGE, { usage: true, error: true });

		// Create the logger usting the appender
		const logger = extensionTelemetry.instantiateLogger(mockExtensionIdentifier, appender);

		logger.logUsage('test-event', { 'test-data': 'test-data' });
		assert.strictEqual(sentData.length, 1);
		assert.strictEqual(sentData[0].eventName, `${mockExtensionIdentifier.name}/test-event`);
		assert.strictEqual(sentData[0].data['test-data'], 'test-data');

		logger.logUsage('test-event', { 'test-data': 'test-data' });
		assert.strictEqual(sentData.length, 2);

		logger.logError('test-event', { 'test-data': 'test-data' });
		assert.strictEqual(sentData.length, 3);

		logger.logError(new Error('test-error'), { 'test-data': 'test-data' });
		assert.strictEqual(sentData.length, 3);
		assert.strictEqual(sentExceptions.length, 1);


		// Assert not flushed
		assert.strictEqual(flushCalled, false);

		// Call flush and assert that flush occurs
		logger.dispose();
		assert.strictEqual(flushCalled, true);

	});

	test('Ensure logger properly cleans PII', function () {
		const sentData: any[] = [];

		// This is the appender which the extension would contribute
		const appender: TelemetryAppender = {
			logEvent: (eventName: string, data) => {
				sentData.push({ eventName, data });
			},
			logException: (exception, data) => {
				// no-op
			},
			ignoreBuiltInCommonProperties: false,
		};

		const extensionTelemetry = new ExtHostTelemetry(new class extends mock<IExtHostInitDataService>() {
			override environment: IEnvironment = mockEnvironment;
			override telemetryInfo: ITelemetryInfo = mockTelemetryInfo;
			override remote = mockRemote;
		}, new TestTelemetryLoggerService(DEFAULT_LOG_LEVEL));

		extensionTelemetry.$initializeTelemetryLevel(TelemetryLevel.USAGE, { usage: true, error: true });

		// Create the logger usting the appender
		const logger = extensionTelemetry.instantiateLogger(mockExtensionIdentifier, appender);

		// Log an event with a bunch of PII, this should all get cleaned out
		logger.logUsage('test-event', {
			'fake-password': 'pwd=123',
			'fake-email': 'no-reply@example.com',
			'fake-token': 'token=123',
			'fake-slack-token': 'xoxp-123',
			'fake-path': '/Users/username/.vscode/extensions',
		});

		assert.strictEqual(sentData.length, 1);
		assert.strictEqual(sentData[0].eventName, `${mockExtensionIdentifier.name}/test-event`);
		assert.strictEqual(sentData[0].data['fake-password'], '<REDACTED: Generic Secret>');
		assert.strictEqual(sentData[0].data['fake-email'], '<REDACTED: Email>');
		assert.strictEqual(sentData[0].data['fake-token'], '<REDACTED: Generic Secret>');
		assert.strictEqual(sentData[0].data['fake-slack-token'], '<REDACTED: Slack Token>');
		assert.strictEqual(sentData[0].data['fake-path'], '<REDACTED: user-file-path>');

	});
});
