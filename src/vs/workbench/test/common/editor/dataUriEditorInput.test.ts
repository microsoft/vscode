/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { workbenchInstantiationService } from 'vs/workbench/test/workbenchTestServices';
import { DataUriEditorInput } from 'vs/workbench/common/editor/dataUriEditorInput';
import { BinaryEditorModel } from 'vs/workbench/common/editor/binaryEditorModel';

suite('Workbench - DataUriEditorInput', () => {

	let instantiationService: IInstantiationService;

	setup(() => {
		instantiationService = workbenchInstantiationService();
	});

	test('simple', function () {
		const resource = URI.parse('data:image/png;label:SomeLabel;description:SomeDescription;size:1024;base64,77+9UE5');
		const input: DataUriEditorInput = instantiationService.createInstance(DataUriEditorInput, void 0, void 0, resource);

		assert.equal(input.getName(), 'SomeLabel');
		assert.equal(input.getDescription(), 'SomeDescription');

		return input.resolve().then((model: BinaryEditorModel) => {
			assert.ok(model);
			assert.equal(model.getSize(), 1024);
			assert.equal(model.getMime(), 'image/png');
		});
	});
});