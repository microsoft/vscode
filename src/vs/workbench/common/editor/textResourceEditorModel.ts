/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseTextEditorModel } from './textEditorModel.js';
import { URI } from '../../../base/common/uri.js';
import { ILanguageService } from '../../../editor/common/languages/language.js';
import { IModelService } from '../../../editor/common/services/model.js';
import { ILanguageDetectionService } from '../../services/languageDetection/common/languageDetectionWorkerService.js';
import { IAccessibilityService } from '../../../platform/accessibility/common/accessibility.js';

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
