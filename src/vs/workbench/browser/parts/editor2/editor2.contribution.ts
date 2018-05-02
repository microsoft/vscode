/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/workbench/browser/parts/editor/editor.contribution'; // TODO@grid merge editor.contribution into this
import { localize } from 'vs/nls';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchActionRegistry, Extensions as ActionExtensions } from 'vs/workbench/common/actions';
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import { GridOpenEditorsAction, GridCloseActiveEditorAction, GridRemoveActiveGroupAction, NextEditorContribution } from 'vs/workbench/browser/parts/editor2/nextEditorActions';
import { IWorkbenchContributionsRegistry, Extensions as WorkbenchExtensions } from 'vs/workbench/common/contributions';
import { LifecyclePhase } from 'vs/platform/lifecycle/common/lifecycle';

// Register Next Editor Actions
const category = localize('grid', "Grid");
const registry = Registry.as<IWorkbenchActionRegistry>(ActionExtensions.WorkbenchActions);
registry.registerWorkbenchAction(new SyncActionDescriptor(GridOpenEditorsAction, GridOpenEditorsAction.ID, GridOpenEditorsAction.LABEL), 'Grid: Open Some Editors', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GridCloseActiveEditorAction, GridCloseActiveEditorAction.ID, GridCloseActiveEditorAction.LABEL), 'Grid: Close Active Editor', category);
registry.registerWorkbenchAction(new SyncActionDescriptor(GridRemoveActiveGroupAction, GridRemoveActiveGroupAction.ID, GridRemoveActiveGroupAction.LABEL), 'Grid: Remove Active Group', category);

// Register Workbench Contribution
Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NextEditorContribution, LifecyclePhase.Running);