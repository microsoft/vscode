/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { MainThreadDocumentContentProviders } from '../../browser/mainThreadDocumentContentProviders.js';
import { createTextModel } from '../../../../editor/test/common/testTextModel.js';
import { mock } from '../../../../base/test/common/mock.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { IEditorWorkerService } from '../../../../editor/common/services/editorWorker.js';
import { TestRPCProtocol } from '../common/testRPCProtocol.js';
import { TextEdit } from '../../../../editor/common/languages.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('MainThreadDocumentContentProviders', function () {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('events are processed properly', function () {

		const uri = URI.parse('test:uri');
		const model = createTextModel('1', undefined, undefined, uri);

		const providers = new MainThreadDocumentContentProviders(new TestRPCProtocol(), null!, null!,
			new class extends mock<IModelService>() {
				override getModel(_uri: URI) {
					assert.strictEqual(uri.toString(), _uri.toString());
					return model;
				}
			},
			new class extends mock<IEditorWorkerService>() {
				override computeMoreMinimalEdits(_uri: URI, data: TextEdit[] | undefined) {
					assert.strictEqual(model.getValue(), '1');
					return Promise.resolve(data);
				}
			},
		);

		store.add(model);
		store.add(providers);

		return new Promise<void>((resolve, reject) => {
			let expectedEvents = 1;
			store.add(model.onDidChangeContent(e => {
				expectedEvents -= 1;
				try {
					assert.ok(expectedEvents >= 0);
				} catch (err) {
					reject(err);
				}
				if (model.getValue() === '1\n2\n3') {
					model.dispose();
					resolve();
				}
			}));
			providers.$onVirtualDocumentChange(uri, '1\n2');
			providers.$onVirtualDocumentChange(uri, '1\n2\n3');
		});
	});
});
