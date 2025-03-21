/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WebWorkerDescriptor } from '../../../../base/browser/webWorkerFactory.js';
import { FileAccess } from '../../../../base/common/network.js';
import { EditorWorkerService } from '../../../../editor/browser/services/editorWorkerService.js';
import { ILanguageConfigurationService } from '../../../../editor/common/languages/languageConfigurationRegistry.js';
import { ILanguageFeaturesService } from '../../../../editor/common/services/languageFeatures.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class WorkbenchEditorWorkerService extends EditorWorkerService {
	constructor(
		@IModelService modelService: IModelService,
		@ITextResourceConfigurationService configurationService: ITextResourceConfigurationService,
		@ILogService logService: ILogService,
		@ILanguageConfigurationService languageConfigurationService: ILanguageConfigurationService,
		@ILanguageFeaturesService languageFeaturesService: ILanguageFeaturesService,
	) {
		const workerDescriptor = new WebWorkerDescriptor(FileAccess.asBrowserUri('vs/editor/common/services/editorWebWorkerMain.js'), 'TextEditorWorker');
		super(workerDescriptor, modelService, configurationService, logService, languageConfigurationService, languageFeaturesService);
	}
}
