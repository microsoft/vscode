/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeWorkbenchEnvironmentService } from '../../environment/electron-sandbox/environmentService';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { ICommandService } from '../../../../platform/commands/common/commands';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';
import { IEditorService } from '../../editor/common/editorService';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput';
import { IConfigurationResolverService } from '../common/configurationResolver';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { BaseConfigurationResolverService } from '../browser/baseConfigurationResolverService';
import { ILabelService } from '../../../../platform/label/common/label';
import { IShellEnvironmentService } from '../../environment/electron-sandbox/shellEnvironmentService';
import { IPathService } from '../../path/common/pathService';
import { IExtensionService } from '../../extensions/common/extensions';
import { IStorageService } from '../../../../platform/storage/common/storage';

export class ConfigurationResolverService extends BaseConfigurationResolverService {

	constructor(
		@IEditorService editorService: IEditorService,
		@INativeWorkbenchEnvironmentService environmentService: INativeWorkbenchEnvironmentService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService commandService: ICommandService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IQuickInputService quickInputService: IQuickInputService,
		@ILabelService labelService: ILabelService,
		@IShellEnvironmentService shellEnvironmentService: IShellEnvironmentService,
		@IPathService pathService: IPathService,
		@IExtensionService extensionService: IExtensionService,
		@IStorageService storageService: IStorageService,
	) {
		super({
			getAppRoot: (): string | undefined => {
				return environmentService.appRoot;
			},
			getExecPath: (): string | undefined => {
				return environmentService.execPath;
			},
		}, shellEnvironmentService.getShellEnv(), editorService, configurationService, commandService,
			workspaceContextService, quickInputService, labelService, pathService, extensionService, storageService);
	}
}

registerSingleton(IConfigurationResolverService, ConfigurationResolverService, InstantiationType.Delayed);
