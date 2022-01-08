/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as sinonTest from 'sinon-test';
import * as Errors from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import ErrorTelemetry from 'vs/platform/telemetry/browser/errorTelemetry';
import { ClassifiedEvent, GDPRClassification, StrictPropertyCheck } from 'vs/platform/telemetry/common/gdprTypings';
import { ITelemetryData, TelemetryConfiguration, TelemetryLevel } from 'vs/platform/telemetry/common/telemetry';
import { ITelemetryServiceConfig, TelemetryService } from 'vs/platform/telemetry/common/telemetryService';
import { ITelemetryAppender, NullAppender } from 'vs/platform/telemetry/common/telemetryUtils';

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

	test('Disposing', sinonTestFn(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService());

		return service.publicLog('testPrivateEvent').then(() => {
			assert.strictEqual(testAppender.getEventsCount(), 3);

			service.dispose();
			assert.strictEqual(!testAppender.isDisposed, true);
		});
	}));

	// event reporting
	test('Simple event', sinonTestFn(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService());

		return service.publicLog('testEvent').then(_ => {
			assert.strictEqual(testAppender.getEventsCount(), 3);
			assert.strictEqual(testAppender.events[0].eventName, 'optInStatus');
			assert.strictEqual(testAppender.events[1].eventName, 'testEvent');
			assert.notStrictEqual(testAppender.events[1].data, null);
			assert.strictEqual(testAppender.events[2].eventName, 'machineIdFallback');

			service.dispose();
		});
	}));

	test('Event with data', sinonTestFn(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService());

		return service.publicLog('testEvent', {
			'stringProp': 'property',
			'numberProp': 1,
			'booleanProp': true,
			'complexProp': {
				'value': 0
			}
		}).then(() => {
			assert.strictEqual(testAppender.getEventsCount(), 3);
			assert.strictEqual(testAppender.events[0].eventName, 'optInStatus');
			assert.strictEqual(testAppender.events[1].eventName, 'testEvent');
			assert.notStrictEqual(testAppender.events[1].data, null);
			assert.strictEqual(testAppender.events[1].data['stringProp'], 'property');
			assert.strictEqual(testAppender.events[1].data['numberProp'], 1);
			assert.strictEqual(testAppender.events[1].data['booleanProp'], true);
			assert.strictEqual(testAppender.events[1].data['complexProp'].value, 0);

			service.dispose();
		});

	}));

	test('common properties added to *all* events, simple event', function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({
			appenders: [testAppender],
			commonProperties: Promise.resolve({ foo: 'JA!', get bar() { return Math.random(); } })
		}, new TestConfigurationService());

		return service.publicLog('testEvent').then(_ => {
			let [, second] = testAppender.events; // first is optInStatus-event

			assert.strictEqual(Object.keys(second.data).length, 2);
			assert.strictEqual(typeof second.data['foo'], 'string');
			assert.strictEqual(typeof second.data['bar'], 'number');

			service.dispose();
		});
	});

	test('common properties added to *all* events, event with data', function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({
			appenders: [testAppender],
			commonProperties: Promise.resolve({ foo: 'JA!', get bar() { return Math.random(); } })
		}, new TestConfigurationService());

		return service.publicLog('testEvent', { hightower: 'xl', price: 8000 }).then(_ => {
			let [, second] = testAppender.events; // first is optInStatus-event

			assert.strictEqual(Object.keys(second.data).length, 4);
			assert.strictEqual(typeof second.data['foo'], 'string');
			assert.strictEqual(typeof second.data['bar'], 'number');
			assert.strictEqual(typeof second.data['hightower'], 'string');
			assert.strictEqual(typeof second.data['price'], 'number');

			service.dispose();
		});
	});

	test('TelemetryInfo comes from properties', function () {
		let service = new TelemetryService({
			appenders: [NullAppender],
			commonProperties: Promise.resolve({
				sessionID: 'one',
				['common.machineId']: 'three',
			})
		}, new TestConfigurationService());

		return service.getTelemetryInfo().then(info => {
			assert.strictEqual(info.sessionId, 'one');
			assert.strictEqual(info.machineId, 'three');

			service.dispose();
		});
	});

	test('telemetry on by default', sinonTestFn(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService());

		return service.publicLog('testEvent').then(() => {
			assert.strictEqual(testAppender.getEventsCount(), 3);
			assert.strictEqual(testAppender.events[0].eventName, 'optInStatus');
			assert.strictEqual(testAppender.events[1].eventName, 'testEvent');

			service.dispose();
		});
	}));

	class JoinableTelemetryService extends TelemetryService {

		private promises: Promise<void>[] = [];

		constructor(config: ITelemetryServiceConfig) {
			super({ ...config, sendErrorTelemetry: true }, new TestConfigurationService);
			this.promises = this.promises ?? [];
			this.promises = this.promises ?? [];
		}

		join(): Promise<any> {
			return Promise.all(this.promises);
		}

		override publicLog(eventName: string, data?: ITelemetryData, anonymizeFilePaths?: boolean): Promise<void> {
			let p = super.publicLog(eventName, data, anonymizeFilePaths);
			// publicLog is called from the ctor and therefore promises can be undefined
			this.promises = this.promises ?? [];
			this.promises.push(p);
			return p;
		}

		override publicLogError(errorEventName: string, data?: ITelemetryData): Promise<void> {
			let p = super.publicLogError(errorEventName, data);
			// publicLogError is called from the ctor and therefore promises can be undefined
			this.promises = this.promises ?? [];
			this.promises.push(p);
			return p;
		}

		override publicLogError2<E extends ClassifiedEvent<T> = never, T extends GDPRClassification<T> = never>(eventName: string, data?: StrictPropertyCheck<T, E>): Promise<any> {
			return this.publicLogError(eventName, data as ITelemetryData);
		}
	}

	test('Error events', sinonTestFn(async function (this: any) {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let testAppender = new TestTelemetryAppender();
			let service = new JoinableTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);


			let e: any = new Error('This is a test.');
			// for Phantom
			if (!e.stack) {
				e.stack = 'blah';
			}

			Errors.onUnexpectedError(e);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			await service.join();

			assert.strictEqual(testAppender.getEventsCount(), 3);
			assert.strictEqual(testAppender.events[0].eventName, 'optInStatus');
			assert.strictEqual(testAppender.events[1].eventName, 'UnhandledError');
			assert.strictEqual(testAppender.events[1].data.msg, 'This is a test.');

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

	test('Handle global errors', sinonTestFn(async function (this: any) {
		let errorStub = sinon.stub();
		window.onerror = errorStub;

		let testAppender = new TestTelemetryAppender();
		let service = new JoinableTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		let testError = new Error('test');
		(<any>window.onerror)('Error Message', 'file.js', 2, 42, testError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		await service.join();

		assert.strictEqual(errorStub.alwaysCalledWithExactly('Error Message', 'file.js', 2, 42, testError), true);
		assert.strictEqual(errorStub.callCount, 1);

		assert.strictEqual(testAppender.getEventsCount(), 3);
		assert.strictEqual(testAppender.events[0].eventName, 'optInStatus');
		assert.strictEqual(testAppender.events[1].eventName, 'UnhandledError');
		assert.strictEqual(testAppender.events[1].data.msg, 'Error Message');
		assert.strictEqual(testAppender.events[1].data.file, 'file.js');
		assert.strictEqual(testAppender.events[1].data.line, 2);
		assert.strictEqual(testAppender.events[1].data.column, 42);
		assert.strictEqual(testAppender.events[1].data.uncaught_error_msg, 'test');

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Error Telemetry removes PII from filename with spaces', sinonTestFn(async function (this: any) {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new JoinableTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		let personInfoWithSpaces = settings.personalInfo.slice(0, 2) + ' ' + settings.personalInfo.slice(2);
		let dangerousFilenameError: any = new Error('dangerousFilename');
		dangerousFilenameError.stack = settings.stack;
		(<any>window.onerror)('dangerousFilename', settings.dangerousPathWithImportantInfo.replace(settings.personalInfo, personInfoWithSpaces) + '/test.js', 2, 42, dangerousFilenameError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		await service.join();

		assert.strictEqual(errorStub.callCount, 1);
		assert.strictEqual(testAppender.events[1].data.file.indexOf(settings.dangerousPathWithImportantInfo.replace(settings.personalInfo, personInfoWithSpaces)), -1);
		assert.strictEqual(testAppender.events[1].data.file, settings.importantInfo + '/test.js');

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Uncaught Error Telemetry removes PII from filename', sinonTestFn(function (this: any) {
		let clock = this.clock;
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new JoinableTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousFilenameError: any = new Error('dangerousFilename');
		dangerousFilenameError.stack = settings.stack;
		(<any>window.onerror)('dangerousFilename', settings.dangerousPathWithImportantInfo + '/test.js', 2, 42, dangerousFilenameError);
		clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		return service.join().then(() => {
			assert.strictEqual(errorStub.callCount, 1);
			assert.strictEqual(testAppender.events[1].data.file.indexOf(settings.dangerousPathWithImportantInfo), -1);

			dangerousFilenameError = new Error('dangerousFilename');
			dangerousFilenameError.stack = settings.stack;
			(<any>window.onerror)('dangerousFilename', settings.dangerousPathWithImportantInfo + '/test.js', 2, 42, dangerousFilenameError);
			clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			return service.join();
		}).then(() => {
			assert.strictEqual(errorStub.callCount, 2);
			assert.strictEqual(testAppender.events[1].data.file.indexOf(settings.dangerousPathWithImportantInfo), -1);
			assert.strictEqual(testAppender.events[1].data.file, settings.importantInfo + '/test.js');

			errorTelemetry.dispose();
			service.dispose();
		});
	}));

	test('Unexpected Error Telemetry removes PII', sinonTestFn(async function (this: any) {
		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });
		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new JoinableTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			let dangerousPathWithoutImportantInfoError: any = new Error(settings.dangerousPathWithoutImportantInfo);
			dangerousPathWithoutImportantInfoError.stack = settings.stack;
			Errors.onUnexpectedError(dangerousPathWithoutImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			await service.join();

			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);

			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII', sinonTestFn(async function (this: any) {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new JoinableTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousPathWithoutImportantInfoError: any = new Error('dangerousPathWithoutImportantInfo');
		dangerousPathWithoutImportantInfoError.stack = settings.stack;
		(<any>window.onerror)(settings.dangerousPathWithoutImportantInfo, 'test.js', 2, 42, dangerousPathWithoutImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		await service.join();

		assert.strictEqual(errorStub.callCount, 1);
		// Test that no file information remains, esp. personal info
		assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Code file path', sinonTestFn(async function (this: any) {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new JoinableTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			let dangerousPathWithImportantInfoError: any = new Error(settings.dangerousPathWithImportantInfo);
			dangerousPathWithImportantInfoError.stack = settings.stack;

			// Test that important information remains but personal info does not
			Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			await service.join();

			assert.notStrictEqual(testAppender.events[1].data.msg.indexOf(settings.importantInfo), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.importantInfo), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Code file path', sinonTestFn(async function (this: any) {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new JoinableTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousPathWithImportantInfoError: any = new Error('dangerousPathWithImportantInfo');
		dangerousPathWithImportantInfoError.stack = settings.stack;
		(<any>window.onerror)(settings.dangerousPathWithImportantInfo, 'test.js', 2, 42, dangerousPathWithImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		await service.join();

		assert.strictEqual(errorStub.callCount, 1);
		// Test that important information remains but personal info does not
		assert.notStrictEqual(testAppender.events[1].data.msg.indexOf(settings.importantInfo), -1);
		assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.importantInfo), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Code file path with node modules', sinonTestFn(async function (this: any) {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new JoinableTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			let dangerousPathWithImportantInfoError: any = new Error(settings.dangerousPathWithImportantInfo);
			dangerousPathWithImportantInfoError.stack = settings.stack;


			Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			await service.join();

			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf('(' + settings.nodeModuleAsarPathToRetain), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf('(' + settings.nodeModulePathToRetain), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf('(/' + settings.nodeModuleAsarPathToRetain), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf('(/' + settings.nodeModulePathToRetain), -1);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Code file path', sinonTestFn(async function (this: any) {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new JoinableTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousPathWithImportantInfoError: any = new Error('dangerousPathWithImportantInfo');
		dangerousPathWithImportantInfoError.stack = settings.stack;
		(<any>window.onerror)(settings.dangerousPathWithImportantInfo, 'test.js', 2, 42, dangerousPathWithImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		await service.join();

		assert.strictEqual(errorStub.callCount, 1);

		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf('(' + settings.nodeModuleAsarPathToRetain), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf('(' + settings.nodeModulePathToRetain), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf('(/' + settings.nodeModuleAsarPathToRetain), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf('(/' + settings.nodeModulePathToRetain), -1);

		errorTelemetry.dispose();
		service.dispose();
	}));


	test('Unexpected Error Telemetry removes PII but preserves Code file path when PIIPath is configured', sinonTestFn(async function (this: any) {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new JoinableTelemetryService({ appenders: [testAppender], piiPaths: [settings.personalInfo + '/resources/app/'] });
			const errorTelemetry = new ErrorTelemetry(service);

			let dangerousPathWithImportantInfoError: any = new Error(settings.dangerousPathWithImportantInfo);
			dangerousPathWithImportantInfoError.stack = settings.stack;

			// Test that important information remains but personal info does not
			Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			await service.join();

			assert.notStrictEqual(testAppender.events[1].data.msg.indexOf(settings.importantInfo), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.importantInfo), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Code file path when PIIPath is configured', sinonTestFn(async function (this: any) {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new JoinableTelemetryService({ appenders: [testAppender], piiPaths: [settings.personalInfo + '/resources/app/'] });
		const errorTelemetry = new ErrorTelemetry(service);

		let dangerousPathWithImportantInfoError: any = new Error('dangerousPathWithImportantInfo');
		dangerousPathWithImportantInfoError.stack = settings.stack;
		(<any>window.onerror)(settings.dangerousPathWithImportantInfo, 'test.js', 2, 42, dangerousPathWithImportantInfoError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		await service.join();

		assert.strictEqual(errorStub.callCount, 1);
		// Test that important information remains but personal info does not
		assert.notStrictEqual(testAppender.events[1].data.msg.indexOf(settings.importantInfo), -1);
		assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.importantInfo), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Missing Model error message', sinonTestFn(async function (this: any) {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new JoinableTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			let missingModelError: any = new Error(settings.missingModelMessage);
			missingModelError.stack = settings.stack;

			// Test that no file information remains, but this particular
			// error message does (Received model events for missing model)
			Errors.onUnexpectedError(missingModelError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			await service.join();

			assert.notStrictEqual(testAppender.events[1].data.msg.indexOf(settings.missingModelPrefix), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.missingModelPrefix), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Missing Model error message', sinonTestFn(async function (this: any) {
		let errorStub = sinon.stub();
		window.onerror = errorStub;
		let settings = new ErrorTestingSettings();
		let testAppender = new TestTelemetryAppender();
		let service = new JoinableTelemetryService({ appenders: [testAppender] });
		const errorTelemetry = new ErrorTelemetry(service);

		let missingModelError: any = new Error('missingModelMessage');
		missingModelError.stack = settings.stack;
		(<any>window.onerror)(settings.missingModelMessage, 'test.js', 2, 42, missingModelError);
		this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
		await service.join();

		assert.strictEqual(errorStub.callCount, 1);
		// Test that no file information remains, but this particular
		// error message does (Received model events for missing model)
		assert.notStrictEqual(testAppender.events[1].data.msg.indexOf(settings.missingModelPrefix), -1);
		assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.missingModelPrefix), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
		assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
		assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

		errorTelemetry.dispose();
		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves No Such File error message', sinonTestFn(async function (this: any) {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new JoinableTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			let noSuchFileError: any = new Error(settings.noSuchFileMessage);
			noSuchFileError.stack = settings.stack;

			// Test that no file information remains, but this particular
			// error message does (ENOENT: no such file or directory)
			Errors.onUnexpectedError(noSuchFileError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			await service.join();

			assert.notStrictEqual(testAppender.events[1].data.msg.indexOf(settings.noSuchFilePrefix), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.noSuchFilePrefix), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves No Such File error message', sinonTestFn(async function (this: any) {
		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let errorStub = sinon.stub();
			window.onerror = errorStub;
			let settings = new ErrorTestingSettings();
			let testAppender = new TestTelemetryAppender();
			let service = new JoinableTelemetryService({ appenders: [testAppender] });
			const errorTelemetry = new ErrorTelemetry(service);

			let noSuchFileError: any = new Error('noSuchFileMessage');
			noSuchFileError.stack = settings.stack;
			(<any>window.onerror)(settings.noSuchFileMessage, 'test.js', 2, 42, noSuchFileError);
			this.clock.tick(ErrorTelemetry.ERROR_FLUSH_TIMEOUT);
			await service.join();

			assert.strictEqual(errorStub.callCount, 1);
			// Test that no file information remains, but this particular
			// error message does (ENOENT: no such file or directory)
			Errors.onUnexpectedError(noSuchFileError);
			assert.notStrictEqual(testAppender.events[1].data.msg.indexOf(settings.noSuchFilePrefix), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.msg.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.noSuchFilePrefix), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.personalInfo), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.indexOf(settings.filePrefix), -1);
			assert.notStrictEqual(testAppender.events[1].data.callstack.indexOf(settings.stack[4].replace(settings.randomUserFile, settings.anonymizedRandomUserFile)), -1);
			assert.strictEqual(testAppender.events[1].data.callstack.split('\n').length, settings.stack.length);

			errorTelemetry.dispose();
			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Telemetry Service sends events when telemetry is on', sinonTestFn(function () {
		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({ appenders: [testAppender] }, new TestConfigurationService());

		return service.publicLog('testEvent').then(() => {
			assert.strictEqual(testAppender.getEventsCount(), 3);
			service.dispose();
		});
	}));

	test('Telemetry Service checks with config service', function () {

		let telemetryLevel = TelemetryConfiguration.OFF;
		let emitter = new Emitter<any>();

		let testAppender = new TestTelemetryAppender();
		let service = new TelemetryService({
			appenders: [testAppender]
		}, new class extends TestConfigurationService {
			override onDidChangeConfiguration = emitter.event;
			override getValue() {
				return telemetryLevel as any;
			}
		}());

		assert.strictEqual(service.telemetryLevel, TelemetryLevel.NONE);

		telemetryLevel = TelemetryConfiguration.ON;
		emitter.fire({});
		assert.strictEqual(service.telemetryLevel, TelemetryLevel.USAGE);

		telemetryLevel = TelemetryConfiguration.ERROR;
		emitter.fire({});
		assert.strictEqual(service.telemetryLevel, TelemetryLevel.ERROR);

		service.dispose();
	});
});
