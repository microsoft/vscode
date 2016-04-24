/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import IdleMonitor = require('vs/base/browser/idleMonitor');
import {TelemetryService} from 'vs/platform/telemetry/browser/telemetryService';
import Telemetry = require('vs/platform/telemetry/common/telemetry');
import {InstantiationService} from 'vs/platform/instantiation/common/instantiationService';
import {ServiceCollection} from 'vs/platform/instantiation/common/serviceCollection';
import Errors = require('vs/base/common/errors');
import Timer = require('vs/base/common/timer');
import * as sinon from 'sinon';

const optInStatusEventName: string = 'optInStatus';

class TestTelemetryAppender implements Telemetry.ITelemetryAppender {

	public events: any[];
	public isDisposed: boolean;

	constructor() {
		this.events = [];
		this.isDisposed = false;
	}

	public log(eventName: string, data?: any): void {
		this.events.push({
			eventName: eventName,
			data: data
		});
	}

	public getEventsCount() {
		return this.events.length;
	}

	public dispose() {
		this.isDisposed = true;
	}
}

class ErrorTestingSettings {
	public personalInfo;
	public importantInfo;
	public filePrefix;
	public dangerousPathWithoutImportantInfo;
	public dangerousPathWithImportantInfo;
	public missingModelPrefix;
	public missingModelMessage;
	public noSuchFilePrefix;
	public noSuchFileMessage;
	public stack;

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

		this.stack = ['at e._modelEvents (a/path/that/doesnt/contain/code/names.js:11:7309)',
			'    at t.AllWorkers (a/path/that/doesnt/contain/code/names.js:6:8844)',
			'    at e.(anonymous function) [as _modelEvents] (a/path/that/doesnt/contain/code/names.js:5:29552)',
			'    at Function.<anonymous> (a/path/that/doesnt/contain/code/names.js:6:8272)',
			'    at e.dispatch (a/path/that/doesnt/contain/code/names.js:5:26931)',
			'    at e.request (a/path/that/doesnt/contain/code/names.js:14:1745)',
			'    at t._handleMessage (another/path/that/doesnt/contain/code/names.js:14:17447)',
			'    at t._onmessage (another/path/that/doesnt/contain/code/names.js:14:16976)',
			'    at t.onmessage (another/path/that/doesnt/contain/code/names.js:14:15854)',
			'    at DedicatedWorkerGlobalScope.self.onmessage',
			this.dangerousPathWithImportantInfo,
			this.dangerousPathWithoutImportantInfo,
			this.missingModelMessage,
			this.noSuchFileMessage];
	}
}

suite('TelemetryService', () => {

	class AppenderCountTelemetryService extends TelemetryService {
		getAppendersCount() {
			return this._appenders.length;
		}
	}

	// Appenders
	test('No appenders', sinon.test(function() {
		let service = new AppenderCountTelemetryService();
		assert.equal(service.getAppendersCount(), 0);

		// log events
		service.publicLog('testEvent');
		let timedEvent = service.timedPublicLog('testTimed', { 'somedata': 'test' });
		timedEvent.stop();

		//dispose
		service.dispose();
	}));

	test('Add appender', sinon.test(function() {
		let service = new AppenderCountTelemetryService();
		assert.equal(service.getAppendersCount(), 0);

		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		assert.equal(service.getAppendersCount(), 1);
		service.dispose();
	}));

	test('Remove appender', sinon.test(function() {
		let service = new AppenderCountTelemetryService();
		assert.equal(service.getAppendersCount(), 0);

		let testAppender = new TestTelemetryAppender();
		let registration = service.addTelemetryAppender(testAppender);
		assert.equal(service.getAppendersCount(), 1);

		//report event
		service.publicLog('testEvent');
		assert.equal(testAppender.getEventsCount(), 1);

		//remove appender
		registration.dispose();
		assert.equal(service.getAppendersCount(), 0);

		//verify events not being sent
		service.publicLog('testEvent2');
		assert.equal(testAppender.getEventsCount(), 1);

		service.dispose();
	}));

	test('Multiple appenders', sinon.test(function() {
		let service = new AppenderCountTelemetryService();
		assert.equal(service.getAppendersCount(), 0);

		let testAppender1 = new TestTelemetryAppender();
		let registrgation1 = service.addTelemetryAppender(testAppender1);
		assert.equal(service.getAppendersCount(), 1);

		//report event
		service.publicLog('testEvent');
		assert.equal(testAppender1.getEventsCount(), 1);

		// add second appender
		let testAppender2 = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender2);
		assert.equal(service.getAppendersCount(), 2);

		//report event
		service.publicLog('testEvent2');
		assert.equal(testAppender1.getEventsCount(), 2);
		assert.equal(testAppender2.getEventsCount(), 1);

		//remove appender 1
		registrgation1.dispose();
		assert.equal(service.getAppendersCount(), 1);

		//verify events not being sent to the removed appender
		service.publicLog('testEvent3');
		assert.equal(testAppender1.getEventsCount(), 2);
		assert.equal(testAppender2.getEventsCount(), 2);

		service.dispose();
	}));

	test('TelemetryAppendersRegistry, activate', function() {

		Telemetry.Extenstions.TelemetryAppenders.registerTelemetryAppenderDescriptor(TestTelemetryAppender);

		let callCount = 0;
		let telemetryService: Telemetry.ITelemetryService = <any> {
			addTelemetryAppender(appender) {
				assert.ok(appender);
				callCount += 1;
			}
		};

		let instantiationService = new InstantiationService(new ServiceCollection([Telemetry.ITelemetryService, telemetryService]));
		instantiationService.invokeFunction(Telemetry.Extenstions.TelemetryAppenders.activate);
		assert.equal(callCount, 1);

		// registry is now active/read-only
		assert.throws(() => Telemetry.Extenstions.TelemetryAppenders.registerTelemetryAppenderDescriptor(TestTelemetryAppender));
		assert.throws(() => instantiationService.invokeFunction(Telemetry.Extenstions.TelemetryAppenders.activate));
	});

	test('Disposing', sinon.test(function() {
		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		service.publicLog('testPrivateEvent');
		assert.equal(testAppender.getEventsCount(), 1);

		service.dispose();
		assert.equal(testAppender.isDisposed, true);
	}));

	// event reporting
	test('Simple event', sinon.test(function() {
		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();

		return service.getTelemetryInfo().then(info => {

			service.addTelemetryAppender(testAppender);

			service.publicLog('testEvent');
			assert.equal(testAppender.getEventsCount(), 1);
			assert.equal(testAppender.events[0].eventName, 'testEvent');
			assert.notEqual(testAppender.events[0].data, null);
			assert.equal(testAppender.events[0].data['sessionID'], info.sessionId);
			assert.notEqual(testAppender.events[0].data['timestamp'], null);

			service.dispose();
		});
	}));

	test('Event with data', sinon.test(function() {
		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();

		return service.getTelemetryInfo().then(info => {
			service.addTelemetryAppender(testAppender);

			service.publicLog('testEvent', {
				'stringProp': 'property',
				'numberProp': 1,
				'booleanProp': true,
				'complexProp': {
					'value': 0
				}
			});
			assert.equal(testAppender.getEventsCount(), 1);
			assert.equal(testAppender.events[0].eventName, 'testEvent');
			assert.notEqual(testAppender.events[0].data, null);
			assert.equal(testAppender.events[0].data['sessionID'], info.sessionId);
			assert.notEqual(testAppender.events[0].data['timestamp'], null);
			assert.equal(testAppender.events[0].data['stringProp'], 'property');
			assert.equal(testAppender.events[0].data['numberProp'], 1);
			assert.equal(testAppender.events[0].data['booleanProp'], true);
			assert.equal(testAppender.events[0].data['complexProp'].value, 0);

			service.dispose();
		});

	}));

	test('Telemetry Timer events', sinon.test(function() {
		Timer.ENABLE_TIMER = true;

		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		let t1 = service.timedPublicLog('editorDance');
		this.clock.tick(20);
		let t2 = service.timedPublicLog('editorSwoon', null);
		this.clock.tick(20);

		t1.stop(new Date());
		t2.stop(new Date());

		let t3 = service.timedPublicLog('editorMove', { someData: 'data' });
		this.clock.tick(30);
		t3.stop(new Date());

		assert.equal(testAppender.getEventsCount(), 3);

		assert.equal(testAppender.events[0].eventName, 'editorDance');
		assert.equal(testAppender.events[0].data.duration, 40);

		assert.equal(testAppender.events[1].eventName, 'editorSwoon');
		assert.equal(testAppender.events[1].data.duration, 20);

		assert.equal(testAppender.events[2].eventName, 'editorMove');
		assert.equal(testAppender.events[2].data.duration, 30);
		assert.equal(testAppender.events[2].data.someData, 'data');

		service.dispose();
		Timer.ENABLE_TIMER = false;
	}));

	test('enableTelemetry on by default', sinon.test(function() {
		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		service.publicLog('testEvent');
		assert.equal(testAppender.getEventsCount(), 1);
		assert.equal(testAppender.events[0].eventName, 'testEvent');

		service.dispose();
	}));

	test('Error events', sinon.test(function() {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let service = new TelemetryService();
			let testAppender = new TestTelemetryAppender();
			service.addTelemetryAppender(testAppender);


			let e: any = new Error('This is a test.');
			// for Phantom
			if (!e.stack) {
				e.stack = 'blah';
			}

			Errors.onUnexpectedError(e);
			this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);
			assert.equal(testAppender.getEventsCount(), 1);
			assert.equal(testAppender.events[0].eventName, 'UnhandledError');
			assert.equal(testAppender.events[0].data.message, 'This is a test.');

			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	// 	test('Unhandled Promise Error events', sinon.test(function() {
	//
	// 		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
	// 		Errors.setUnexpectedErrorHandler(() => {});
	//
	// 		try {
	// 			let service = new MainTelemetryService();
	// 			let testAppender = new TestTelemetryAppender();
	// 			service.addTelemetryAppender(testAppender);
	//
	// 			winjs.Promise.wrapError('This should not get logged');
	// 			winjs.TPromise.as(true).then(() => {
	// 				throw new Error('This should get logged');
	// 			});
	// 			// prevent console output from failing the test
	// 			this.stub(console, 'log');
	// 			// allow for the promise to finish
	// 			this.clock.tick(MainTelemetryService.ERROR_FLUSH_TIMEOUT);
	//
	// 			assert.equal(testAppender.getEventsCount(), 1);
	// 			assert.equal(testAppender.events[0].eventName, 'UnhandledError');
	// 			assert.equal(testAppender.events[0].data.message,  'This should get logged');
	//
	// 			service.dispose();
	// 		} finally {
	// 			Errors.setUnexpectedErrorHandler(origErrorHandler);
	// 		}
	// 	}));

	test('Handle global errors', sinon.test(function() {
		let errorStub = this.stub(window, 'onerror');

		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		let testError = new Error('test');
		(<any>window.onerror)('Error Message', 'file.js', 2, 42, testError);
		this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.alwaysCalledWithExactly('Error Message', 'file.js', 2, 42, testError), true);
		assert.equal(errorStub.callCount, 1);

		assert.equal(testAppender.getEventsCount(), 1);
		assert.equal(testAppender.events[0].eventName, 'UnhandledError');
		assert.equal(testAppender.events[0].data.message, 'Error Message');
		assert.equal(testAppender.events[0].data.filename, 'file.js');
		assert.equal(testAppender.events[0].data.line, 2);
		assert.equal(testAppender.events[0].data.column, 42);
		assert.equal(testAppender.events[0].data.error.message, 'test');

		service.dispose();
	}));

	test('Uncaught Error Telemetry removes PII from filename', sinon.test(function() {
		let errorStub = this.stub(window, 'onerror');
		let settings = new ErrorTestingSettings();
		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		let dangerousFilenameError: any = new Error('dangerousFilename');
		dangerousFilenameError.stack = settings.stack;
		(<any>window.onerror)('dangerousFilename', settings.dangerousPathWithImportantInfo + '/test.js', 2, 42, dangerousFilenameError);
		this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 1);
		assert.equal(testAppender.events[0].data.filename.indexOf(settings.dangerousPathWithImportantInfo), -1);

		dangerousFilenameError = new Error('dangerousFilename');
		dangerousFilenameError.stack = settings.stack;
		(<any>window.onerror)('dangerousFilename', settings.dangerousPathWithImportantInfo + '/test.js', 2, 42, dangerousFilenameError);
		this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 2);
		assert.equal(testAppender.events[0].data.filename.indexOf(settings.dangerousPathWithImportantInfo), -1);
		assert.equal(testAppender.events[0].data.filename, settings.importantInfo + '/test.js');

		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII', sinon.test(function() {
		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });
		try {
			let settings = new ErrorTestingSettings();
			let service = new TelemetryService();
			let testAppender = new TestTelemetryAppender();
			service.addTelemetryAppender(testAppender);

			let dangerousPathWithoutImportantInfoError: any = new Error(settings.dangerousPathWithoutImportantInfo);
			dangerousPathWithoutImportantInfoError.stack = settings.stack;
			Errors.onUnexpectedError(dangerousPathWithoutImportantInfoError);
			this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);

			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII', sinon.test(function() {
		let errorStub = this.stub(window, 'onerror');
		let settings = new ErrorTestingSettings();
		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		let dangerousPathWithoutImportantInfoError: any = new Error('dangerousPathWithoutImportantInfo');
		dangerousPathWithoutImportantInfoError.stack = settings.stack;
		(<any>window.onerror)(settings.dangerousPathWithoutImportantInfo, 'test.js', 2, 42, dangerousPathWithoutImportantInfoError);
		this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 1);
		// Test that no file information remains, esp. personal info
		assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
		assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Code file path', sinon.test(function() {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let service = new TelemetryService();
			let testAppender = new TestTelemetryAppender();
			service.addTelemetryAppender(testAppender);

			let dangerousPathWithImportantInfoError: any = new Error(settings.dangerousPathWithImportantInfo);
			dangerousPathWithImportantInfoError.stack = settings.stack;

			// Test that important information remains but personal info does not
			Errors.onUnexpectedError(dangerousPathWithImportantInfoError);
			this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

			assert.notEqual(testAppender.events[0].data.message.indexOf(settings.importantInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.importantInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			service.dispose();
		}
		finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Code file path', sinon.test(function() {
		let errorStub = this.stub(window, 'onerror');
		let settings = new ErrorTestingSettings();
		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		let dangerousPathWithImportantInfoError: any = new Error('dangerousPathWithImportantInfo');
		dangerousPathWithImportantInfoError.stack = settings.stack;
		(<any>window.onerror)(settings.dangerousPathWithImportantInfo, 'test.js', 2, 42, dangerousPathWithImportantInfoError);
		this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 1);
		// Test that important information remains but personal info does not
		assert.notEqual(testAppender.events[0].data.message.indexOf(settings.importantInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.importantInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
		assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves Missing Model error message', sinon.test(function() {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let service = new TelemetryService();
			let testAppender = new TestTelemetryAppender();
			service.addTelemetryAppender(testAppender);

			let missingModelError: any = new Error(settings.missingModelMessage);
			missingModelError.stack = settings.stack;

			// Test that no file information remains, but this particular
			// error message does (Received model events for missing model)
			Errors.onUnexpectedError(missingModelError);
			this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

			assert.notEqual(testAppender.events[0].data.message.indexOf(settings.missingModelPrefix), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.missingModelPrefix), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves Missing Model error message', sinon.test(function() {
		let errorStub = this.stub(window, 'onerror');
		let settings = new ErrorTestingSettings();
		let service = new TelemetryService();
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		let missingModelError: any = new Error('missingModelMessage');
		missingModelError.stack = settings.stack;
		(<any>window.onerror)(settings.missingModelMessage, 'test.js', 2, 42, missingModelError);
		this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

		assert.equal(errorStub.callCount, 1);
		// Test that no file information remains, but this particular
		// error message does (Received model events for missing model)
		assert.notEqual(testAppender.events[0].data.message.indexOf(settings.missingModelPrefix), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.missingModelPrefix), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
		assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
		assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
		assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

		service.dispose();
	}));

	test('Unexpected Error Telemetry removes PII but preserves No Such File error message', sinon.test(function() {

		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let settings = new ErrorTestingSettings();
			let service = new TelemetryService();
			let testAppender = new TestTelemetryAppender();
			service.addTelemetryAppender(testAppender);

			let noSuchFileError: any = new Error(settings.noSuchFileMessage);
			noSuchFileError.stack = settings.stack;

			// Test that no file information remains, but this particular
			// error message does (ENOENT: no such file or directory)
			Errors.onUnexpectedError(noSuchFileError);
			this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

			assert.notEqual(testAppender.events[0].data.message.indexOf(settings.noSuchFilePrefix), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.noSuchFilePrefix), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Uncaught Error Telemetry removes PII but preserves No Such File error message', sinon.test(function() {
		let origErrorHandler = Errors.errorHandler.getUnexpectedErrorHandler();
		Errors.setUnexpectedErrorHandler(() => { });

		try {
			let errorStub = this.stub(window, 'onerror');
			let settings = new ErrorTestingSettings();
			let service = new TelemetryService();
			let testAppender = new TestTelemetryAppender();
			service.addTelemetryAppender(testAppender);

			let noSuchFileError: any = new Error('noSuchFileMessage');
			noSuchFileError.stack = settings.stack;
			(<any>window.onerror)(settings.noSuchFileMessage, 'test.js', 2, 42, noSuchFileError);
			this.clock.tick(TelemetryService.ERROR_FLUSH_TIMEOUT);

			assert.equal(errorStub.callCount, 1);
			// Test that no file information remains, but this particular
			// error message does (ENOENT: no such file or directory)
			Errors.onUnexpectedError(noSuchFileError);
			assert.notEqual(testAppender.events[0].data.message.indexOf(settings.noSuchFilePrefix), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.message.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.noSuchFilePrefix), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.personalInfo), -1);
			assert.equal(testAppender.events[0].data.stack.indexOf(settings.filePrefix), -1);
			assert.notEqual(testAppender.events[0].data.stack.indexOf(settings.stack[4]), -1);
			assert.equal(testAppender.events[0].data.stack.split('\n').length, settings.stack.length);

			service.dispose();
		} finally {
			Errors.setUnexpectedErrorHandler(origErrorHandler);
		}
	}));

	test('Test hard idle does not affect sending normal events in active state', sinon.test(function() {

		let service = new TelemetryService({ enableHardIdle: true, enableSoftIdle: false });
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		//report an event
		service.publicLog('testEvent');

		//verify that the event is not being sent
		assert.equal(testAppender.getEventsCount(), 1);

		service.dispose();
	}));


	test('Test hard idle stops events from being sent in idle state', sinon.test(function() {

		let service = new TelemetryService({ enableHardIdle: true, enableSoftIdle: false });
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		// make the user idle
		this.clock.tick(IdleMonitor.DEFAULT_IDLE_TIME);

		//report an event
		service.publicLog('testEvent');

		//verify that the event is not being sent
		assert.equal(testAppender.getEventsCount(), 0);

		service.dispose();
	}));

	test('Test soft idle start/stop events', sinon.test(function() {

		let activeListener: () => void = null;
		let idleListener: () => void = null;

		function MockIdleMonitor(timeout: number): void {
			assert.equal(timeout, TelemetryService.SOFT_IDLE_TIME);
		}

		MockIdleMonitor.prototype.addOneTimeActiveListener = function(callback: () => void): void {
			activeListener = callback;
		};

		MockIdleMonitor.prototype.addOneTimeIdleListener = function(callback: () => void): void {
			idleListener = callback;
		};

		MockIdleMonitor.prototype.dispose = function() {
			// empty
		};

		this.stub(IdleMonitor, 'IdleMonitor', MockIdleMonitor);

		let service = new TelemetryService({ enableHardIdle: false, enableSoftIdle: true });
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);


		assert.equal(testAppender.getEventsCount(), 0);

		idleListener();
		activeListener();
		idleListener();
		activeListener();

		//verify that two idle happened
		assert.equal(testAppender.getEventsCount(), 4);
		//first idle
		assert.equal(testAppender.events[0].eventName, TelemetryService.IDLE_START_EVENT_NAME);
		assert.equal(testAppender.events[1].eventName, TelemetryService.IDLE_STOP_EVENT_NAME);
		//second idle
		assert.equal(testAppender.events[2].eventName, TelemetryService.IDLE_START_EVENT_NAME);
		assert.equal(testAppender.events[3].eventName, TelemetryService.IDLE_STOP_EVENT_NAME);

		service.dispose();
	}));

	test('Telemetry Service uses provided session ID', sinon.test(function() {

		let testSessionId = 'test session id';
		let service = new TelemetryService({ sessionID: testSessionId });

		return service.getTelemetryInfo().then(info => {
			assert.equal(info.sessionId, testSessionId);
			service.dispose();
		});
	}));

	test('Telemetry Service respects user opt-in settings', sinon.test(function() {
		let service = new TelemetryService({userOptIn: false });
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		service.publicLog('testEvent');
		assert.equal(testAppender.getEventsCount(), 0);

		service.dispose();
	}));

	test('Telemetry Service sends events when enableTelemetry is on even user optin is on', sinon.test(function() {
		let service = new TelemetryService({userOptIn: true });
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		service.publicLog('testEvent');
		assert.equal(testAppender.getEventsCount(), 1);

		service.dispose();
	}));

	test('Telemetry Service allows optin friendly events', sinon.test(function() {
		let service = new TelemetryService({userOptIn: false });
		let testAppender = new TestTelemetryAppender();
		service.addTelemetryAppender(testAppender);

		service.publicLog('testEvent');
		assert.equal(testAppender.getEventsCount(), 0);

		service.publicLog(optInStatusEventName, {userOptIn: false});
		assert.equal(testAppender.getEventsCount(), 1);
		assert.equal(testAppender.events[0].eventName, optInStatusEventName);
		assert.equal(testAppender.events[0].data.userOptIn, false);
		service.dispose();
	}));
});