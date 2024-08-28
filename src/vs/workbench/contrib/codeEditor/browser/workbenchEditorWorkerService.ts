/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkerDescriptor } from 'vs/base/browser/defaultWorkerFactory';
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
		const workerDescriptor = new WorkerDescriptor('vs/editor/common/services/editorSimpleWorker', 'TextEditorWorker');
		super(workerDescriptor, modelService, configurationService, logService, languageConfigurationService, languageFeaturesService);
	}
}
