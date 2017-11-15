/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { TPromise } from 'vs/base/common/winjs.base';
import * as extHostTypes from 'vs/workbench/api/node/extHostTypes';
import { MainContext, MainThreadEditorsShape, IWorkspaceResourceEdit } from 'vs/workbench/api/node/extHost.protocol';
import URI from 'vs/base/common/uri';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import { ExtHostDocumentsAndEditors } from 'vs/workbench/api/node/extHostDocumentsAndEditors';
import { OneGetThreadService, TestThreadService } from 'vs/workbench/test/electron-browser/api/testThreadService';
import { ExtHostEditors } from 'vs/workbench/api/node/extHostTextEditors';

suite('ExtHostTextEditors.applyWorkspaceEdit', () => {

	const resource = URI.parse('foo:bar');
	let editors: ExtHostEditors;
	let workspaceResourceEdits: IWorkspaceResourceEdit[];

	setup(() => {
		workspaceResourceEdits = null;

		let threadService = new TestThreadService();
		threadService.setTestInstance(MainContext.MainThreadEditors, new class extends mock<MainThreadEditorsShape>() {
			$tryApplyWorkspaceEdit(_workspaceResourceEdits: IWorkspaceResourceEdit[]): TPromise<boolean> {
				workspaceResourceEdits = _workspaceResourceEdits;
				return TPromise.as(true);
			}
		});
		const documentsAndEditors = new ExtHostDocumentsAndEditors(OneGetThreadService(null));
		documentsAndEditors.$acceptDocumentsAndEditorsDelta({
			addedDocuments: [{
				isDirty: false,
				modeId: 'foo',
				url: resource,
				versionId: 1337,
				lines: ['foo'],
				EOL: '\n',
			}]
		});
		editors = new ExtHostEditors(threadService, documentsAndEditors);
	});

	test('uses version id if document available', () => {
		let edit = new extHostTypes.WorkspaceEdit();
		edit.replace(resource, new extHostTypes.Range(0, 0, 0, 0), 'hello');
		return editors.applyWorkspaceEdit(edit).then((result) => {
			assert.equal(workspaceResourceEdits.length, 1);
			assert.equal(workspaceResourceEdits[0].modelVersionId, 1337);
		});
	});

	test('does not use version id if document is not available', () => {
		let edit = new extHostTypes.WorkspaceEdit();
		edit.replace(URI.parse('foo:bar2'), new extHostTypes.Range(0, 0, 0, 0), 'hello');
		return editors.applyWorkspaceEdit(edit).then((result) => {
			assert.equal(workspaceResourceEdits.length, 1);
			assert.ok(typeof workspaceResourceEdits[0].modelVersionId === 'undefined');
		});
	});

});
