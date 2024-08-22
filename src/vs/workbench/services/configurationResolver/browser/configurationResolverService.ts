/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICommandService } from '../../../../platform/commands/common/commands';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions';
import { ILabelService } from '../../../../platform/label/common/label';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput';
import { IStorageService } from '../../../../platform/storage/common/storage';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';
import { BaseConfigurationResolverService } from './baseConfigurationResolverService';
import { IConfigurationResolverService } from '../common/configurationResolver';
import { IEditorService } from '../../editor/common/editorService';
import { IExtensionService } from '../../extensions/common/extensions';
import { IPathService } from '../../path/common/pathService';

export class ConfigurationResolverService extends BaseConfigurationResolverService {

	constructor(
		@IEditorService editorService: IEditorService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICommandService commandService: ICommandService,
		@IWorkspaceContextService workspaceContextService: IWorkspaceContextService,
		@IQuickInputService quickInputService: IQuickInputService,
		@ILabelService labelService: ILabelService,
		@IPathService pathService: IPathService,
		@IExtensionService extensionService: IExtensionService,
		@IStorageService storageService: IStorageService,
	) {
		super({ getAppRoot: () => undefined, getExecPath: () => undefined },
			Promise.resolve(Object.create(null)), editorService, configurationService,
			commandService, workspaceContextService, quickInputService, labelService, pathService, extensionService, storageService);
	}
}

registerSingleton(IConfigurationResolverService, ConfigurationResolverService, InstantiationType.Delayed);
