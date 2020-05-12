/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IViewDescriptorService } from 'vs/workbench/common/views';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { SHOW_SYNC_LOG_COMMAND_ID, MANAGE_SYNC_COMMAND_ID } from 'vs/platform/userDataSync/common/userDataSync';
import { Codicon } from 'vs/base/common/codicons';
import { localize } from 'vs/nls';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IAction, Action } from 'vs/base/common/actions';
import { ICommandService } from 'vs/platform/commands/common/commands';

export class UserDataSyncViewPaneContainer extends ViewPaneContainer {

	constructor(
		containerId: string,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ICommandService private readonly commandService: ICommandService,
	) {
		super(containerId, { mergeViewWithContainerWhenSingleView: false }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService);
	}

	getActions(): IAction[] {
		return [
			new Action('showSyncLog', localize('showLog', "Show Log"), Codicon.output.classNames, true, () => this.commandService.executeCommand(SHOW_SYNC_LOG_COMMAND_ID)),
			new Action('manageSync', localize('configure sync', "Configure..."), Codicon.settingsGear.classNames, true, () => this.commandService.executeCommand(MANAGE_SYNC_COMMAND_ID))
		];
	}

}
