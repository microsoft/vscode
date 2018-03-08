/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as assert from 'assert';
import { MainThreadDocumentsAndEditors } from 'vs/workbench/api/electron-browser/mainThreadDocumentsAndEditors';
import { SingleProxyRPCProtocol, TestRPCProtocol } from './testRPCProtocol';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { TestCodeEditorService } from 'vs/editor/test/browser/testCodeEditorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ExtHostDocumentsAndEditorsShape, ExtHostContext, ExtHostDocumentsShape } from 'vs/workbench/api/node/extHost.protocol';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import Event from 'vs/base/common/event';
import { MainThreadTextEditors } from 'vs/workbench/api/electron-browser/mainThreadEditors';
import URI from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { IModelService } from 'vs/editor/common/services/modelService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileStat } from 'vs/platform/files/common/files';
import { ResourceTextEdit } from 'vs/editor/common/modes';

suite('MainThreadEditors', () => {

	const resource = URI.parse('foo:bar');

	let modelService: IModelService;
	let editors: MainThreadTextEditors;

	const movedResources = new Map<URI, URI>();
	const createdResources = new Set<URI>();
	const deletedResources = new Set<URI>();

	setup(() => {
		const configService = new TestConfigurationService();
		modelService = new ModelServiceImpl(null, configService);
		const codeEditorService = new TestCodeEditorService();

		movedResources.clear();
		createdResources.clear();
		deletedResources.clear();

		const fileService = new class extends TestFileService {
			async moveFile(from, target): TPromise<IFileStat> {
				movedResources.set(from, target);
				return createMockFileStat(target);
			}
			async createFile(uri): TPromise<IFileStat> {
				createdResources.add(uri);
				return createMockFileStat(uri);
			}
			async del(uri): TPromise<any> {
				deletedResources.add(uri);
			}
		};


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

		const rpcProtocol = new TestRPCProtocol();
		rpcProtocol.set(ExtHostContext.ExtHostDocuments, new class extends mock<ExtHostDocumentsShape>() {
			$acceptModelChanged(): void {
			}
		});
		rpcProtocol.set(ExtHostContext.ExtHostDocumentsAndEditors, new class extends mock<ExtHostDocumentsAndEditorsShape>() {
			$acceptDocumentsAndEditorsDelta(): void {
			}
		});

		const documentAndEditor = new MainThreadDocumentsAndEditors(
			rpcProtocol,
			modelService,
			textFileService,
			workbenchEditorService,
			codeEditorService,
			null,
			fileService,
			null,
			null,
			editorGroupService,
		);

		editors = new MainThreadTextEditors(
			documentAndEditor,
			SingleProxyRPCProtocol(null),
			codeEditorService,
			workbenchEditorService,
			editorGroupService,
			null,
			fileService,
			modelService
		);
	});

	test(`applyWorkspaceEdit returns false if model is changed by user`, () => {

		let model = modelService.createModel('something', null, resource);

		let workspaceResourceEdit: ResourceTextEdit = {
			resource: resource,
			modelVersionId: model.getVersionId(),
			edits: [{
				text: 'asdfg',
				range: new Range(1, 1, 1, 1)
			}]
		};

		// Act as if the user edited the model
		model.applyEdits([EditOperation.insert(new Position(0, 0), 'something')]);

		return editors.$tryApplyWorkspaceEdit({ edits: [workspaceResourceEdit] }).then((result) => {
			assert.equal(result, false);
		});
	});

	test(`applyWorkspaceEdit with only resource edit`, () => {
		return editors.$tryApplyWorkspaceEdit({
			edits: [
				{ oldUri: resource, newUri: resource },
				{ oldUri: undefined, newUri: resource },
				{ oldUri: resource, newUri: undefined }
			]
		}).then((result) => {
			assert.equal(result, true);
			assert.equal(movedResources.get(resource), resource);
			assert.equal(createdResources.has(resource), true);
			assert.equal(deletedResources.has(resource), true);
		});
	});
});


function createMockFileStat(target: URI): IFileStat {
	return {
		etag: '',
		isDirectory: false,
		name: target.path,
		mtime: 0,
		resource: target
	};
}

