/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { OpenNextEditorAction } from 'vs/workbench/browser/parts/editor2/nextEditorActions';

// Register Next Editor Actions
const category = localize('nextEditor', "Next Editor");
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(OpenNextEditorAction, OpenNextEditorAction.ID, OpenNextEditorAction.LABEL), 'View: Open Next Editor in Group', category);
