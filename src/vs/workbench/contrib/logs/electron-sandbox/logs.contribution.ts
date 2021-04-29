/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions as WorkbenchActionExtensions, CATEGORIES } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { OpenLogsFolderAction, OpenExtensionLogsFolderAction } from 'vs/workbench/contrib/logs/electron-sandbox/logsActions';

const workbenchActionsRegistry = Registry.as<IWorkbenchActionRegistry>(WorkbenchActionExtensions.WorkbenchActions);
workbenchActionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(OpenLogsFolderAction), 'Developer: Open Logs Folder', CATEGORIES.Developer.value);
workbenchActionsRegistry.registerWorkbenchAction(SyncActionDescriptor.from(OpenExtensionLogsFolderAction), 'Developer: Open Extension Logs Folder', CATEGORIES.Developer.value);
