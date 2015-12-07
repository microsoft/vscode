/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import actions = require('vs/base/common/actions');
import toolbar = require('vs/base/browser/ui/toolbar/toolbar');
import actionbar = require('vs/base/browser/ui/actionbar/actionbar');
import platform = require('vs/platform/platform');
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IPluginService } from 'vs/platform/plugins/common/plugins';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import actionbarregistry = require('vs/workbench/browser/actionBarRegistry');
import { IGalleryService } from 'vs/workbench/parts/extensions/common/extensions';
import { GlobalExtensionsAction, GlobalExtensionsActionItem } from './extensionsActions';
import { GalleryService } from 'vs/workbench/parts/extensions/node/vsoGalleryService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ExtensionsWorkbenchExtension } from 'vs/workbench/parts/extensions/electron-browser/extensionsWorkbenchExtension';

// Register Gallery Service
registerSingleton(IGalleryService, GalleryService);

// Register Extensions Workbench Extension
(<IWorkbenchContributionsRegistry>platform.Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(
	ExtensionsWorkbenchExtension
);

class GlobalExtensionsActionContributor extends actionbarregistry.ActionBarContributor {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IPluginService private pluginService: IPluginService
	) {
		super();
	}

	public hasActions(context:any): boolean {
		return context === toolbar.CONTEXT;
	}

	public getActions(context:any): actions.IAction[] {
		return [
			this.instantiationService.createInstance(GlobalExtensionsAction, GlobalExtensionsAction.ID, GlobalExtensionsAction.LABEL)
		];
	}

	public getActionItem(context: any, action: actions.Action): actionbar.BaseActionItem {
		if (action.id === GlobalExtensionsAction.ID) {
			return new GlobalExtensionsActionItem(this.pluginService, action);
		}

		return null;
	}
}

// Register Global Extensions Action
let actionBarRegistry = <actionbarregistry.IActionBarRegistry> platform.Registry.as(actionbarregistry.Extensions.Actionbar);
actionBarRegistry.registerActionBarContributor(actionbarregistry.Scope.GLOBAL, GlobalExtensionsActionContributor);
