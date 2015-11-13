/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import {EditorModel} from 'vs/workbench/common/editor';
import {DerivedFrameEditorInput} from 'vs/workbench/parts/files/browser/editors/derivedFrameEditorInput';
import IFrameEditorModel = require('vs/workbench/browser/parts/editor/iframeEditorModel');
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

/**
 * An editor input derived from DerivedFrameEditorInput to show a rendered version of a HTML file.
 */
export class HTMLFrameEditorInput extends DerivedFrameEditorInput {

	public static ID: string = 'vs.html';

	constructor(
		resource: URI,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(resource, nls.localize('preview', "Preview '{0}'", paths.basename(resource.fsPath)));
	}

	public createNew(resource: URI): HTMLFrameEditorInput {
		return this.instantiationService.createInstance(HTMLFrameEditorInput, resource);
	}

	public getId(): string {
		return HTMLFrameEditorInput.ID;
	}

	protected createModel(): EditorModel {
		let model = new IFrameEditorModel.IFrameEditorModel(this.getResource());
		model.setUrl(this.getResource().toString());

		return model;
	}

	public matches(otherInput: any): boolean {
		if (!(otherInput instanceof HTMLFrameEditorInput)) {
			return false;
		}

		return super.matches(otherInput);
	}
}