/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import platform = require('vs/platform/platform');
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import statusbar = require('vs/workbench/browser/parts/statusbar/statusbar');
import { ExtensionsStatusbarItem } from 'vs/workbench/parts/extensions/electron-browser/extensionsWidgets';
import { IGalleryService } from 'vs/workbench/parts/extensions/common/extensions';
import { GalleryService } from 'vs/workbench/parts/extensions/node/vsoGalleryService';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { ExtensionsWorkbenchExtension } from 'vs/workbench/parts/extensions/electron-browser/extensionsWorkbenchExtension';

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
