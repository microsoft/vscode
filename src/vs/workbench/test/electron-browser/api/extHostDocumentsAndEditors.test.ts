/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import URI from 'vs/base/common/uri';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { TPromise } from 'vs/base/common/winjs.base';


suite('ExtHostDocumentsAndEditors', () => {

	let editors: ExtHostDocumentsAndEditors;

	setup(function () {
		editors = new ExtHostDocumentsAndEditors({
			get() { return undefined; }
		});
	});

	test('The value of TextDocument.isClosed is incorrect when a text document is closed, #27949', () => {

		editors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				EOL: '\n',
				isDirty: true,
				modeId: 'fooLang',
				url: URI.parse('foo:bar'),
				versionId: 1,
				lines: [
					'first',
					'second'
				]
			}]
		});

		return new TPromise((resolve, reject) => {

			editors.onDidRemoveDocuments(e => {
				try {

					for (const data of e) {
						assert.equal(data.document.isClosed, true);
					}
					resolve(undefined);
				} catch (e) {
					reject(e);
				}
			});

			editors.$acceptDocumentsAndEditorsDelta({
				removedDocuments: ['foo:bar']
			});

		});
	});

});
