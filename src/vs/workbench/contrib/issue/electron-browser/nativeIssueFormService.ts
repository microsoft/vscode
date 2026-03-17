/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService, IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILayoutService } from '../../../../platform/layout/browser/layoutService.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IssueFormService } from '../browser/issueFormService.js';
import { IRecordingService } from '../browser/recordingService.js';
import { IScreenshotService } from '../browser/screenshotService.js';
import { IIssueFormService, IssueReporterData } from '../common/issue.js';

export class NativeIssueFormService extends IssueFormService implements IIssueFormService {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IAuxiliaryWindowService auxiliaryWindowService: IAuxiliaryWindowService,
		@ILogService logService: ILogService,
		@IDialogService dialogService: IDialogService,
		@IMenuService menuService: IMenuService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IHostService hostService: IHostService,
		@ILayoutService layoutService: ILayoutService,
		@IScreenshotService screenshotService: IScreenshotService,
		@IOpenerService openerService: IOpenerService,
		@IRecordingService recordingService: IRecordingService,
		@IFileDialogService fileDialogService: IFileDialogService,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@INativeHostService private readonly nativeHostService: INativeHostService,
	) {
		super(instantiationService, auxiliaryWindowService, menuService, contextKeyService, logService, dialogService, hostService, layoutService, screenshotService, openerService, recordingService, fileDialogService, fileService, environmentService);
	}

	// override to grab platform info
	override async openReporter(data: IssueReporterData): Promise<void> {
		if (this.hasToReload(data)) {
			return;
		}

		// Get platform information for the issue body
		const { arch, release, type } = await this.nativeHostService.getOSProperties();
		this.arch = arch;
		this.release = release;
		this.type = type;

		// Use the new overlay-based reporter
		this.openOverlayReporter(data);
	}
}
