/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { SearchEditorModel, searchEditorModelFactory } from '../../browser/searchEditorModel.js';

suite('SearchEditorModel', () => {
	const resource = URI.from({ scheme: 'search-editor', fragment: 'test' });

	teardown(() => searchEditorModelFactory.models.delete(resource));

	test('does not delete a replacement model when disposed', () => {
		const modelReference = { resolve: () => Promise.reject(new Error('Not implemented')) };
		searchEditorModelFactory.models.set(resource, modelReference);
		const model = new SearchEditorModel(resource);

		const replacementModelReference = { resolve: () => Promise.reject(new Error('Not implemented')) };
		searchEditorModelFactory.models.set(resource, replacementModelReference);
		model.dispose();

		assert.strictEqual(searchEditorModelFactory.models.get(resource), replacementModelReference);
	});
});
