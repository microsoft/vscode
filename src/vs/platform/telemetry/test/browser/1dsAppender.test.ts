/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import type { ITelemetryItem, ITelemetryUnloadState } from '@microsoft/1ds-core-js';
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { OneDataSystemWebAppender } from 'vs/platform/telemetry/browser/1dsAppender';
import { IAppInsightsCore } from 'vs/platform/telemetry/common/1dsAppender';

class AppInsightsCoreMock implements IAppInsightsCore {
	pluginVersionString: string = 'Test Runner';
	public events: any[] = [];
	public IsTrackingPageView: boolean = false;
	public exceptions: any[] = [];

	public track(event: ITelemetryItem) {
		this.events.push(event.baseData);
	}

	public unload(isAsync: boolean, unloadComplete: (unloadState: ITelemetryUnloadState) => void): void {
		// No-op
	}
}

suite('AIAdapter', () => {
	let appInsightsMock: AppInsightsCoreMock;
	let adapter: OneDataSystemWebAppender;
	const prefix = 'prefix';


	teardown(() => {
		adapter.flush();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	setup(() => {
		appInsightsMock = new AppInsightsCoreMock();
		adapter = new OneDataSystemWebAppender(false, prefix, undefined!, () => appInsightsMock);
	});


	test('Simple event', () => {
		adapter.log('testEvent');

		assert.strictEqual(appInsightsMock.events.length, 1);
		assert.strictEqual(appInsightsMock.events[0].name, `${prefix}/testEvent`);
	});

	test('addional data', () => {
		adapter = new OneDataSystemWebAppender(false, prefix, { first: '1st', second: 2, third: true }, () => appInsightsMock);
		adapter.log('testEvent');

		assert.strictEqual(appInsightsMock.events.length, 1);
		const [first] = appInsightsMock.events;
		assert.strictEqual(first.name, `${prefix}/testEvent`);
		assert.strictEqual(first.properties!['first'], '1st');
		assert.strictEqual(first.measurements!['second'], 2);
		assert.strictEqual(first.measurements!['third'], 1);
	});

	test('property limits', () => {
		let reallyLongPropertyName = 'abcdefghijklmnopqrstuvwxyz';
		for (let i = 0; i < 6; i++) {
			reallyLongPropertyName += 'abcdefghijklmnopqrstuvwxyz';
		}
		assert(reallyLongPropertyName.length > 150);

		let reallyLongPropertyValue = 'abcdefghijklmnopqrstuvwxyz012345678901234567890123';
		for (let i = 0; i < 400; i++) {
			reallyLongPropertyValue += 'abcdefghijklmnopqrstuvwxyz012345678901234567890123';
		}
		assert(reallyLongPropertyValue.length > 8192);

		const data = Object.create(null);
		data[reallyLongPropertyName] = '1234';
		data['reallyLongPropertyValue'] = reallyLongPropertyValue;
		adapter.log('testEvent', data);

		assert.strictEqual(appInsightsMock.events.length, 1);

		for (const prop in appInsightsMock.events[0].properties!) {
			assert(prop.length < 150);
			assert(appInsightsMock.events[0].properties![prop].length < 8192);
		}
	});

	test('Different data types', () => {
		const date = new Date();
		adapter.log('testEvent', { favoriteDate: date, likeRed: false, likeBlue: true, favoriteNumber: 1, favoriteColor: 'blue', favoriteCars: ['bmw', 'audi', 'ford'] });

		assert.strictEqual(appInsightsMock.events.length, 1);
		assert.strictEqual(appInsightsMock.events[0].name, `${prefix}/testEvent`);
		assert.strictEqual(appInsightsMock.events[0].properties!['favoriteColor'], 'blue');
		assert.strictEqual(appInsightsMock.events[0].measurements!['likeRed'], 0);
		assert.strictEqual(appInsightsMock.events[0].measurements!['likeBlue'], 1);
		assert.strictEqual(appInsightsMock.events[0].properties!['favoriteDate'], date.toISOString());
		assert.strictEqual(appInsightsMock.events[0].properties!['favoriteCars'], JSON.stringify(['bmw', 'audi', 'ford']));
		assert.strictEqual(appInsightsMock.events[0].measurements!['favoriteNumber'], 1);
	});

	test('Nested data', () => {
		adapter.log('testEvent', {
			window: {
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
				testMeasurement: 1
			}
		});

		assert.strictEqual(appInsightsMock.events.length, 1);
		assert.strictEqual(appInsightsMock.events[0].name, `${prefix}/testEvent`);

		assert.strictEqual(appInsightsMock.events[0].properties!['window.title'], 'some title');
		assert.strictEqual(appInsightsMock.events[0].measurements!['window.measurements.width'], 100);
		assert.strictEqual(appInsightsMock.events[0].measurements!['window.measurements.height'], 200);

		assert.strictEqual(appInsightsMock.events[0].properties!['nestedObj.nestedObj2.nestedObj3'], JSON.stringify({ 'testProperty': 'test' }));
		assert.strictEqual(appInsightsMock.events[0].measurements!['nestedObj.testMeasurement'], 1);
	});

});
