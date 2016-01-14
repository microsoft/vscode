/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import {IEditorService} from 'vs/platform/editor/common/editor';
import {IModelService} from 'vs/editor/common/services/modelService';
import {IFrameEditorInput} from 'vs/workbench/common/editor/iframeEditorInput';
import {IFrameEditorModel} from 'vs/workbench/common/editor/iframeEditorModel';

export class HtmlEditorInput extends IFrameEditorInput {

	private _editorService: IEditorService;
	private _modelService: IModelService;

	constructor(resource: URI, name: string, description: string,
		@IEditorService editorService: IEditorService,
		@IModelService modelService: IModelService
	) {
		super(resource, name, description);
		this._editorService = editorService;
		this._modelService = modelService;
	}

	public resolve(refresh?: boolean): TPromise<IFrameEditorModel> {
		return this._editorService.resolveEditorModel({ resource: this.getResource() }).then(model => {
			if (!this._modelService.getModel(this.getResource())) {
				throw new Error('Cannot load content for: ' + this.getResource());
			}
			return super.resolve(refresh);
		});
	}

	protected createModel(): IFrameEditorModel {
		// todo@joh check mode?
		// todo@joh listen to model changes!
		const model = this._modelService.getModel(this.getResource());
		const result = new IFrameEditorModel(this.getResource());

		result.setContents('', model.getValue(), ''); // change this
		return result;
	}

	public createNew(resource: URI): IFrameEditorInput {
		return;
	}
}
