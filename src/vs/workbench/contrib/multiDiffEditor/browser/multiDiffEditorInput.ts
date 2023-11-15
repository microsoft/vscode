/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { ConstLazyPromise, IDiffEntry, IMultiDocumentDiffEditorModel } from 'vs/editor/browser/widget/multiDiffEditorWidget/model';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { toDisposable } from 'vs/base/common/lifecycle';

export class MultiDiffEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.multiDiffEditor';

	get resource(): URI | undefined {
		return undefined;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	override get typeId(): string {
		return MultiDiffEditorInput.ID;
	}

	override getName(): string {
		return this.label ?? localize('name', "Multi Diff Editor");
	}

	override get editorId(): string {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	private _viewModel: IMultiDocumentDiffEditorModel | undefined;

	constructor(
		readonly label: string | undefined,
		readonly resources: readonly MultiDiffEditorInputData[],
		@ITextModelService private readonly _textModelService: ITextModelService,
	) {
		super();
	}

	async getViewModel(): Promise<IMultiDocumentDiffEditorModel> {
		if (!this._viewModel) {
			this._viewModel = await this._createViewModel();
		}
		return this._viewModel;
	}

	private async _createViewModel(): Promise<IMultiDocumentDiffEditorModel> {
		const rs = await Promise.all(this.resources.map(async r => ({
			originalRef: await this._textModelService.createModelReference(r.original!),
			modifiedRef: await this._textModelService.createModelReference(r.modified!),
			title: r.resource.fsPath,
		})));

		return {
			onDidChange: () => toDisposable(() => { }),
			diffs: rs.map(r => new ConstLazyPromise<IDiffEntry>({
				original: r.originalRef.object.textEditorModel,
				modified: r.modifiedRef.object.textEditorModel,
				title: r.title,
			})),
		};
	}
}

export class MultiDiffEditorInputData {
	constructor(
		readonly resource: URI,
		readonly original: URI | undefined,
		readonly modified: URI | undefined
	) { }
}
