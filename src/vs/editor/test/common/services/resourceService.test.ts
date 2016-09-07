/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {CompatMirrorModel} from 'vs/editor/common/model/compatMirrorModel';
import {ResourceService} from 'vs/editor/common/services/resourceServiceImpl';
import {TextModel} from 'vs/editor/common/model/textModel';

function createTestMirrorModelFromString(value:string): CompatMirrorModel {
	return new CompatMirrorModel(0, TextModel.toRawText(value, TextModel.DEFAULT_CREATION_OPTIONS), null);
}

suite('Editor Services - ResourceService', () => {

	test('insert, remove, all', () => {

		let service = new ResourceService();

		service.insert(URI.parse('test://1'), createTestMirrorModelFromString('hi'));
		assert.equal(service.get(URI.parse('test://1')).getValue(), 'hi');

		service.insert(URI.parse('test://2'), createTestMirrorModelFromString('hi'));

		service.remove(URI.parse('test://1'));
		service.remove(URI.parse('test://1'));
		service.remove(URI.parse('test://2'));

		assert.equal(service.get(URI.parse('test://1')), null);
	});

	test('inserting the same resource twice throws', () => {
		let service = new ResourceService();

		service.insert(URI.parse('test://path/some-N1ce-name'), createTestMirrorModelFromString('hello'));

		assert.throws(() => {
			service.insert(URI.parse('test://path/some-N1ce-name'), createTestMirrorModelFromString('hello again'));
		});
	});
});
