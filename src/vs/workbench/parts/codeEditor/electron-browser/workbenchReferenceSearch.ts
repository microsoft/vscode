/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INextStorage2Service } from 'vs/platform/storage2/common/storage2';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { ReferencesController } from 'vs/editor/contrib/referenceSearch/referencesController';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';

export class WorkbenchReferencesController extends ReferencesController {

	public constructor(
		editor: ICodeEditor,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICodeEditorService editorService: ICodeEditorService,
		@INotificationService notificationService: INotificationService,
		@IInstantiationService instantiationService: IInstantiationService,
		@INextStorage2Service nextStorage2Service: INextStorage2Service,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(
			false,
			editor,
			contextKeyService,
			editorService,
			notificationService,
			instantiationService,
			nextStorage2Service,
			configurationService
		);
	}
}

registerEditorContribution(WorkbenchReferencesController);
