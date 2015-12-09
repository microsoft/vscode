/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { NodeAppInsightsTelemetryAppender } from 'vs/workbench/parts/telemetry/node/nodeAppInsightsTelemetryAppender';

interface IAppInsightsEvent {
	eventName: string;
	properties?: {string?: string;};
	measurements?: {string?: number;}
}

class AppInsightsMock {

	public events: IAppInsightsEvent[]=[];
	public IsTrackingPageView: boolean = false;
	public exceptions: any[] =[];

	public trackEvent(eventName: string, properties?: {string?: string;}, measurements?: {string?: number;}): void {
		this.events.push({
			eventName: eventName,
			properties: properties,
			measurements: measurements
		});
	}
	public trackPageView(): void {
		this.IsTrackingPageView = true;
	}

	public trackException(exception: any): void {
		this.exceptions.push(exception);
	}
}

class ContextServiceMock {

	constructor(private key?: string, private asimovKey?: string) {}

	getConfiguration(): any {
		return {
			env: {
				aiConfig: {
					key: this.key,
					asimovKey: this.asimovKey
				}
			}
		}
	}
}

suite('Telemetry - AppInsightsTelemetryAppender', () => {
	var appInsightsMock: AppInsightsMock;
	var appender: NodeAppInsightsTelemetryAppender;

	setup(() => {
		appInsightsMock = new AppInsightsMock();
		appender = new NodeAppInsightsTelemetryAppender(null,<any> new ContextServiceMock('123'), appInsightsMock);
	});

	teardown(() => {
		appender.dispose();
	});

	test('Simple event', () => {
		appender.log('testEvent');

		assert.equal(appInsightsMock.events.length, 1);
		assert.equal(appInsightsMock.events[0].eventName, NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX+'testEvent');
	});

	test('Track UnhandledError as exception and events', () => {
		var sampleError = new Error('test');

		appender.log('UnhandledError', sampleError);

		assert.equal(appInsightsMock.events.length, 1);
		assert.equal(appInsightsMock.events[0].eventName, NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX+'UnhandledError');

		assert.equal(appInsightsMock.exceptions.length, 1);
	});

	test('property limits', () => {
		var reallyLongPropertyName = 'abcdefghijklmnopqrstuvwxyz';
		for (var i =0; i <6; i++) {
			reallyLongPropertyName +='abcdefghijklmnopqrstuvwxyz';
		}
		assert(reallyLongPropertyName.length > 150);

		var reallyLongPropertyValue = 'abcdefghijklmnopqrstuvwxyz012345678901234567890123';
		for (var i =0; i <21; i++) {
			reallyLongPropertyValue +='abcdefghijklmnopqrstuvwxyz012345678901234567890123';
		}
		assert(reallyLongPropertyValue.length > 1024);

		var data = {};
		data[reallyLongPropertyName] = '1234';
		data['reallyLongPropertyValue'] = reallyLongPropertyValue;
		appender.log('testEvent', data);

		assert.equal(appInsightsMock.events.length, 1);

		for (var prop in appInsightsMock.events[0].properties){
			assert(prop.length < 150);
			assert(appInsightsMock.events[0].properties[prop].length <1024);
		}
	});

	test('Different data types', () => {
		var date = new Date();
		appender.log('testEvent', { favoriteDate: date, likeRed: false, likeBlue: true, favoriteNumber:1,  favoriteColor: 'blue', favoriteCars: ['bmw', 'audi', 'ford']});

		assert.equal(appInsightsMock.events.length, 1);
		assert.equal(appInsightsMock.events[0].eventName, NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX+'testEvent');
		assert.equal(appInsightsMock.events[0].properties['favoriteColor'], 'blue');
		assert.equal(appInsightsMock.events[0].measurements['likeRed'], 0);
		assert.equal(appInsightsMock.events[0].measurements['likeBlue'], 1);
		assert.equal(appInsightsMock.events[0].properties['favoriteDate'], date.toISOString());
		assert.equal(appInsightsMock.events[0].properties['favoriteCars'], JSON.stringify(['bmw', 'audi', 'ford']));
		assert.equal(appInsightsMock.events[0].measurements['favoriteNumber'], 1);
	});

	test('Nested data', () => {
		appender.log('testEvent', {
			window : {
				title: 'some title',
				measurements: {
					width: 100,
					height: 200
				}
			},
			nestedObj: {
				nestedObj2: {
					nestedObj3: {
						testProperty: 'test',
					}
				},
				testMeasurement:1
			}
		});

		assert.equal(appInsightsMock.events.length, 1);
		assert.equal(appInsightsMock.events[0].eventName, NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX+'testEvent');

		assert.equal(appInsightsMock.events[0].properties['window.title'], 'some title');
		assert.equal(appInsightsMock.events[0].measurements['window.measurements.width'], 100);
		assert.equal(appInsightsMock.events[0].measurements['window.measurements.height'], 200);

		assert.equal(appInsightsMock.events[0].properties['nestedObj.nestedObj2.nestedObj3'], JSON.stringify({"testProperty":"test"}));
		assert.equal(appInsightsMock.events[0].measurements['nestedObj.testMeasurement'],1);
	});

	test('Test asimov', () => {
		appender = new NodeAppInsightsTelemetryAppender(null, <any> new ContextServiceMock('123', 'AIF-123'), appInsightsMock);

		appender.log('testEvent');

		assert.equal(appInsightsMock.events.length, 2);
		assert.equal(appInsightsMock.events[0].eventName, NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX+'testEvent');

		// test vortex
		assert.equal(appInsightsMock.events[1].eventName, NodeAppInsightsTelemetryAppender.EVENT_NAME_PREFIX+'testEvent');
	});
});