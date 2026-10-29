/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMenuService } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { INativeEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IAuxiliaryWindowService } from '../../../services/auxiliaryWindow/browser/auxiliaryWindowService.js';
import { AUX_WINDOW_GROUP, IEditorService } from '../../../services/editor/common/editorService.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IssueFormService } from '../browser/issueFormService.js';
import { IssueReporterEditorInput } from '../browser/issueReporterEditorInput.js';
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
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IEditorService editorService: IEditorService) {
		super(instantiationService, auxiliaryWindowService, menuService, contextKeyService, logService, dialogService, hostService, editorService);
	}

	// override to grab platform info
	override async openReporter(data: IssueReporterData): Promise<void> {
		if (this.hasToReload(data)) {
			return;
		}

		// Get platform information
		const { arch, release, type } = await this.nativeHostService.getOSProperties();
		this.arch = arch;
		this.release = release;
		this.type = type;

		// Set the platform info in the data
		const enrichedData = { ...data, arch, release, type };

		// Create or get the issue reporter editor input
		const input = IssueReporterEditorInput.instance;
		input.setIssueReporterData(enrichedData);

		const pane = await this.editorService.openEditor({
			resource: IssueReporterEditorInput.RESOURCE,
			options: {
				pinned: true,
				revealIfOpened: true,
				auxiliary: {
					compact: true,
					alwaysOnTop: true
				}
			}
		}, AUX_WINDOW_GROUP);

		if (pane) {
			const listener = pane.input?.onWillDispose(() => {
				listener?.dispose();
			});
		}
	}
}
