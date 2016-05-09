/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {IAIAdapter} from 'vs/base/node/aiAdapter';
import {AppInsightsAppender} from 'vs/platform/telemetry/node/appInsightsAppender';

interface IAppInsightsEvent {
	eventName: string;
	data: any;
}

class AIAdapterMock implements IAIAdapter {

	public events: IAppInsightsEvent[] = [];
	public IsTrackingPageView: boolean = false;
	public exceptions: any[] = [];

	constructor(private prefix: string) {
	}

	public log(eventName: string, data?: any): void {
		this.events.push({
			eventName: this.prefix + '/' + eventName,
			data: data
		});
	}

	public logException(exception: any): void {
		this.exceptions.push(exception);
	}

	public dispose(): void {
	}
}

suite('Telemetry - AppInsightsTelemetryAppender', () => {
	var appInsightsMock: AIAdapterMock;
	var appender: AppInsightsAppender;

	setup(() => {
		appInsightsMock = new AIAdapterMock('testPrefix');
		appender = new AppInsightsAppender({ key: '123', asimovKey: undefined }, appInsightsMock);
	});

	teardown(() => {
		appender.dispose();
	});

	test('Simple event', () => {
		appender.log('testEvent');
		assert.equal(appInsightsMock.events.length, 1);
		assert.equal(appInsightsMock.events[0].eventName, 'testPrefix/testEvent');
	});

	test('Event with data', () => {
		appender.log('testEvent', {
			title: 'some title',
			width: 100,
			height: 200
		});
		assert.equal(appInsightsMock.events.length, 1);
		assert.equal(appInsightsMock.events[0].eventName, 'testPrefix/testEvent');

		assert.equal(appInsightsMock.events[0].data['title'], 'some title');
		assert.equal(appInsightsMock.events[0].data['width'], 100);
		assert.equal(appInsightsMock.events[0].data['height'], 200);
	});

	test('Test asimov', () => {
		appender = new AppInsightsAppender({ key: '123', asimovKey: 'AIF-123' }, appInsightsMock);
		appender.log('testEvent');
		assert.equal(appInsightsMock.events.length, 2);
		assert.equal(appInsightsMock.events[0].eventName, 'testPrefix/testEvent');

		// test vortex
		assert.equal(appInsightsMock.events[1].eventName, 'testPrefix/testEvent');
	});
});