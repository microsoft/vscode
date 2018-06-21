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
import { TestCodeEditorService } from 'vs/editor/test/browser/editorTestServices';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ExtHostDocumentsAndEditorsShape, ExtHostContext, ExtHostDocumentsShape } from 'vs/workbench/api/node/extHost.protocol';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import { Event } from 'vs/base/common/event';
import { MainThreadTextEditors } from 'vs/workbench/api/electron-browser/mainThreadEditors';
import URI from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { IModelService } from 'vs/editor/common/services/modelService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { TestFileService, TestEditorService, TestEditorGroupsService, TestEnvironmentService, TestContextService } from 'vs/workbench/test/workbenchTestServices';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileStat } from 'vs/platform/files/common/files';
import { ResourceTextEdit } from 'vs/editor/common/modes';
import { BulkEditService } from 'vs/workbench/services/bulkEdit/electron-browser/bulkEditService';
import { NullLogService } from 'vs/platform/log/common/log';

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
			async createFile(uri: URI): TPromise<IFileStat> {
				createdResources.add(uri);
				return createMockFileStat(uri);
			}
		};


		const textFileService = new class extends mock<ITextFileService>() {
			isDirty() { return false; }
			delete(resource: URI) {
				deletedResources.add(resource);
				return TPromise.as(void 0);
			}
			move(source: URI, target: URI) {
				movedResources.set(source, target);
				return TPromise.as(void 0);
			}
			models = <any>{
				onModelSaved: Event.None,
				onModelReverted: Event.None,
				onModelDirty: Event.None,
			};
		};
		const workbenchEditorService = new TestEditorService();
		const editorGroupService = new TestEditorGroupsService();

		const bulkEditService = new BulkEditService(new NullLogService(), modelService, new TestEditorService(), null, fileService, textFileService, TestEnvironmentService, new TestContextService());

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
			bulkEditService,
		);

		editors = new MainThreadTextEditors(
			documentAndEditor,
			SingleProxyRPCProtocol(null),
			codeEditorService,
			bulkEditService,
			workbenchEditorService,
			editorGroupService,
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
				{ oldUri: resource, newUri: resource, options: undefined },
				{ oldUri: undefined, newUri: resource, options: undefined },
				{ oldUri: resource, newUri: undefined, options: undefined }
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
