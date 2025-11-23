/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import * as sinon from 'sinon';
import sinonTest from 'sinon-test';
import { mainWindow } from '../../../../base/browser/window.js';
import * as Errors from '../../../../base/common/errors.js';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import ErrorTelemetry from '../../browser/errorTelemetry.js';
import { TelemetryConfiguration, TelemetryLevel } from '../../common/telemetry.js';
import { ITelemetryServiceConfig, TelemetryService } from '../../common/telemetryService.js';
import { ITelemetryAppender, NullAppender } from '../../common/telemetryUtils.js';

const sinonTestFn = sinonTest(sinon);

class TestTelemetryAppender implements ITelemetryAppender {

	public events: any[];
	public isDisposed: boolean;

	constructor() {
		this.events = [];
		this.isDisposed = false;
	}

	public log(eventName: string, data?: any): void {
		this.events.push({ eventName, data });
	}

	public getEventsCount() {
		return this.events.length;
	}

	public flush(): Promise<any> {
		this.isDisposed = true;
		return Promise.resolve(null);
	}
}

class ErrorTestingSettings {
	public personalInfo: string;
	public importantInfo: string;
	public filePrefix: string;
	public dangerousPathWithoutImportantInfo: string;
	public dangerousPathWithImportantInfo: string;
	public missingModelPrefix: string;
	public missingModelMessage: string;
	public noSuchFilePrefix: string;
	public noSuchFileMessage: string;
	public stack: string[];
	public randomUserFile: string = 'a/path/that/doe_snt/con-tain/code/names.js';
	public anonymizedRandomUserFile: string = '<REDACTED: user-file-path>';
	public nodeModulePathToRetain: string = 'node_modules/path/that/shouldbe/retained/names.js:14:15854';
	public nodeModuleAsarPathToRetain: string = 'node_modules.asar/path/that/shouldbe/retained/names.js:14:12354';

	constructor() {
		this.personalInfo = 'DANGEROUS/PATH';
		this.importantInfo = 'important/information';
		this.filePrefix = 'file:///';
		this.dangerousPathWithImportantInfo = this.filePrefix + this.personalInfo + '/resources/app/' + this.importantInfo;
		this.dangerousPathWithoutImportantInfo = this.filePrefix + this.personalInfo;

		this.missingModelPrefix = 'Received model events for missing model ';
		this.missingModelMessage = this.missingModelPrefix + ' ' + this.dangerousPathWithoutImportantInfo;

		this.noSuchFilePrefix = 'ENOENT: no such file or directory';
		this.noSuchFileMessage = this.noSuchFilePrefix + ' \'' + this.personalInfo + '\'';

		this.stack = [`at e._modelEvents (${this.randomUserFile}:11:7309)`,
		`    at t.AllWorkers (${this.randomUserFile}:6:8844)`,
		`    at e.(anonymous function) [as _modelEvents] (${this.randomUserFile}:5:29552)`,
		`    at Function.<anonymous> (${this.randomUserFile}:6:8272)`,
		`    at e.dispatch (${this.randomUserFile}:5:26931)`,
		`    at e.request (/${this.nodeModuleAsarPathToRetain})`,
		`    at t._handleMessage (${this.nodeModuleAsarPathToRetain})`,
		`    at t._onmessage (/${this.nodeModulePathToRetain})`,
		`    at t.onmessage (${this.nodeModulePathToRetain})`,
			`    at DedicatedWorkerGlobalScope.self.onmessage`,
		this.dangerousPathWithImportantInfo,
		this.dangerousPathWithoutImportantInfo,
		this.missingModelMessage,
		this.noSuchFileMessage];
	}
}

suite('TelemetryService', () => {

	const TestProductService: IProductService = { _serviceBrand: undefined, ...product };

	test('Disposing', sinonTestFn(function () {
		const testAppender = new TestTelemetryAppender();
		const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);

		service.publicLog('testPrivateEvent');
		assert.strictEqual(testAppender.getEventsCount(), 1);

		service.dispose();
		assert.strictEqual(!testAppender.isDisposed, true);
	}));

	// event reporting
	test('Simple event', sinonTestFn(function () {
		const testAppender = new TestTelemetryAppender();
		const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);

		service.publicLog('testEvent');
		assert.strictEqual(testAppender.getEventsCount(), 1);
		assert.strictEqual(testAppender.events[0].eventName, 'testEvent');
		assert.notStrictEqual(testAppender.events[0].data, null);

		service.dispose();
	}));

	test('Event with data', sinonTestFn(function () {
		const testAppender = new TestTelemetryAppender();
		const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);

		service.publicLog('testEvent', {
			'stringProp': 'property',
			'numberProp': 1,
			'booleanProp': true,
			'complexProp': {
				'value': 0
			}
		});

		assert.strictEqual(testAppender.getEventsCount(), 1);
		assert.strictEqual(testAppender.events[0].eventName, 'testEvent');
		assert.notStrictEqual(testAppender.events[0].data, null);
		assert.strictEqual(testAppender.events[0].data['stringProp'], 'property');
		assert.strictEqual(testAppender.events[0].data['numberProp'], 1);
		assert.strictEqual(testAppender.events[0].data['booleanProp'], true);
		assert.strictEqual(testAppender.events[0].data['complexProp'].value, 0);

		service.dispose();
	}));

	test('common properties added to *all* events, simple event', function () {
		const testAppender = new TestTelemetryAppender();
		const service = new TelemetryService({
			appenders: [testAppender],
			commonProperties: { foo: 'JA!', get bar() { return Math.random() % 2 === 0; } }
		}, new TestConfigurationService(), TestProductService);

		service.publicLog('testEvent');
		const [first] = testAppender.events;

		assert.strictEqual(Object.keys(first.data).length, 2);
		assert.strictEqual(typeof first.data['foo'], 'string');
		assert.strictEqual(typeof first.data['bar'], 'boolean');

		service.dispose();
	});

	test('common properties added to *all* events, event with data', function () {
		const testAppender = new TestTelemetryAppender();
		const service = new TelemetryService({
			appenders: [testAppender],
			commonProperties: { foo: 'JA!', get bar() { return Math.random() % 2 === 0; } }
		}, new TestConfigurationService(), TestProductService);

		service.publicLog('testEvent', { hightower: 'xl', price: 8000 });
		const [first] = testAppender.events;

		assert.strictEqual(Object.keys(first.data).length, 4);
		assert.strictEqual(typeof first.data['foo'], 'string');
		assert.strictEqual(typeof first.data['bar'], 'boolean');
		assert.strictEqual(typeof first.data['hightower'], 'string');
		assert.strictEqual(typeof first.data['price'], 'number');

		service.dispose();
	});

	test('TelemetryInfo comes from properties', function () {
		const service = new TelemetryService({
			appenders: [NullAppender],
			commonProperties: {
				sessionID: 'one',
				['common.machineId']: 'three',
			}
		}, new TestConfigurationService(), TestProductService);

		assert.strictEqual(service.sessionId, 'one');
		assert.strictEqual(service.machineId, 'three');

		service.dispose();
	});

	test('telemetry on by default', function () {
		const testAppender = new TestTelemetryAppender();
		const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);

		service.publicLog('testEvent');
		assert.strictEqual(testAppender.getEventsCount(), 1);
		assert.strictEqual(testAppender.events[0].eventName, 'testEvent');

		service.dispose();
	});

	class TestErrorTelemetryService extends TelemetryService {
		constructor(config: ITelemetryServiceConfig) {
			super({ ...config, sendErrorTelemetry: true }, new TestConfigurationService, TestProductService);
		}
	}

	test('Error events', sinonTestFn(function (this: any) {

		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);


			const e: any = new Error('This is a test.');
			// for Phantom
			if (!e.stack) {
				e.stack = 'blah';
			}

			Errors.onUnexpectedError(e);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.strictEqual(testAppender.getEventsCount(), 1);
			assert.strictEqual(testAppender.events[0].eventName, 'UnhandledError');
			assert.strictEqual(testAppender.events[0].data.msg, 'This is a test.');

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	// 	test('Unhandled Promise Error events', sinonTestFn(function() {
	//
	// 		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
	// 		Errors.setUnexpectedErrorHandler(() => {});
	//
	// 		try {
	// 			let service = new MainTelemetryService();
	// 			let testAppender = new TestTelemetryAppender();
	// 			service.addTelemetryAppender(testAppender);
	//
	// 			winjs.Promise.wrapError(new Error('This should not get logged'));
	// 			winjs.TPromise.as(true).then(() => {
	// 				throw new Error('This should get logged');
	// 			});
	// 			// prevent console output from failing the test
	// 			this.stub(console, 'log');
	// 			// allow for the promise to finish
	// 			this.clock.tick(MainErrorTelemetry.ERROR_FLUSH_TIMEOUT);
	//
	// 			assert.strictEqual(testAppender.getEventsCount(), 1);
	// 			assert.strictEqual(testAppender.events[0].eventName, 'UnhandledError');
	// 			assert.strictEqual(testAppender.events[0].data.msg,  'This should get logged');
	//
	// 			service.dispose();
	// 		} finally {
	// 			Errors.setUnexpectedErrorHandler(origErrorHandler);
	// 		}
	// 	}));

	test('Handle global errors', sinonTestFn(function (this: any) {
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;

		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		const testError = new Error('test');
		(mainWindow.onerror)('Error Message', 'file.js', 2, 42, testError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.strictEqual(errorStub.alwaysCalledWithExactly('Error Message', 'file.js', 2, 42, testError), true);
		assert.strictEqual(errorStub.callCount, 1);

		assert.strictEqual(testAppender.getEventsCount(), 1);
		assert.strictEqual(testAppender.events[0].eventName, 'UnhandledError');
		assert.strictEqual(testAppender.events[0].data.msg, 'Error Message');
		assert.strictEqual(testAppender.events[0].data.file, 'file.js');
		assert.strictEqual(testAppender.events[0].data.line, 2);
		assert.strictEqual(testAppender.events[0].data.column, 42);
		assert.strictEqual(testAppender.events[0].data.uncaught_error_msg, 'test');

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	test('Error Telemetry removes PII from filename with spaces', sinonTestFn(function (this: any) {
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;
		const settings = new ErrorTestingSettings();
		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		const personInfoWithSpaces = settings.personalInfo.slice(0, 2) + ' ' + settings.personalInfo.slice(2);
		const dangerousFilenameError: any = new Error('dangerousFilename');
		dangerousFilenameError.stack = settings.stack;
		mainWindow.onerror('dangerousFilename', settings.dangerousPathWithImportantInfo.replace(settings.personalInfo, personInfoWithSpaces) + '/test.js', 2, 42, dangerousFilenameError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.strictEqual(errorStub.callCount, 1);
		assert.strictEqual(testAppender.events[0].data.file.indexOf(settings.dangerousPathWithImportantInfo.replace(settings.personalInfo, personInfoWithSpaces)), -1);
		assert.strictEqual(testAppender.events[0].data.file, settings.importantInfo + '/test.js');

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	test('Uncaught Error Telemetry removes PII from filename', sinonTestFn(function (this: any) {
		const clock = this.clock;
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;
		const settings = new ErrorTestingSettings();
		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousFilenameError: any = new Error('dangerousFilename');
		dangerousFilenameError.stack = settings.stack;
		mainWindow.onerror('dangerousFilename', settings.dangerousPathWithImportantInfo + '/test.js', 2, 42, dangerousFilenameError);
		clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		assert.strictEqual(errorStub.callCount, 1);
		assert.strictEqual(testAppender.events[0].data.file.indexOf(settings.dangerousPathWithImportantInfo), -1);

		dangerousFilenameError = new Error('dangerousFilename');
		dangerousFilenameError.stack = settings.stack;
		mainWindow.onerror('dangerousFilename', settings.dangerousPathWithImportantInfo + '/test.js', 2, 42, dangerousFilenameError);
		clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		assert.strictEqual(errorStub.callCount, 2);
		assert.strictEqual(testAppender.events[0].data.file.indexOf(settings.dangerousPathWithImportantInfo), -1);
		assert.strictEqual(testAppender.events[0].data.file, settings.importantInfo + '/test.js');

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	test('Unexpected Error Telemetry removes PII', sinonTestFn(function (this: any) {
		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });
		try {
			const settings = new ErrorTestingSettings();
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			const dangerousPathWithoutImportantInfoError: any = new Error(settings.dangerousPathWithoutImportantInfo);
			dangerousPathWithoutImportantInfoError.stack = settings.stack;
			Errors.onUnexpectedError(dangerousPathWithoutImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);

			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII', sinonTestFn(function (this: any) {
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;
		const settings = new ErrorTestingSettings();
		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		const dangerousPathWithoutImportantInfoError: any = new Error('dangerousPathWithoutImportantInfo');
		dangerousPathWithoutImportantInfoError.stack = settings.stack;
		mainWindow.onerror(settings.dangerousPathWithoutImportantInfo, 'test.js', 2, 42, dangerousPathWithoutImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.strictEqual(errorStub.callCount, 1);
		// Test that no file information remains, esp. personal info
		assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Code file path', sinonTestFn(function (this: any) {

		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const settings = new ErrorTestingSettings();
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			const dangerousPathWithImportantInfoError: any = new Error(settings.dangerousPathWithImportantInfo);
			dangerousPathWithImportantInfoError.stack = settings.stack;

			// Test that important information remains but personal info does not
			Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Code file path', sinonTestFn(function (this: any) {
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;
		const settings = new ErrorTestingSettings();
		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		const dangerousPathWithImportantInfoError: any = new Error('dangerousPathWithImportantInfo');
		dangerousPathWithImportantInfoError.stack = settings.stack;
		mainWindow.onerror(settings.dangerousPathWithImportantInfo, 'test.js', 2, 42, dangerousPathWithImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.strictEqual(errorStub.callCount, 1);
		// Test that important information remains but personal info does not
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('(' + settings.nodeModuleAsarPathToRetain), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('(' + settings.nodeModulePathToRetain), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('(/' + settings.nodeModuleAsarPathToRetain), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('(/' + settings.nodeModulePathToRetain), -1);
		assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
		assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Code file path with node modules', sinonTestFn(function (this: any) {

		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const settings = new ErrorTestingSettings();
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			const dangerousPathWithImportantInfoError: any = new Error(settings.dangerousPathWithImportantInfo);
			dangerousPathWithImportantInfoError.stack = settings.stack;


			Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('(' + settings.nodeModuleAsarPathToRetain), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('(' + settings.nodeModulePathToRetain), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('(/' + settings.nodeModuleAsarPathToRetain), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('(/' + settings.nodeModulePathToRetain), -1);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Unexpected Error Telemetry removes PII but preserves Code file path when PIIPath is configured', sinonTestFn(function (this: any) {

		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const settings = new ErrorTestingSettings();
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender], piiPaths: [settings.personalInfo + '/resources/app/'] });
			const errorTelemetry = new ErrorTelemetry(service);

			const dangerousPathWithImportantInfoError: any = new Error(settings.dangerousPathWithImportantInfo);
			dangerousPathWithImportantInfoError.stack = settings.stack;

			// Test that important information remains but personal info does not
			Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Code file path when PIIPath is configured', sinonTestFn(function (this: any) {
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;
		const settings = new ErrorTestingSettings();
		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender], piiPaths: [settings.personalInfo + '/resources/app/'] });
		const errorTelemetry = new ErrorTelemetry(service);

		const dangerousPathWithImportantInfoError: any = new Error('dangerousPathWithImportantInfo');
		dangerousPathWithImportantInfoError.stack = settings.stack;
		mainWindow.onerror(settings.dangerousPathWithImportantInfo, 'test.js', 2, 42, dangerousPathWithImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.strictEqual(errorStub.callCount, 1);
		// Test that important information remains but personal info does not
		assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.importantInfo), -1);
		assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.importantInfo), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Missing Model error message', sinonTestFn(function (this: any) {

		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const settings = new ErrorTestingSettings();
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			const missingModelError: any = new Error(settings.missingModelMessage);
			missingModelError.stack = settings.stack;

			// Test that no file information remains, but this particular
			// error message does (Received model events for missing model)
			Errors.onUnexpectedError(missingModelError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.missingModelPrefix), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.missingModelPrefix), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Missing Model error message', sinonTestFn(function (this: any) {
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;
		const settings = new ErrorTestingSettings();
		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		const missingModelError: any = new Error('missingModelMessage');
		missingModelError.stack = settings.stack;
		mainWindow.onerror(settings.missingModelMessage, 'test.js', 2, 42, missingModelError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.strictEqual(errorStub.callCount, 1);
		// Test that no file information remains, but this particular
		// error message does (Received model events for missing model)
		assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.missingModelPrefix), -1);
		assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.missingModelPrefix), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	test('Unexpected Error Telemetry removes PII but preserves No Such File error message', sinonTestFn(function (this: any) {

		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const settings = new ErrorTestingSettings();
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			const noSuchFileError: any = new Error(settings.noSuchFileMessage);
			noSuchFileError.stack = settings.stack;

			// Test that no file information remains, but this particular
			// error message does (ENOENT: no such file or directory)
			Errors.onUnexpectedError(noSuchFileError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.noSuchFilePrefix), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.noSuchFilePrefix), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves No Such File error message', sinonTestFn(function (this: any) {
		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const errorStub = sinon.stub();
			mainWindow.onerror = errorStub;
			const settings = new ErrorTestingSettings();
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			const noSuchFileError: any = new Error('noSuchFileMessage');
			noSuchFileError.stack = settings.stack;
			mainWindow.onerror(settings.noSuchFileMessage, 'test.js', 2, 42, noSuchFileError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.strictEqual(errorStub.callCount, 1);
			// Test that no file information remains, but this particular
			// error message does (ENOENT: no such file or directory)
			Errors.onUnexpectedError(noSuchFileError);
			assert.notStrictEqual(testAppender.events[0].data.msg.indexOf(settings.noSuchFilePrefix), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.noSuchFilePrefix), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
			sinon.restore();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Telemetry Service sends events when telemetry is on', sinonTestFn(function () {
		const testAppender = new TestTelemetryAppender();
		const service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService(), TestProductService);
		service.publicLog('testEvent');
		assert.strictEqual(testAppender.getEventsCount(), 1);
		service.dispose();
	}));

	test('Telemetry Service checks with config service', function () {

		let telemetryLevel = TelemetryConfiguration.OFF;
		const emitter = new Emitter<any>();

		const testAppender = new TestTelemetryAppender();
		const service = new TelemetryService({
			appenders: [testAppender]
		}, new class extends TestConfigurationService {
			override onDidChangeConfiguration = emitter.event;
			override getValue<T>(): T {
				return telemetryLevel as T;
			}
		}(), TestProductService);

		assert.strictEqual(service.telemetryLevel, TelemetryLevel.NONE);

		telemetryLevel = TelemetryConfiguration.ON;
		emitter.fire({ affectsConfiguration: () => true });
		assert.strictEqual(service.telemetryLevel, TelemetryLevel.USAGE);

		telemetryLevel = TelemetryConfiguration.ERROR;
		emitter.fire({ affectsConfiguration: () => true });
		assert.strictEqual(service.telemetryLevel, TelemetryLevel.ERROR);

		service.dispose();
	});

	test('Unexpected Error Telemetry removes Windows PII but preserves code path', sinonTestFn(function (this: any) {
		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			const windowsUserPath = 'c:/Users/bpasero/AppData/Local/Programs/Microsoft%20VS%20Code%20Insiders/resources/app/';
			const codePath = 'out/vs/workbench/workbench.desktop.main.js';
			const stack = [
				`    at cTe.gc (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:81492)`,
				`    at async cTe.setInput (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:80650)`,
				`    at async qJe.S (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:58520)`,
				`    at async qJe.L (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:57080)`,
				`    at async qJe.openEditor (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:56162)`
			];

			const windowsError: any = new Error('The editor could not be opened because the file was not found.');
			windowsError.stack = stack.join('\n');

			Errors.onUnexpectedError(windowsError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.strictEqual(testAppender.getEventsCount(), 1);
			// Verify PII (username and path) is removed
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf('bpasero'), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf('Users'), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf('c:/Users'), -1);
			// Verify important code path is preserved
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('out/vs/workbench'), -1);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes Windows PII but preserves code path', sinonTestFn(function (this: any) {
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;

		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		const windowsUserPath = 'c:/Users/bpasero/AppData/Local/Programs/Microsoft%20VS%20Code%20Insiders/resources/app/';
		const codePath = 'out/vs/workbench/workbench.desktop.main.js';
		const stack = [
			`    at cTe.gc (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:81492)`,
			`    at async cTe.setInput (vscode-file://vscode-app/${windowsUserPath}${codePath}:2724:80650)`,
			`    at async qJe.S (vscode-file://vscode-app/${windowsUserPath}${codePath}:698:58520)`
		];

		const windowsError: any = new Error('The editor could not be opened because the file was not found.');
		windowsError.stack = stack.join('\n');

		mainWindow.onerror('The editor could not be opened because the file was not found.', 'test.js', 2, 42, windowsError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.strictEqual(errorStub.callCount, 1);
		// Verify PII (username and path) is removed
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf('bpasero'), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf('Users'), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf('c:/Users'), -1);
		// Verify important code path is preserved
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('out/vs/workbench'), -1);

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	test('Unexpected Error Telemetry removes macOS PII but preserves code path', sinonTestFn(function (this: any) {
		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			const macUserPath = 'Applications/Visual%20Studio%20Code%20-%20Insiders.app/Contents/Resources/app/';
			const codePath = 'out/vs/workbench/workbench.desktop.main.js';
			const stack = [
				`    at uTe.gc (vscode-file://vscode-app/${macUserPath}${codePath}:2720:81492)`,
				`    at async uTe.setInput (vscode-file://vscode-app/${macUserPath}${codePath}:2720:80650)`,
				`    at async JJe.S (vscode-file://vscode-app/${macUserPath}${codePath}:698:58520)`,
				`    at async JJe.L (vscode-file://vscode-app/${macUserPath}${codePath}:698:57080)`,
				`    at async JJe.openEditor (vscode-file://vscode-app/${macUserPath}${codePath}:698:56162)`
			];

			const macError: any = new Error('The editor could not be opened because the file was not found.');
			macError.stack = stack.join('\n');

			Errors.onUnexpectedError(macError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.strictEqual(testAppender.getEventsCount(), 1);
			// Verify PII (application path) is removed
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf('Applications/Visual'), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf('Visual%20Studio%20Code'), -1);
			// Verify important code path is preserved
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('out/vs/workbench'), -1);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes macOS PII but preserves code path', sinonTestFn(function (this: any) {
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;

		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		const macUserPath = 'Applications/Visual%20Studio%20Code%20-%20Insiders.app/Contents/Resources/app/';
		const codePath = 'out/vs/workbench/workbench.desktop.main.js';
		const stack = [
			`    at uTe.gc (vscode-file://vscode-app/${macUserPath}${codePath}:2720:81492)`,
			`    at async uTe.setInput (vscode-file://vscode-app/${macUserPath}${codePath}:2720:80650)`,
			`    at async JJe.S (vscode-file://vscode-app/${macUserPath}${codePath}:698:58520)`
		];

		const macError: any = new Error('The editor could not be opened because the file was not found.');
		macError.stack = stack.join('\n');

		mainWindow.onerror('The editor could not be opened because the file was not found.', 'test.js', 2, 42, macError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.strictEqual(errorStub.callCount, 1);
		// Verify PII (application path) is removed
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf('Applications/Visual'), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf('Visual%20Studio%20Code'), -1);
		// Verify important code path is preserved
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('out/vs/workbench'), -1);

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	test('Unexpected Error Telemetry removes Linux PII but preserves code path', sinonTestFn(function (this: any) {
		const origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			const testAppender = new TestTelemetryAppender();
			const service = new TestErrorTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			const linuxUserPath = '/home/parallels/GitDevelopment/vscode-node-sqlite3-perf/';
			const linuxSystemPath = 'usr/share/code-insiders/resources/app/';
			const codePath = 'out/vs/workbench/workbench.desktop.main.js';
			const stack = [
				`    at _kt.G (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65940)`,
				`    at _kt.F (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65765)`,
				`    at async axt.L (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3830:9998)`,
				`    at async axt.readStream (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3830:9773)`,
				`    at async mye.Eb (vscode-file://vscode-app/${linuxSystemPath}${codePath}:1313:12359)`
			];

			const linuxError: any = new Error(`Invalid fake file 'git:${linuxUserPath}index.js.git?{"path":"${linuxUserPath}index.js","ref":""}' (Canceled: Canceled)`);
			linuxError.stack = stack.join('\n');

			Errors.onUnexpectedError(linuxError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

			assert.strictEqual(testAppender.getEventsCount(), 1);
			// Verify PII (username and home directory) is removed
			assert.strictEqual(testAppender.events[0].data.msg.indexOf('parallels'), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf('/home/parallels'), -1);
			assert.strictEqual(testAppender.events[0].data.msg.indexOf('GitDevelopment'), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf('parallels'), -1);
			assert.strictEqual(testAppender.events[0].data.callstack.indexOf('/home/parallels'), -1);
			// Verify important code path is preserved
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
			assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('out/vs/workbench'), -1);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes Linux PII but preserves code path', sinonTestFn(function (this: any) {
		const errorStub = sinon.stub();
		mainWindow.onerror = errorStub;

		const testAppender = new TestTelemetryAppender();
		const service = new TestErrorTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		const linuxUserPath = '/home/parallels/GitDevelopment/vscode-node-sqlite3-perf/';
		const linuxSystemPath = 'usr/share/code-insiders/resources/app/';
		const codePath = 'out/vs/workbench/workbench.desktop.main.js';
		const stack = [
			`    at _kt.G (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65940)`,
			`    at _kt.F (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3825:65765)`,
			`    at async axt.L (vscode-file://vscode-app/${linuxSystemPath}${codePath}:3830:9998)`
		];

		const linuxError: any = new Error(`Unable to read file 'git:${linuxUserPath}index.js.git'`);
		linuxError.stack = stack.join('\n');

		mainWindow.onerror(`Unable to read file 'git:${linuxUserPath}index.js.git'`, 'test.js', 2, 42, linuxError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);

		assert.strictEqual(errorStub.callCount, 1);
		// Verify PII (username and home directory) is removed
		assert.strictEqual(testAppender.events[0].data.msg.indexOf('parallels'), -1);
		assert.strictEqual(testAppender.events[0].data.msg.indexOf('/home/parallels'), -1);
		assert.strictEqual(testAppender.events[0].data.msg.indexOf('GitDevelopment'), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf('parallels'), -1);
		assert.strictEqual(testAppender.events[0].data.callstack.indexOf('/home/parallels'), -1);
		// Verify important code path is preserved
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf(codePath), -1);
		assert.notStrictEqual(testAppender.events[0].data.callstack.indexOf('out/vs/workbench'), -1);

		errorTelemetry.dispose();
		service.dispose();
		sinon.restore();
	}));

	ensureNoDisposablesAreLeakedInTestSuite();
});
