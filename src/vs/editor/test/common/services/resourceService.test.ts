/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import assert = require('assert');
import URI from 'vs/base/common/uri';
import Service = require('vs/editor/common/services/resourceServiceImpl');
import MirrorModel = require('vs/editor/common/model/mirrorModel');
import resourceService = require('vs/editor/common/services/resourceService');

suite('Editor Services - ResourceService', () => {

	test('insert, remove, all', () => {

		var service = new Service.ResourceService();

		service.insert(URI.parse('test://1'), MirrorModel.createMirrorModelFromString(null, 1, 'hi', null));
		assert.equal(service.all().length, 1);

		service.insert(URI.parse('test://2'), MirrorModel.createMirrorModelFromString(null, 1, 'hi', null));
		assert.equal(service.all().length, 2);

		assert.ok(service.contains(URI.parse('test://1')));
		assert.ok(service.contains(URI.parse('test://2')));

		service.remove(URI.parse('test://1'));
		service.remove(URI.parse('test://1'));
		service.remove(URI.parse('test://2'));
		assert.equal(service.all().length, 0);
	});


	test('event - add, remove', () => {

		var eventCnt = 0;

		var url = URI.parse('far');
		var element = MirrorModel.createMirrorModelFromString(null, 1, 'hi', null);
		var service = new Service.ResourceService();
		service.addListener(resourceService.ResourceEvents.ADDED, () => {
			eventCnt++;
			assert.ok(true);
		});
		service.addListener(resourceService.ResourceEvents.REMOVED, () => {
			eventCnt++;
			assert.ok(true);
		});

		service.insert(url, element);
		service.remove(url);
		assert.equal(eventCnt, 2, 'events');
	});

	test('event - propagation', () => {

		var eventCnt = 0;

		var url = URI.parse('far');
		var element = MirrorModel.createMirrorModelFromString(null, 1, 'hi', null);
		var event = {};

		var service = new Service.ResourceService();
		service.insert(url, element);

		service.addBulkListener((events) => {
			eventCnt++;
			assert.equal(events.length, 1);
			assert.equal(events[0].getData().originalEvents.length, 1);
			assert.ok(events[0].getData().originalEvents[0].getData() === event);
		});

		element.emit('changed', event);
		assert.equal(eventCnt, 1, 'events');
	});

});
