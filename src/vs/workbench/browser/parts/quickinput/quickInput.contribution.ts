/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Registry } from 'vs/platform/registry/common/platform';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { QuickPickManyToggleAction } from 'vs/workbench/browser/parts/quickinput/quickInput';
import { inQuickOpenContext } from 'vs/workbench/browser/parts/quickopen/quickopen';

const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);

registry.registerWorkbenchAction(new SyncActionDescriptor(QuickPickManyToggleAction, QuickPickManyToggleAction.ID, QuickPickManyToggleAction.LABEL, null, inQuickOpenContext), 'Toggle Selection in Quick Pick');
