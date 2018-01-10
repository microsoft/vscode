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
import { TestFileService } from 'vs/workbench/test/workbenchTestServices';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileStat } from 'vs/platform/files/common/files';

suite('MainThreadEditors', () => {

	const resource = URI.parse('foo:bar');

	let modelService: IModelService;
	let editors: MainThreadEditors;

	const movedResources = new Map<URI, URI>();
	const createdResources = new Map<URI, string>();
	const deletedResources = new Set<URI>();

	setup(() => {
		const configService = new TestConfigurationService();
		modelService = new ModelServiceImpl(null, configService);
		const codeEditorService = new TestCodeEditorService();

		movedResources.clear();
		createdResources.clear();
		deletedResources.clear();
		const fileService = new TestFileService();

		fileService.moveFile = async (from, target): TPromise<IFileStat> => {
			assert(!movedResources.has(from));
			movedResources.set(from, target);
			return createMockFileStat(target);
		};
		fileService.createFile = async (uri, contents): TPromise<IFileStat> => {
			assert(!createdResources.has(uri));
			createdResources.set(uri, contents);
			return createMockFileStat(uri);
		};
		fileService.del = async (uri): TPromise<void> => {
			assert(!deletedResources.has(uri));
			deletedResources.add(uri);
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

		editors = new MainThreadEditors(
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

	test(`applyWorkspaceEdit with only resource edit`, () => {
		let model = modelService.createModel('something', null, resource);

		let workspaceResourceEdit: IWorkspaceResourceEdit = {
			resource: resource,
			modelVersionId: model.getVersionId(),
			edits: []
		};

		return editors.$tryApplyWorkspaceEdit([workspaceResourceEdit], {
			renamedResources: [{ from: resource, to: resource }],
			createdResources: [{ uri: resource, contents: 'foo' }],
			deletedResources: [resource]
		}).then((result) => {
			assert.equal(result, true);
			assert.equal(movedResources.get(resource), resource);
			assert.equal(createdResources.get(resource), 'foo');
			assert.equal(deletedResources.has(resource), true);
		});
	});
});


function createMockFileStat(target: URI): IFileStat {
	return {
		etag: '',
		hasChildren: false,
		isDirectory: false,
		name: target.path,
		mtime: 0,
		resource: target
	};
}

