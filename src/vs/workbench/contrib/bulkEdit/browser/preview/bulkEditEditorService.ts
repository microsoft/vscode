/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Mutable } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IBulkEditEditorService, ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IMultiDiffEditorOptions } from 'vs/editor/browser/widget/multiDiffEditorWidget/multiDiffEditorWidgetImpl';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IResourceDiffEditorInput } from 'vs/workbench/common/editor';
import { BulkEditEditor } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditEditor';
import { BulkEditPreviewProvider, BulkFileOperations } from 'vs/workbench/contrib/bulkEdit/browser/preview/bulkEditPreview';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { ACTIVE_GROUP, IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { Range } from 'vs/editor/common/core/range';

export class BulkEditEditorService implements IBulkEditEditorService {

	declare readonly _serviceBrand: undefined;

	static readonly ID = 'refactorPreview';

	private _bulkEditEditor: BulkEditEditor | undefined;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@IEditorService private readonly _editorService: IEditorService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorGroupsService private readonly _groupService: IEditorGroupsService,
		@IStorageService _storageService: IStorageService,
	) { }

	hasInput(): boolean {
		return this._bulkEditEditor?.hasFocus() ?? false;
	}

	public async openBulkEditEditor(_edits: ResourceEdit[]): Promise<ResourceEdit[] | undefined> {
		if (_edits.some(edit => !ResourceTextEdit.is(edit))) {
			return [];
		}
		const edits = _edits as ResourceTextEdit[];
		const input = await this._instaService.invokeFunction(BulkFileOperations.create, edits);
		const provider = this._instaService.createInstance(BulkEditPreviewProvider, input);
		const diffResources = await this._resolveResources(provider, edits);
		const options: Mutable<IMultiDiffEditorOptions> = {
			viewState: {
				revealData: {
					resource: { original: edits[0].resource },
					range: new Range(1, 1, 1, 1)
				}
			}
		};
		const label = 'Refactor Preview';
		const refactorPreviewSource = URI.from({ scheme: 'refactor-preview-editor' });

		// TODO: Differentiate between ACTIVE_GROUP and SIDE_GROUP
		this._bulkEditEditor = await this._editorService.openEditor({
			refactorPreviewSource,
			diffResources,
			edits,
			label,
			options,
			description: label
		}, ACTIVE_GROUP) as BulkEditEditor;

		const resolvedEdits = await this._bulkEditEditor.promiseResolvedEdits;
		await this._closeBulkEditEditor();
		return resolvedEdits;
	}

	public async _closeBulkEditEditor(): Promise<void> {
		if (this._bulkEditEditor?.input) {
			await this._editorService.closeEditor({ editor: this._bulkEditEditor.input, groupId: this._groupService.activeGroup.id });
		}
	}

	private async _resolveResources(provider: BulkEditPreviewProvider, edits: ResourceTextEdit[]): Promise<IResourceDiffEditorInput[]> {
		const resources: IResourceDiffEditorInput[] = [];
		const uris = [...new Set(edits.map(edit => edit.resource))];
		for (const uri of uris) {
			const previewUri = provider.asPreviewUri(uri);
			// delete -> show single editor
			// rename, create, edits -> show diff editr
			let leftResource: URI | undefined;
			try {
				(await this._textModelService.createModelReference(uri)).dispose();
				leftResource = uri;
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

	public accept() {
		this._bulkEditEditor?.accept();
	}

	public discard() {
		this._bulkEditEditor?.discard();
	}

	public toggleChecked() {
		this._bulkEditEditor?.toggleChecked();
	}

	public groupByFile() {
		this._bulkEditEditor?.groupByFile();
	}

	public groupByType() {
		this._bulkEditEditor?.groupByType();
	}

	public toggleGrouping() {
		this._bulkEditEditor?.toggleGrouping();
	}
}
