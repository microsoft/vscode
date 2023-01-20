/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IProductService } from 'vs/platform/product/common/productService';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IUserDataProfileImportExportService, toUserDataProfileUri } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class UserDataProfilePreviewContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
		@IProductService productService: IProductService,
		@IUserDataProfileImportExportService userDataProfileImportExportService: IUserDataProfileImportExportService
	) {
		super();
		if (environmentService.options?.profile) {
			userDataProfileImportExportService.importProfile(toUserDataProfileUri(environmentService.options?.profile, productService), { donotPrompt: true, previewAsTempProfile: true });
		}
	}

}
