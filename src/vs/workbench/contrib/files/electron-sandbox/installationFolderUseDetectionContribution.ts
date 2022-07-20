/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { URI } from 'vs/base/common/uri';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IProductService } from 'vs/platform/product/common/productService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export class InstallationFolderUseDetectionContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@INativeWorkbenchEnvironmentService private readonly nativeWorkbenchEnvironmentMainService: INativeWorkbenchEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEditorService private readonly editorService: IEditorService,
		@IProductService private readonly productService: IProductService

	) {
		super();
		this._register(this.editorService.onDidActiveEditorChange(() => {
			const appRootUri = URI.file(this.nativeWorkbenchEnvironmentMainService.appRoot);
			const resourceUri = this.editorService.activeEditor?.resource;
			if (resourceUri && this.uriIdentityService.extUri.isEqualOrParent(resourceUri, appRootUri)) {
				this.notificationService.prompt(
					Severity.Warning,
					nls.localize('warnOfFileInInstallationFolder', 'Files within the {0} installation folder {1} will be OVERWRITTEN or DELETED IRREVERSIBLY without warning during a future update.', this.productService.nameShort, this.nativeWorkbenchEnvironmentMainService.appRoot),
					[{
						label: nls.localize('ok', 'OK'),
						run: async () => {
							// Nothing to do
						}
					}],
					{
						neverShowAgain: { id: 'warnOfFileInInstallationFolder', isSecondary: true },
						sticky: true,
					}
				);
			}
		}));
	}
}
