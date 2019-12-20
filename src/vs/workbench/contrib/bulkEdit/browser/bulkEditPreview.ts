/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextModelContentProvider, ITextModelService } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { createTextBufferFactoryFromSnapshot } from 'vs/editor/common/model/textModel';
import { WorkspaceEdit, isResourceTextEdit, TextEdit } from 'vs/editor/common/modes';
import { IDisposable } from 'vs/base/common/lifecycle';
import { flatten, mergeSort } from 'vs/base/common/arrays';
import { Range } from 'vs/editor/common/core/range';
import { EditOperation } from 'vs/editor/common/core/editOperation';

export class BulkEditPreviewProvider implements ITextModelContentProvider {

	static readonly Schema = 'vscode-bulkeditpreview';

	static asPreviewUri(uri: URI): URI {
		return URI.from({ scheme: BulkEditPreviewProvider.Schema, path: uri.toString() });
	}

	static fromPreviewUri(uri: URI): URI {
		return URI.parse(uri.path);
	}

	private readonly _reg: IDisposable;

	constructor(
		private readonly _edit: WorkspaceEdit,
		@IModeService private readonly _modeService: IModeService,
		@IModelService private readonly _modelService: IModelService,
		@ITextModelService private readonly textModelResolverService: ITextModelService
	) {
		this._reg = this.textModelResolverService.registerTextModelContentProvider(BulkEditPreviewProvider.Schema, this);
	}

	dispose(): void {
		this._reg.dispose();
	}

	async provideTextContent(previewUri: URI) {

		const resourceUri = BulkEditPreviewProvider.fromPreviewUri(previewUri);

		const ref = await this.textModelResolverService.createModelReference(resourceUri);

		const sourceModel = ref.object.textEditorModel;

		const previewModel = this._modelService.createModel(
			createTextBufferFactoryFromSnapshot(sourceModel.createSnapshot()),
			this._modeService.create(sourceModel.getLanguageIdentifier().language),
			previewUri
		);

		const textEdits: TextEdit[][] = [];
		for (let edit of this._edit.edits) {
			if (isResourceTextEdit(edit) && edit.resource.toString() === resourceUri.toString()) {
				textEdits.push(edit.edits);
			}
		}

		let allEdits = flatten(textEdits).map(edit => EditOperation.replaceMove(Range.lift(edit.range), edit.text));
		allEdits = mergeSort(allEdits, (a, b) => Range.compareRangesUsingStarts(a.range, b.range));
		previewModel.applyEdits(allEdits);
		ref.dispose();
		return previewModel;
	}
}
