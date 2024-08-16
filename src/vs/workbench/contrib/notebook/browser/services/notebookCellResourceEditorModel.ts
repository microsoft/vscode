/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from 'vs/base/common/uri';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';
import { TextResourceEditorModel } from 'vs/workbench/common/editor/textResourceEditorModel';
import { INotebookEditorService } from 'vs/workbench/contrib/notebook/browser/services/notebookEditorService';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetectionWorkerService';

/**
 * An editor model for in-memory, readonly text content that
 * is backed by a Notebook Cell.
 */
export class NotebookCellResourceEditorModel extends TextResourceEditorModel {
	constructor(
		resource: URI,
		@ILanguageService languageService: ILanguageService,
		@IModelService modelService: IModelService,
		@ILanguageDetectionService languageDetectionService: ILanguageDetectionService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
		@INotebookEditorService private readonly notebookEditorService: INotebookEditorService,
	) {
		super(resource, languageService, modelService, languageDetectionService, accessibilityService);
	}

	override isReadonly(): boolean {
		const notebook = this.notebookEditorService.listNotebookEditors().find(nb => {
			return nb.getCellsInRange().some(c => c.uri === this.textEditorModelHandle);
		});
		if (notebook?.isReadOnly) {
			return true;
		}
		return false;
	}
}
