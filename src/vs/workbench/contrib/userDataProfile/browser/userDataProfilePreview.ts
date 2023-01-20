/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IUserDataProfileImportExportService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class UserDataProfilePreviewContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IUserDataProfileImportExportService userDataProfileImportExportService: IUserDataProfileImportExportService
	) {
		super();
		if (environmentService.options?.profileToPreview) {
			userDataProfileImportExportService.importProfile(URI.revive(environmentService.options.profileToPreview), { donotPrompt: true, previewAsTempProfile: true });
		}
	}

}
