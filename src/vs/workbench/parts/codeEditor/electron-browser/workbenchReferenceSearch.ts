/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IInstantiationService, optional } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ReferencesController } from 'vs/editor/contrib/referenceSearch/referencesController';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';

export class WorkbenchReferencesController extends ReferencesController {

	public constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@ITextModelService textModelResolverService: ITextModelService,
		@INotificationService notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IStorageService storageService: IStorageService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@optional(IEnvironmentService) environmentService: IEnvironmentService
	) {
		super(
			false,
			editor,
			contextKeyService,
			codeEditorService,
			textModelResolverService,
			notificationService,
			instantiationService,
			contextService,
			storageService,
			themeService,
			configurationService,
			environmentService
		);
	}
}

registerEditorContribution(WorkbenchReferencesController);
