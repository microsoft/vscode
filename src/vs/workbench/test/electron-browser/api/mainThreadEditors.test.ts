/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { MainThreadDocumentsAndEditors } from 'vs/workbench/api/electron-browser/mainThreadDocumentsAndEditors';
import { OneGetThreadService, TestThreadService } from './testThreadService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { TestCodeEditorService } from 'vs/editor/test/browser/testCodeEditorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExtHostDocumentsAndEditorsShape, IWorkspaceResourceEdit, ExtHostContext, ExtHostDocumentsShape } from 'vs/workbench/api/node/extHost.protocol';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import Event from 'vs/base/common/event';
import { MainThreadEditors } from 'vs/workbench/api/electron-browser/mainThreadEditors';
import URI from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { IModelService } from 'vs/editor/common/services/modelService';
import { EditOperation } from 'vs/editor/common/core/editOperation';

suite('MainThreadEditors', () => {

	const resource = URI.parse('foo:bar');

	let modelService: IModelService;
	let editors: MainThreadEditors;

	setup(() => {
		const configService = new TestConfigurationService();
		modelService = new ModelServiceImpl(null, configService);
		const codeEditorService = new TestCodeEditorService();
		const textFileService = new class extends mock<ITextFileService>() {
			isDirty() { return false; }
			models = <any>{
				onModelSaved: Event.None,
				onModelReverted: Event.None,
				onModelDirty: Event.None,
			};
		};
		const workbenchEditorService = <IWorkbenchEditorService>{
			getVisibleEditors() { return []; },
			getActiveEditor() { return undefined; }
		};
		const editorGroupService = new class extends mock<IEditorGroupService>() {
			onEditorsChanged = Event.None;
			onEditorGroupMoved = Event.None;
		};

		const testThreadService = new TestThreadService(true);
		testThreadService.setTestInstance(ExtHostContext.ExtHostDocuments, new class extends mock<ExtHostDocumentsShape>() {
			$acceptModelChanged(): void {
			}
		});
		testThreadService.setTestInstance(ExtHostContext.ExtHostDocumentsAndEditors, new class extends mock<ExtHostDocumentsAndEditorsShape>() {
			$acceptDocumentsAndEditorsDelta(): void {
			}
		});

		const documentAndEditor = new MainThreadDocumentsAndEditors(
			testThreadService,
			modelService,
			textFileService,
			workbenchEditorService,
			codeEditorService,
			null,
			null,
			null,
			null,
			editorGroupService,
		);

		editors = new MainThreadEditors(
			documentAndEditor,
			OneGetThreadService(null),
			codeEditorService,
			workbenchEditorService,
			editorGroupService,
			null,
			null,
			modelService
		);
	});

	test(`applyWorkspaceEdit returns false if model is changed by user`, () => {

		let model = modelService.createModel('something', null, resource);

		let workspaceResourceEdit: IWorkspaceResourceEdit = {
			resource: resource,
			modelVersionId: model.getVersionId(),
			edits: [{
				newText: 'asdfg',
				range: new Range(1, 1, 1, 1)
			}]
		};

		// Act as if the user edited the model
		model.applyEdits([EditOperation.insert(new Position(0, 0), 'something')]);

		return editors.$tryApplyWorkspaceEdit([workspaceResourceEdit]).then((result) => {
			assert.equal(result, false);
		});
	});
});
