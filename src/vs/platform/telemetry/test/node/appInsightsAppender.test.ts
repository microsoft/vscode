/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import {IAIAdapter} from 'vs/base/node/aiAdapter';
import {AppInsightsAppender, StorageKeys} from 'vs/platform/telemetry/node/appInsightsAppender';
import {TestStorageService} from 'vs/workbench/test/browser/servicesTestUtils';

interface IAppInsightsEvent {
	eventName: string;
	data: any;
}

class AIAdapterMock implements IAIAdapter {

	public events: IAppInsightsEvent[]=[];
	public IsTrackingPageView: boolean = false;
	public exceptions: any[] =[];

	constructor(private prefix: string) {
	}

	public log(eventName: string, data?: any): void {
		this.events.push({
			eventName: this.prefix+'/'+eventName,
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
		appender = new AppInsightsAppender(new TestStorageService(), { key: '123', asimovKey: undefined }, appInsightsMock);
	});

	teardown(() => {
		appender.dispose();
	});

	test('Simple event', () => {
		return appender.log('testEvent').then(_ => {
			assert.equal(appInsightsMock.events.length, 1);
			assert.equal(appInsightsMock.events[0].eventName, 'testPrefix/testEvent');
		});
	});

	test('test additional properties', () => {
		return appender.log('testEvent').then(_ => {
			assert.equal(appInsightsMock.events.length, 1);

			let [first] = appInsightsMock.events;
			assert.equal(first.eventName, 'testPrefix/testEvent');
			assert.ok('common.osVersion' in first.data);
			assert.ok('common.isNewSession' in first.data);
			assert.ok('common.firstSessionDate' in first.data);
			assert.ok(!('common.lastSessionDate' in first.data)); // conditional, see below
			// assert.ok('common.version.shell' in first.data); // only when running on electron
			// assert.ok('common.version.renderer' in first.data);
			// TODO@Joh: This is not always there...
			// if (process.platform === 'win32') { // SQM only on windows
			// 	assert.ok('common.sqm.userid' in first.data);
			// 	assert.ok('common.sqm.machineid' in first.data);
			// }
		});
	});

	test('test additional properties with storage data', () => {
		const storage = new TestStorageService();
		storage.store(StorageKeys.lastSessionDate, 'somevalue');
		let appender = new AppInsightsAppender(storage, { key: '123', asimovKey: undefined }, appInsightsMock);
		return appender.log('testEvent').then(_ => {
			let [first] = appInsightsMock.events;
			assert.ok('common.lastSessionDate' in first.data); // conditional
			appender.dispose();
		});
	});

	test('Event with data', () => {
		return appender.log('testEvent', {
			title: 'some title',
			width: 100,
			height: 200
		}).then(_ => {
			assert.equal(appInsightsMock.events.length, 1);
			assert.equal(appInsightsMock.events[0].eventName, 'testPrefix/testEvent');

			assert.equal(appInsightsMock.events[0].data['title'], 'some title');
			assert.equal(appInsightsMock.events[0].data['width'], 100);
			assert.equal(appInsightsMock.events[0].data['height'], 200);
		});
	});

	test('Test asimov', () => {
		appender = new AppInsightsAppender(new TestStorageService(), { key: '123', asimovKey: 'AIF-123' }, appInsightsMock);

		return appender.log('testEvent').then(_ => {
			assert.equal(appInsightsMock.events.length, 2);
			assert.equal(appInsightsMock.events[0].eventName, 'testPrefix/testEvent');

			// test vortex
			assert.equal(appInsightsMock.events[1].eventName, 'testPrefix/testEvent');
		});
	});
});