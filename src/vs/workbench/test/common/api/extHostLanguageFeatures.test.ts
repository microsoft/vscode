/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import {MainThreadLanguageFeatures, ExtHostOutlineSupport} from 'vs/workbench/api/common/extHostLanguageFeatures';
import {PluginHostModelService, BaseTextDocument} from 'vs/workbench/api/common/pluginHostDocuments';
import {Position} from 'vs/workbench/api/common/pluginHostTypes';
import {Range as CodeEditorRange} from 'vs/editor/common/core/range';
import * as EditorCommon from 'vs/editor/common/editorCommon';
import QuickOutlineRegistry from 'vs/editor/contrib/quickOpen/common/quickOpen';

const mockThreadService = <any>{
	getRemotable() {
		return {};
	}
};

class MockDocuments extends PluginHostModelService {

	private _document: BaseTextDocument;

	constructor() {
		super(mockThreadService);

		this._document = new BaseTextDocument(URI.parse('fake://tests/a.file'),
			[
				'this is line one',
				'this is line two',
				'this is line three',
			],
			'\n', 'testing', 1, false);
	}

	public getDocument(resource: vscode.Uri): BaseTextDocument {
		return this._document;
	}
}


suite('ExtHostLanguageFeatures', function() {

	let model = { language: 'testing', uri: URI.parse('fake://tests/a.file') };
	let documents = new MockDocuments();
	let mainThreadFeatures = new MainThreadLanguageFeatures(mockThreadService);

	test('outline, register', function(done) {

		let count = QuickOutlineRegistry.all(model).length;

		mainThreadFeatures.$registerOutlineSupport(0, 'testing')
		mainThreadFeatures.$registerOutlineSupport(1, 'testing')

		let count2 = QuickOutlineRegistry.all(model).length;
		assert.equal(count2, count + 2);

		mainThreadFeatures.$unregister(8);
		assert.equal(QuickOutlineRegistry.all(model).length, count2);

		mainThreadFeatures.$unregister(0);
		assert.equal(QuickOutlineRegistry.all(model).length, count2 - 1);
	});
});