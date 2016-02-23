/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import nls = require('vs/nls');
import platform = require('vs/platform/platform');
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import { ExtensionsStatusbarItem, ExtensionTipsStatusbarItem } from 'vs/workbench/parts/extensions/electron-browser/extensionsWidgets';
import { IGalleryService } from 'vs/workbench/parts/extensions/common/extensions';
import { GalleryService } from 'vs/workbench/parts/extensions/node/vsoGalleryService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ExtensionsWorkbenchExtension } from 'vs/workbench/parts/extensions/electron-browser/extensionsWorkbenchExtension';
import ConfigurationRegistry = require('vs/platform/configuration/common/configurationRegistry');

// Register Gallery Service
registerSingleton(IGalleryService, GalleryService);

// Register Extensions Workbench Extension
(<IWorkbenchContributionsRegistry>platform.Registry.as(WorkbenchExtensions.Workbench)).registerWorkbenchContribution(
	ExtensionsWorkbenchExtension
);

// Register Statusbar item
(<statusbar.IStatusbarRegistry>platform.Registry.as(statusbar.Extensions.Statusbar)).registerStatusbarItem(new statusbar.StatusbarItemDescriptor(
	ExtensionsStatusbarItem,
	statusbar.StatusbarAlignment.LEFT,
	10 /* Low Priority */
));

// Register Statusbar item
(<statusbar.IStatusbarRegistry>platform.Registry.as(statusbar.Extensions.Statusbar)).registerStatusbarItem(new statusbar.StatusbarItemDescriptor(
	ExtensionTipsStatusbarItem,
	statusbar.StatusbarAlignment.LEFT,
	9 /* Low Priority */
));


(<ConfigurationRegistry.IConfigurationRegistry>platform.Registry.as(ConfigurationRegistry.Extensions.Configuration)).registerConfiguration({
	id: 'extensions',
	type: 'object',
	properties: {
		'extensions.showTips': {
			type: 'boolean',
			default: true,
			description: nls.localize('extConfig', "Suggest extensions based on changed and open files."),
		}
	}
});
