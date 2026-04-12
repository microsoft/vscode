/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { DEFAULT_LOG_LEVEL, LogLevel } from '../../../../platform/log/common/log.js';
import { TestTelemetryLoggerService } from '../../../../platform/telemetry/test/common/telemetryLogAppender.test.js';
import { ExtHostTelemetry, ExtHostTelemetryLogger } from '../../common/extHostTelemetry.js';
import { mock } from '../../../test/common/workbenchTestServices.js';
suite('ExtHostTelemetry', function () {
    const store = ensureNoDisposablesAreLeakedInTestSuite();
    const mockEnvironment = {
        isExtensionDevelopmentDebug: false,
        extensionDevelopmentLocationURI: undefined,
        extensionTestsLocationURI: undefined,
        appRoot: undefined,
        appName: 'test',
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
    const mockExtensionIdentifier = {
        identifier: new ExtensionIdentifier('test-extension'),
        targetPlatform: "universal" /* TargetPlatform.UNIVERSAL */,
        isBuiltin: true,
        isUserBuiltin: true,
        isUnderDevelopment: true,
        name: 'test-extension',
        publisher: 'vscode',
        version: '1.0.0',
        engines: { vscode: '*' },
        extensionLocation: URI.parse('fake'),
        enabledApiProposals: undefined,
        preRelease: false,
    };
    const createExtHostTelemetry = () => {
        const extensionTelemetry = new ExtHostTelemetry(false, new class extends mock() {
            constructor() {
                super(...arguments);
                this.environment = mockEnvironment;
                this.telemetryInfo = mockTelemetryInfo;
                this.remote = mockRemote;
            }
        }, new TestTelemetryLoggerService(DEFAULT_LOG_LEVEL));
        store.add(extensionTelemetry);
        extensionTelemetry.$initializeTelemetryLevel(3 /* TelemetryLevel.USAGE */, true, { usage: true, error: true });
        return extensionTelemetry;
    };
    const createLogger = (functionSpy, extHostTelemetry, options) => {
        const extensionTelemetry = extHostTelemetry ?? createExtHostTelemetry();
        // This is the appender which the extension would contribute
        const appender = {
            sendEventData: (eventName, data) => {
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
        // eslint-disable-next-line local/code-no-any-casts
        assert.throws(() => ExtHostTelemetryLogger.validateSender(null));
        // eslint-disable-next-line local/code-no-any-casts
        assert.throws(() => ExtHostTelemetryLogger.validateSender(1));
        // eslint-disable-next-line local/code-no-any-casts
        assert.throws(() => ExtHostTelemetryLogger.validateSender({}));
        assert.throws(() => {
            // eslint-disable-next-line local/code-no-any-casts
            ExtHostTelemetryLogger.validateSender({
                sendErrorData: () => { },
                sendEventData: true
            });
        });
        assert.throws(() => {
            // eslint-disable-next-line local/code-no-any-casts
            ExtHostTelemetryLogger.validateSender({
                sendErrorData: 123,
                sendEventData: () => { },
            });
        });
        assert.throws(() => {
            // eslint-disable-next-line local/code-no-any-casts
            ExtHostTelemetryLogger.validateSender({
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
        extensionTelemetry.$initializeTelemetryLevel(2 /* TelemetryLevel.ERROR */, true, { usage: true, error: true });
        config = extensionTelemetry.getTelemetryDetails();
        assert.strictEqual(config.isCrashEnabled, true);
        assert.strictEqual(config.isUsageEnabled, false);
        assert.strictEqual(config.isErrorsEnabled, true);
        extensionTelemetry.$initializeTelemetryLevel(1 /* TelemetryLevel.CRASH */, true, { usage: true, error: true });
        config = extensionTelemetry.getTelemetryDetails();
        assert.strictEqual(config.isCrashEnabled, true);
        assert.strictEqual(config.isUsageEnabled, false);
        assert.strictEqual(config.isErrorsEnabled, false);
        extensionTelemetry.$initializeTelemetryLevel(3 /* TelemetryLevel.USAGE */, true, { usage: false, error: true });
        config = extensionTelemetry.getTelemetryDetails();
        assert.strictEqual(config.isCrashEnabled, true);
        assert.strictEqual(config.isUsageEnabled, false);
        assert.strictEqual(config.isErrorsEnabled, true);
        extensionTelemetry.dispose();
    });
    test('Simple log event to TelemetryLogger', function () {
        const functionSpy = { dataArr: [], exceptionArr: [], flushCalled: false };
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
        const functionSpy = { dataArr: [], exceptionArr: [], flushCalled: false };
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
        const functionSpy = { dataArr: [], exceptionArr: [], flushCalled: false };
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
        const functionSpy = { dataArr: [], exceptionArr: [], flushCalled: false };
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
        const extensionTelemetry = new ExtHostTelemetry(false, new class extends mock() {
            constructor() {
                super(...arguments);
                this.environment = mockEnvironment;
                this.telemetryInfo = mockTelemetryInfo;
                this.remote = mockRemote;
            }
        }, loggerService);
        extensionTelemetry.$initializeTelemetryLevel(3 /* TelemetryLevel.USAGE */, true, { usage: true, error: true });
        const functionSpy = { dataArr: [], exceptionArr: [], flushCalled: false };
        const logger = createLogger(functionSpy, extensionTelemetry);
        // Ensure headers are logged on instantiation
        assert.strictEqual(loggerService.createLogger().logs.length, 0);
        logger.logUsage('test-event', { 'test-data': 'test-data' });
        // Initial header is logged then the event
        assert.strictEqual(loggerService.createLogger().logs.length, 1);
        assert.ok(loggerService.createLogger().logs[0].startsWith('test-extension/test-event'));
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0SG9zdFRlbGVtZXRyeS50ZXN0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2FwaS90ZXN0L2Jyb3dzZXIvZXh0SG9zdFRlbGVtZXRyeS50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDckQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLG1CQUFtQixFQUF5QyxNQUFNLHNEQUFzRCxDQUFDO0FBQ2xJLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxRQUFRLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUVyRixPQUFPLEVBQUUsMEJBQTBCLEVBQUUsTUFBTSx5RUFBeUUsQ0FBQztBQUVySCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUU1RixPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFTckUsS0FBSyxDQUFDLGtCQUFrQixFQUFFO0lBQ3pCLE1BQU0sS0FBSyxHQUFHLHVDQUF1QyxFQUFFLENBQUM7SUFFeEQsTUFBTSxlQUFlLEdBQWlCO1FBQ3JDLDJCQUEyQixFQUFFLEtBQUs7UUFDbEMsK0JBQStCLEVBQUUsU0FBUztRQUMxQyx5QkFBeUIsRUFBRSxTQUFTO1FBQ3BDLE9BQU8sRUFBRSxTQUFTO1FBQ2xCLE9BQU8sRUFBRSxNQUFNO1FBQ2YsK0JBQStCLEVBQUUsS0FBSztRQUN0QyxPQUFPLEVBQUUsTUFBTTtRQUNmLFdBQVcsRUFBRSxJQUFJO1FBQ2pCLGlCQUFpQixFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDO1FBQ3BDLG9CQUFvQixFQUFF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