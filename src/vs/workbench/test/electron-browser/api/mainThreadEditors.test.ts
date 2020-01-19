/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { MainThreadDocumentsAndEditors } from 'vs/workbench/api/browser/mainThreadDocumentsAndEditors';
import { SingleProxyRPCProtocol, TestRPCProtocol } from './testRPCProtocol';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ModelServiceImpl } from 'vs/editor/common/services/modelServiceImpl';
import { TestCodeEditorService } from 'vs/editor/test/browser/editorTestServices';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ExtHostDocumentsAndEditorsShape, ExtHostContext, ExtHostDocumentsShape } from 'vs/workbench/api/common/extHost.protocol';
import { mock } from 'vs/workbench/test/electron-browser/api/mock';
import { Event } from 'vs/base/common/event';
import { MainThreadTextEditors } from 'vs/workbench/api/browser/mainThreadEditors';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { IModelService } from 'vs/editor/common/services/modelService';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { TestFileService, TestEditorService, TestEditorGroupsService, TestEnvironmentService, TestContextService, TestTextResourcePropertiesService } from 'vs/workbench/test/workbenchTestServices';
import { WorkspaceTextEdit } from 'vs/editor/common/modes';
import { BulkEditService } from 'vs/workbench/services/bulkEdit/browser/bulkEditService';
import { NullLogService } from 'vs/platform/log/common/log';
import { ITextModelService, IResolvedTextEditorModel } from 'vs/editor/common/services/resolverService';
import { IReference, ImmortalReference } from 'vs/base/common/lifecycle';
import { IPanelService } from 'vs/workbench/services/panel/common/panelService';
import { LabelService } from 'vs/workbench/services/label/common/labelService';
import { TestThemeService } from 'vs/platform/theme/test/common/testThemeService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';

suite('MainThreadEditors', () => {

	const resource = URI.parse('foo:bar');

	let modelService: IModelService;
	let editors: MainThreadTextEditors;

	const movedResources = new Map<URI, URI>();
	const copiedResources = new Map<URI, URI>();
	const createdResources = new Set<URI>();
	const deletedResources = new Set<URI>();

	setup(() => {
		const configService = new TestConfigurationService();
		modelService = new ModelServiceImpl(configService, new TestTextResourcePropertiesService(configService), new TestThemeService(), new NullLogService());
		const codeEditorService = new TestCodeEditorService();

		movedResources.clear();
		copiedResources.clear();
		createdResources.clear();
		deletedResources.clear();

		const fileService = new TestFileService();

		const textFileService = new class extends mock<ITextFileService>() {
			isDirty() { return false; }
			create(uri: URI, contents?: string, options?: any) {
				createdResources.add(uri);
				return Promise.resolve(Object.create(null));
			}
			delete(resource: URI) {
				deletedResources.add(resource);
				return Promise.resolve(undefined);
			}
			move(source: URI, target: URI) {
				movedResources.set(source, target);
				return Promise.resolve(Object.create(null));
			}
			copy(source: URI, target: URI) {
				copiedResources.set(source, target);
				return Promise.resolve(Object.create(null));
			}
			files = <any>{
				onDidSave: Event.None,
				onDidRevert: Event.None,
				onDidChangeDirty: Event.None
			};
		};
		const workbenchEditorService = new TestEditorService();
		const editorGroupService = new TestEditorGroupsService();
		const textModelService = new class extends mock<ITextModelService>() {
			createModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
				const textEditorModel = new class extends mock<IResolvedTextEditorModel>() {
					textEditorModel = modelService.getModel(resource)!;
				};
				textEditorModel.isReadonly = () => false;
				return Promise.resolve(new ImmortalReference(textEditorModel));
			}
		};

		const editorWorkerService = new class extends mock<IEditorWorkerService>() {

		};

		const bulkEditService = new BulkEditService(new NullLogService(), modelService, new TestEditorService(), editorWorkerService, textModelService, new TestFileService(), textFileService, new LabelService(TestEnvironmentService, new TestContextService()), configService);

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
			fileService,
			null!,
			editorGroupService,
			bulkEditService,
			new class extends mock<IPanelService>() implements IPanelService {
				_serviceBrand: undefined;
				onDidPanelOpen = Event.None;
				onDidPanelClose = Event.None;
				getActivePanel() {
					return undefined;
				}
			},
			TestEnvironmentService
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

		let workspaceResourceEdit: WorkspaceTextEdit = {
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

	test(`issue #54773: applyWorkspaceEdit checks model version in race situation`, () => {

		let model = modelService.createModel('something', null, resource);

		let workspaceResourceEdit1: WorkspaceTextEdit = {
			resource: resource,
			modelVersionId: model.getVersionId(),
			edits: [{
				text: 'asdfg',
				range: new Range(1, 1, 1, 1)
			}]
		};
		let workspaceResourceEdit2: WorkspaceTextEdit = {
			resource: resource,
			modelVersionId: model.getVersionId(),
			edits: [{
				text: 'asdfg',
				range: new Range(1, 1, 1, 1)
			}]
		};

		let p1 = editors.$tryApplyWorkspaceEdit({ edits: [workspaceResourceEdit1] }).then((result) => {
			// first edit request succeeds
			assert.equal(result, true);
		});
		let p2 = editors.$tryApplyWorkspaceEdit({ edits: [workspaceResourceEdit2] }).then((result) => {
			// second edit request fails
			assert.equal(result, false);
		});
		return Promise.all([p1, p2]);
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
