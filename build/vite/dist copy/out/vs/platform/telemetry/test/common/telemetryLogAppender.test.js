/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IEnvironmentService } from '../../../environment/common/environment.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { AbstractLogger, DEFAULT_LOG_LEVEL, LogLevel } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { TelemetryLogAppender } from '../../common/telemetryLogAppender.js';
class TestTelemetryLogger extends AbstractLogger {
    constructor(logLevel = DEFAULT_LOG_LEVEL) {
        super();
        this.logs = [];
        this.setLevel(logLevel);
    }
    trace(message, ...args) {
        if (this.canLog(LogLevel.Trace)) {
            this.logs.push(message + JSON.stringify(args));
        }
    }
    debug(message, ...args) {
        if (this.canLog(LogLevel.Debug)) {
            this.logs.push(message);
        }
    }
    info(message, ...args) {
        if (this.canLog(LogLevel.Info)) {
            this.logs.push(message);
        }
    }
    warn(message, ...args) {
        if (this.canLog(LogLevel.Warning)) {
            this.logs.push(message.toString());
        }
    }
    error(message, ...args) {
        if (this.canLog(LogLevel.Error)) {
            this.logs.push(message);
        }
    }
    flush() { }
}
export class TestTelemetryLoggerService {
    constructor(logLevel) {
        this.logLevel = logLevel;
        this.onDidChangeVisibility = Event.None;
        this.onDidChangeLogLevel = Event.None;
        this.onDidChangeLoggers = Event.None;
    }
    getLogger() {
        return this.logger;
    }
    createLogger() {
        if (!this.logger) {
            this.logger = new TestTelemetryLogger(this.logLevel);
        }
        return this.logger;
    }
    setLogLevel() { }
    getLogLevel() { return LogLevel.Info; }
    setVisibility() { }
    getDefaultLogLevel() { return this.logLevel; }
    registerLogger() { }
    deregisterLogger() { }
    getRegisteredLoggers() { return []; }
    getRegisteredLogger() { return undefined; }
}
suite('TelemetryLogAdapter', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('Do not Log Telemetry if log level is not trace', async () => {
        const testLoggerService = new TestTelemetryLoggerService(DEFAULT_LOG_LEVEL);
        const testInstantiationService = new TestInstantiationService();
        const testObject = new TelemetryLogAppender('', false, testLoggerService, testInstantiationService.stub(IEnvironmentService, {}), testInstantiationService.stub(IProductService, {}));
        testObject.log('testEvent', { hello: 'world', isTrue: true, numberBetween1And3: 2 });
        assert.strictEqual(testLoggerService.createLogger().logs.length, 0);
        testObject.dispose();
        testInstantiationService.dispose();
    });
    test('Log Telemetry if log level is trace', async () => {
        const testLoggerService = new TestTelemetryLoggerService(LogLevel.Trace);
        const testInstantiationService = new TestInstantiationService();
        const testObject = new TelemetryLogAppender('', false, testLoggerService, testInstantiationService.stub(IEnvironmentService, {}), testInstantiationService.stub(IProductService, {}));
        testObject.log('testEvent', { hello: 'world', isTrue: true, numberBetween1And3: 2 });
        assert.strictEqual(testLoggerService.createLogger().logs[0], 'telemetry/testEvent' + JSON.stringify([{
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVsZW1ldHJ5TG9nQXBwZW5kZXIudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL3RlbGVtZXRyeS90ZXN0L2NvbW1vbi90ZWxlbWV0cnlMb2dBcHBlbmRlci50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBQ2hHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFDekQsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDakYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0VBQWdFLENBQUM7QUFDMUcsT0FBTyxFQUFFLGNBQWMsRUFBRSxpQkFBaUIsRUFBMkIsUUFBUSxFQUFFLE1BQU0sNEJBQTRCLENBQUM7QUFDbEgsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBRTVFLE1BQU0sbUJBQW9CLFNBQVEsY0FBYztJQUkvQyxZQUFZLFdBQXFCLGlCQUFpQjtRQUNqRCxLQUFLLEVBQUUsQ0FBQztRQUhGLFNBQUksR0FBYSxFQUFFLENBQUM7UUFJMUIsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUN6QixDQUFDO0lBRUQsS0FBSyxDQUFDLE9BQWUsRUFBRSxHQUFHLElBQWU7UUFDeEMsSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQ2pDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUks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