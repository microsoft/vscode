/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!../browser/media/mock.contribution';
import nls = require('vs/nls');
import platform = require('vs/platform/platform');
import { SyncActionDescriptor } from 'vs/platform/actions/common/actions';
import panel = require('vs/workbench/browser/panel');
import wbaregistry = require('vs/workbench/common/actionRegistry');
import { InformationView } from 'vs/workbench/parts/mock/browser/mockViews';
import { ShowInformationAction } from 'vs/workbench/parts/mock/electron-browser/mockActions';
import { InformationPanel } from 'vs/workbench/parts/mock/browser/mockPanels';
import * as debug from 'vs/workbench/parts/debug/common/debug';

// Register mock debug views.
// Use order 25 to put the information view between the watch and call stack view (which have orders 20 and 30 respectively).
debug.DebugViewRegistry.registerDebugView(InformationView, 25);

// Register mock debug panel.
(<panel.PanelRegistry>platform.Registry.as(panel.Extensions.Panels)).registerPanel(new panel.PanelDescriptor(
	'vs/workbench/parts/mock/browser/mockPanels',
	'InformationPanel',
	InformationPanel.ID,
	nls.localize('informationPanel', "Information"),
	'information'
));

// Register actions
const registry = (<wbaregistry.IWorkbenchActionRegistry> platform.Registry.as(wbaregistry.Extensions.WorkbenchActions));
const mockCategory = nls.localize('mockCategory', "Mock");
registry.registerWorkbenchAction(new SyncActionDescriptor(ShowInformationAction, ShowInformationAction.ID, ShowInformationAction.LABEL), mockCategory);
