/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileAccess } from 'vs/base/common/network';
import { EditorWorkerService } from 'vs/editor/browser/services/editorWorkerService';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelService } from 'vs/editor/common/services/model';
import { ITextResourceConfigurationService } from 'vs/editor/common/services/textResourceConfiguration';
import { ILogService } from 'vs/platform/log/common/log';

export class WorkbenchEditorWorkerService extends EditorWorkerService {
	constructor(
		@IModelService modelService: IModelService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@ILogService logService: ILogService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		super(FileAccess.asBrowserUri('vs/base/worker/workerMain.js'), modelService, configurationService, logService, languageConfigurationService, languageFeaturesService);
	}
}
