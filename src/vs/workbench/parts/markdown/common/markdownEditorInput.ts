/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');
import URI from 'vs/base/common/uri';
import paths = require('vs/base/common/paths');
import labels = require('vs/base/common/labels');
import {DerivedFrameEditorInput} from 'vs/workbench/parts/files/common/editors/derivedFrameEditorInput';
import {MarkdownEditorModel} from 'vs/workbench/parts/markdown/common/markdownEditorModel';
import {EditorModel} from 'vs/workbench/common/editor';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

/**
 * An editor input derived from DerivedFrameEditorInput to show a rendered version of a markdown file.
 */
export class MarkdownEditorInput extends DerivedFrameEditorInput {

	public static ID: string = 'vs.markdown';

	constructor(
		resource: URI,
		label: string,
		description: string,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		super(resource, label || nls.localize('preview', "Preview '{0}'", paths.basename(resource.fsPath)), description || labels.getPathLabel(paths.dirname(resource.fsPath), contextService));
	}

	public createNew(resource: URI): MarkdownEditorInput {
		return this.instantiationService.createInstance(MarkdownEditorInput, resource, void 0, void 0);
	}

	public getId(): string {
		return MarkdownEditorInput.ID;
	}

	protected createModel(): EditorModel {
		return this.instantiationService.createInstance(MarkdownEditorModel, this.getResource());
	}

	public matches(otherInput: any): boolean {
		if (!(otherInput instanceof MarkdownEditorInput)) {
			return false;
		}

		return super.matches(otherInput);
	}
}