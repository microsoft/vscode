/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import WinJS = require('vs/base/common/winjs.base');
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { DeferredAction } from 'vs/platform/actions/common/actions';
import Actions = require('vs/base/common/actions');
import { AsyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IEventService } from 'vs/platform/event/common/event';
import { EventService } from 'vs/platform/event/common/eventService';

export class TestAction extends Actions.Action {
	private service;
	private first: string;
	private second: string;

	constructor(first: string, second: string, @IEventService eventService: IEventService) {
		super(first);
		this.service = eventService;
		this.first = first;
		this.second = second;
	}


	public run(): WinJS.Promise {
		return WinJS.TPromise.as((!!this.service && !!this.first && !!this.second) ? true : false);
	}
}

suite('Platform actions', () => {

	test('DeferredAction', (done) => {

		let instantiationService: TestInstantiationService = new TestInstantiationService();
		instantiationService.stub(IEventService, EventService);

		let action = new DeferredAction(
			instantiationService,
			new AsyncDescriptor<Actions.Action>('vs/platform/actions/test/common/actions.test', 'TestAction', 'my.id', 'Second'),
			'my.test.action',
			'Hello World',
			'css'
		);

		assert.strictEqual(action.id, 'my.test.action');
		action.run().then((result) => {
			assert.strictEqual(result, true);
			assert.strictEqual(action.id, 'my.id');
			done();
		});
	});
});
