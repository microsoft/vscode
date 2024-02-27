/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { FuzzyScore } from 'vs/base/common/filters';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { Mutable } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IBulkEditEditorService, ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IMultiDiffEditorOptions } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { WorkbenchAsyncDataTree } from 'vs/platform/list/browser/listService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IResourceDiffEditorInput } from 'vs/workbench/common/editor';
import { BulkEditEditor } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditEditor';
import { BulkEditPreviewProvider, BulkFileOperations } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview';
import { BulkEditElement } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditTree';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP, IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Range } from 'vs/editor/common/core/range';

export class BulkEditEditorService implements IBulkEditEditorService {

	declare readonly _serviceBrand: undefined;

	static readonly ID = 'refactorPreview';
	static URI = URI.from({ scheme: 'refactor-preview-editor' });

	static readonly ctxHasCategories = new RawContextKey('refactorPreview.hasCategories', false);
	static readonly ctxGroupByFile = new RawContextKey('refactorPreview.groupByFile', true);
	static readonly ctxHasCheckedChanges = new RawContextKey('refactorPreview.hasCheckedChanges', true);

	private _tree!: WorkbenchAsyncDataTree<BulkFileOperations, BulkEditElement, FuzzyScore>;
	private readonly _disposables = new DisposableStore();
	private _currentInput?: BulkFileOperations;
	private _currentProvider?: BulkEditPreviewProvider;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorGroupsService private readonly _groupService: IEditorGroupsService,
		@IStorageService _storageService: IStorageService,
	) { }

	private _onDidChangeBodyVisibility = new Emitter<boolean>();
	readonly onDidChangeBodyVisibility: Event<boolean> = this._onDidChangeBodyVisibility.event;

	dispose(): void {
		this._tree.dispose();
		this._disposables.dispose();
	}

	hasInput(): boolean {
		return Boolean(this._currentInput);
	}

	public async openBulkEditEditor(edits: ResourceEdit[]): Promise<ResourceEdit[] | undefined> {
		this._currentInput = await this._instaService.invokeFunction(BulkFileOperations.create, edits);
		this._currentProvider = this._instaService.createInstance(BulkEditPreviewProvider, this._currentInput);

		if (edits.some(edit => !(edit instanceof ResourceTextEdit))) {
			return [];
		}
		const _edits = edits as ResourceTextEdit[];

		const diffResources = await this._resolveResources(_edits);
		const options: Mutable<IMultiDiffEditorOptions> = {
			viewState: {
				revealData: {
					resource: { original: _edits[0].resource },
					range: new Range(1, 1, 1, 1)
				}
			}
		};
		const refactorPreviewSource = BulkEditEditorService.URI;
		const label = 'Refactor Preview';

		const bulkEditEditor = await this._editorService.openEditor({
			refactorPreviewSource,
			diffResources,
			edits,
			label,
			options,
			description: label
		}, ACTIVE_GROUP) as BulkEditEditor;

		const inputEditsAfterResolving = await bulkEditEditor.inputEdits;
		if (bulkEditEditor.input) {
			await this._editorService.closeEditor({ editor: bulkEditEditor.input, groupId: this._groupService.activeGroup.id });
		}

		return inputEditsAfterResolving;

	}

	private async _resolveResources(edits: ResourceTextEdit[]): Promise<IResourceDiffEditorInput[]> {

		const _resources = [...new Set(edits.map(edit => edit.resource))];
		const resources: IResourceDiffEditorInput[] = [];
		for (const operationUri of _resources) {
			const previewUri = this._currentProvider!.asPreviewUri(operationUri);
			// delete -> show single editor
			// rename, create, edits -> show diff editr
			let leftResource: URI | undefined;
			try {
				(await this._textModelService.createModelReference(operationUri)).dispose();
				leftResource = operationUri;
			} catch {
				leftResource = BulkEditPreviewProvider.emptyPreview;
			}
			resources.push({
				original: { resource: URI.revive(leftResource) },
				modified: { resource: URI.revive(previewUri) }
			});
		}
		return resources;
	}
}
