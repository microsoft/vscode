/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { SessionBrowserNetworkContribution } from './sessionBrowserNetwork.js';
import { SessionBrowserViewController } from './sessionBrowserView.js';

registerWorkbenchContribution2(SessionBrowserNetworkContribution.ID, SessionBrowserNetworkContribution, WorkbenchPhase.BlockRestore);
registerWorkbenchContribution2(SessionBrowserViewController.ID, SessionBrowserViewController, WorkbenchPhase.AfterRestored);
