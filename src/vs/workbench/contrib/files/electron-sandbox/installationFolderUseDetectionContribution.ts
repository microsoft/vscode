/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ipcRenderer } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { INativeOpenFileRequest } from 'vs/platform/window/common/window';
import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { URI } from 'vs/base/common/uri';
import { INativeWorkbenchEnvironmentService } from 'vs/workbench/services/environment/electron-sandbox/environmentService';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IProductService } from 'vs/platform/product/common/productService';

export class InstallationFolderUseDetectionContribution extends Disposable implements IWorkbenchContribution {

	constructor(
		@INativeWorkbenchEnvironmentService private readonly nativeWorkbenchEnvironmentMainService: INativeWorkbenchEnvironmentService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProductService private readonly productService: IProductService

	) {
		super();

		// This happens when user opens file(s) from native file dialog
		ipcRenderer.on('vscode:openFiles', (_: unknown, request: INativeOpenFileRequest) => this._onOpenFileRequest(request));
	}

	private async _onOpenFileRequest(request: INativeOpenFileRequest): Promise<void> {
		const appRootUri = URI.file(this.nativeWorkbenchEnvironmentMainService.appRoot);
		const filesInInstallationFolder = request.filesToOpenOrCreate?.filter((file) => {
			return file.fileUri && this.uriIdentityService.extUri.isEqualOrParent(URI.from(file.fileUri), appRootUri);
		});
		if (filesInInstallationFolder && filesInInstallationFolder?.length > 0) {
			this.notificationService.prompt(
				Severity.Warning,
				nls.localize('warnOfFileInInstallationFolder', 'Storing your own files within the {0} installation folder {1} means they could be DELETED IRREVERSIBLY without warning during an update.', this.productService.nameShort, this.nativeWorkbenchEnvironmentMainService.appRoot),
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
	}
}
