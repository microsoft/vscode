/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { ICodeEditorService } from '../../../editor/browser/services/codeEditorService.js';
import { LineEditSource } from '../../../editor/common/lineEditSource.js';
import { ITextModel } from '../../../editor/common/model.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ExtHostContext, ExtHostLineEditTrackerShape, ILineEditSourcesChangeData, MainThreadLineEditTrackerShape, MainContext } from '../common/extHost.protocol.js';
import { IExtHostContext, extHostNamedCustomer } from '../../services/extensions/common/extHostCustomers.js';
import { IEditorService } from '../../services/editor/common/editorService.js';
import { ICodeEditor } from '../../../editor/browser/editorBrowser.js';

@extHostNamedCustomer(MainContext.MainThreadLineEditTracker)
export class MainThreadLineEditTracker extends Disposable implements MainThreadLineEditTrackerShape {

	private readonly _proxy: ExtHostLineEditTrackerShape;

	constructor(
		extHostContext: IExtHostContext,
		@IModelService private readonly _modelService: IModelService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IEditorService private readonly _editorService: IEditorService
	) {
		super();
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostLineEditTracker);

		this._register(this._modelService.onModelAdded(this._onModelAdded, this));
		this._register(this._editorService.onDidActiveEditorChange(this._onActiveEditorChange, this));

		// Handle existing models
		for (const model of this._modelService.getModels()) {
			this._onModelAdded(model);
		}
	}

	private _onModelAdded(model: ITextModel): void {
		// Use the public API to listen for line edit source changes
		this._register(model.onDidChangeLineEditSources(e => {
			this._notifyExtHostOfChanges(model, e.changes);
		}));
	}

	private _onActiveEditorChange(): void {
		// When the active editor changes, we could notify the extension host
		// but the extension host already tracks active editor changes
	}

	private _notifyExtHostOfChanges(model: ITextModel, changes: Map<number, LineEditSource>): void {
		const editor = this._findEditorForModel(model);
		if (editor) {
			const editorId = editor.getId();
			const changesObj: { [lineNumber: string]: number } = {};

			changes.forEach((source, lineNumber) => {
				changesObj[lineNumber.toString()] = source;
			});

			const data: ILineEditSourcesChangeData = {
				editorId,
				changes: changesObj
			};

			this._proxy.$onDidChangeLineEditSources(data);
		}
	}

	private _findEditorForModel(model: ITextModel): ICodeEditor | undefined {
		// Find the editor that contains this model
		const editors = this._codeEditorService.listCodeEditors();
		for (const editor of editors) {
			if (editor.getModel() === model) {
				return editor;
			}
		}
		return undefined;
	}

	async $getLineEditSource(uri: UriComponents, lineNumber: number): Promise<number> {
		const model = this._modelService.getModel(URI.revive(uri));
		if (!model) {
			return LineEditSource.Undetermined;
		}

		// Use the public API directly on the model
		return model.getLineEditSource(lineNumber);
	}

	async $getAllLineEditSources(uri: UriComponents): Promise<{ [lineNumber: string]: number }> {
		const model = this._modelService.getModel(URI.revive(uri));
		if (!model) {
			return {};
		}

		// Use the public API directly on the model
		const sources = model.getAllLineEditSources();
		const result: { [lineNumber: string]: number } = {};

		sources.forEach((source: LineEditSource, lineNumber: number) => {
			result[lineNumber.toString()] = source;
		});

		return result;
	}
}
