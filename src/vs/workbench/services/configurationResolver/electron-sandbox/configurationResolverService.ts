/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { INativeWorkbenchEnvironmentService } from '../../environment/electron-sandbox/environmentService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IConfigurationResolverService } from '../common/configurationResolver.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { BaseConfigurationResolverService } from '../browser/baseConfigurationResolverService.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IShellEnvironmentService } from '../../environment/electron-sandbox/shellEnvironmentService.js';
import { IPathService } from '../../path/common/pathService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';

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
