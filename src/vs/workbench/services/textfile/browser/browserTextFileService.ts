/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AbstractTextFileService } from './textFileService';
import { ITextFileService, TextFileEditorModelState } from '../common/textfiles';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService';
import { IModelService } from '../../../../editor/common/services/model';
import { ILanguageService } from '../../../../editor/common/languages/language';
import { ITextResourceConfigurationService } from '../../../../editor/common/services/textResourceConfiguration';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs';
import { IFileService } from '../../../../platform/files/common/files';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation';
import { ILogService } from '../../../../platform/log/common/log';
import { IElevatedFileService } from '../../files/common/elevatedFileService';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService';
import { ILifecycleService } from '../../lifecycle/common/lifecycle';
import { IPathService } from '../../path/common/pathService';
import { IUntitledTextEditorService } from '../../untitled/common/untitledTextEditorService';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity';
import { IWorkingCopyFileService } from '../../workingCopy/common/workingCopyFileService';
import { IDecorationsService } from '../../decorations/common/decorations';

export class BrowserTextFileService extends AbstractTextFileService {

	constructor(
		@IFileService fileService: IFileService,
		@IUntitledTextEditorService untitledTextEditorService: IUntitledTextEditorService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IDialogService dialogService: IDialogService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@ITextResourceConfigurationService textResourceConfigurationService: ITextResourceConfigurationService,
		@IFilesConfigurationService filesConfigurationService: IFilesConfigurationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IPathService pathService: IPathService,
		@IWorkingCopyFileService workingCopyFileService: IWorkingCopyFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILanguageService languageService: ILanguageService,
		@IElevatedFileService elevatedFileService: IElevatedFileService,
		@ILogService logService: ILogService,
		@IDecorationsService decorationsService: IDecorationsService
	) {
		super(fileService, untitledTextEditorService, lifecycleService, instantiationService, modelService, environmentService, dialogService, fileDialogService, textResourceConfigurationService, filesConfigurationService, codeEditorService, pathService, workingCopyFileService, uriIdentityService, languageService, logService, elevatedFileService, decorationsService);

		this.registerListeners();
	}

	private registerListeners(): void {

		// Lifecycle
		this._register(this.lifecycleService.onBeforeShutdown(event => event.veto(this.onBeforeShutdown(), 'veto.textFiles')));
	}

	private onBeforeShutdown(): boolean {
		if (this.files.models.some(model => model.hasState(TextFileEditorModelState.PENDING_SAVE))) {
			return true; // files are pending to be saved: veto (as there is no support for long running operations on shutdown)
		}

		return false;
	}
}

registerSingleton(ITextFileService, BrowserTextFileService, InstantiationType.Eager);
