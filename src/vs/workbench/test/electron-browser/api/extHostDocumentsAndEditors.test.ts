/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from 'vs/base/common/uri';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/common/extHostDocumentsAndEditors';
import { TestRPCProtocol } from 'vs/workbench/test/electron-browser/api/testRPCProtocol';

suite('ExtHostDocumentsAndEditors', () => {

	let editors: ExtHostDocumentsAndEditors;

	setup(function () {
		editors = new ExtHostDocumentsAndEditors(new TestRPCProtocol());
	});

	test('The value of TextDocument.isClosed is incorrect when a text document is closed, #27949', () => {

		editors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				EOL: '\n',
				isDirty: true,
				modeId: 'fooLang',
				uri: URI.parse('foo:bar'),
				versionId: 1,
				lines: [
					'first',
					'second'
				]
			}]
		});

		return new Promise((resolve, reject) => {

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
				removedDocuments: [URI.parse('foo:bar')]
			});

		});
	});

});
