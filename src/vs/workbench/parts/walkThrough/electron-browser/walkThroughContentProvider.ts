/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IModel } from 'vs/editor/common/editorCommon';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';

export const WALK_THROUGH_SCHEME = 'walkThrough';

export class WalkThroughContentProvider implements ITextModelContentProvider, IWorkbenchContribution {

	constructor(
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@ITextFileService private textFileService: ITextFileService,
		@IModeService private modeService: IModeService,
		@IModelService private modelService: IModelService,
	) {
		this.textModelResolverService.registerTextModelContentProvider(WALK_THROUGH_SCHEME, this);
	}

	public provideTextContent(resource: URI): TPromise<IModel> {
		return this.textFileService.resolveTextContent(URI.file(resource.fsPath)).then(content => {
			let codeEditorModel = this.modelService.getModel(resource);
			if (!codeEditorModel) {
				codeEditorModel = this.modelService.createModel(content.value, this.modeService.getOrCreateModeByFilenameOrFirstLine(resource.fsPath), resource);
			} else {
				codeEditorModel.setValueFromRawText(content.value);
			}

			return codeEditorModel;
		});
	}

	public getId(): string {
		return 'vs.walkThroughContentProvider';
	}
}