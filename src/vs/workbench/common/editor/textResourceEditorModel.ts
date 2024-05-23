/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseTextEditorModel } from 'vs/workbench/common/editor/textEditorModel';
import { URI } from 'vs/base/common/uri';
import { ILanguageService } from 'vs/editor/common/languages/language';
import { IModelService } from 'vs/editor/common/services/model';
import { ILanguageDetectionService } from 'vs/workbench/services/languageDetection/common/languageDetectionWorkerService';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';

/**
 * An editor model for in-memory, readonly text content that
 * is backed by an existing editor model.
 */
export class TextResourceEditorModel extends BaseTextEditorModel {

	constructor(
		resource: URI,
		@ILanguageService languageService: ILanguageService,
		@IModelService modelService: IModelService,
		@ILanguageDetectionService languageDetectionService: ILanguageDetectionService,
		@IAccessibilityService accessibilityService: IAccessibilityService,
	) {
		super(modelService, languageService, languageDetectionService, accessibilityService, resource);
	}

	override dispose(): void {

		// force this class to dispose the underlying model
		if (this.textEditorModelHandle) {
			this.modelService.destroyModel(this.textEditorModelHandle);
		}

		super.dispose();
	}
}
