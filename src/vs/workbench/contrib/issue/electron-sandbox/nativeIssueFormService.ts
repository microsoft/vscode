/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/newIssueReporter';
import { IMenuService } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { INativeHostService } from 'vs/platform/native/common/native';
import product from 'vs/platform/product/common/product';
import { BrowserWindow } from 'vs/workbench/browser/window';
import { IssueFormService } from 'vs/workbench/contrib/issue/browser/issueFormService';
import { IIssueFormService, IssueReporterData } from 'vs/workbench/contrib/issue/common/issue';
import { IssueReporter2 } from 'vs/workbench/contrib/issue/electron-sandbox/issueReporterService2';
import { IAuxiliaryWindowService } from 'vs/workbench/services/auxiliaryWindow/browser/auxiliaryWindowService';
import { IHostService } from 'vs/workbench/services/host/browser/host';

export class NativeIssueFormService extends IssueFormService implements IIssueFormService {
	private issueReporterParentWindow: BrowserWindow | null = null;

	constructor(
		@IInstantiationService protected override readonly instantiationService: IInstantiationService,
		@IAuxiliaryWindowService protected override readonly auxiliaryWindowService: IAuxiliaryWindowService,
		@INativeEnvironmentService protected readonly environmentService: INativeEnvironmentService,
		@ILogService protected override readonly logService: ILogService,
		@IDialogService protected override readonly dialogService: IDialogService,
		@IMenuService protected override readonly menuService: IMenuService,
		@IContextKeyService protected override readonly contextKeyService: IContextKeyService,
		@IHostService protected override readonly hostService: IHostService,
		@INativeHostService private readonly nativeHostService: INativeHostService) {
		super(instantiationService, auxiliaryWindowService, menuService, contextKeyService, logService, dialogService, hostService);
	}

	// override to grab platform info
	override async openReporter(data: IssueReporterData): Promise<void> {
		if (data.extensionId && this.extensionIdentifierSet.has(data.extensionId)) {
			this.currentData = data;
			this.issueReporterWindow?.focus();
			return;
		}

		if (this.issueReporterWindow) {
			this.issueReporterWindow.focus();
			return;
		}

		await super.openAuxIssueReporter(data);

		// Get platform information
		await this.nativeHostService.getOSProperties().then(os => {
			this.arch = os.arch;
			this.release = os.release;
			this.type = os.type;
		});

		// create issue reporter and instantiate
		if (this.issueReporterWindow) {
			const issueReporter = this.instantiationService.createInstance(IssueReporter2, !!this.environmentService.disableExtensions, data, { type: this.type, arch: this.arch, release: this.release }, product, this.issueReporterWindow);
			issueReporter.render();
		}
	}

	//#endregion

	//#region used by issue reporter window
	override async reloadWithExtensionsDisabled(): Promise<void> {
		if (this.issueReporterParentWindow) {
			try {
				await this.nativeHostService.reload({ disableExtensions: true });
			} catch (error) {
				this.logService.error(error);
			}
		}
	}
}
