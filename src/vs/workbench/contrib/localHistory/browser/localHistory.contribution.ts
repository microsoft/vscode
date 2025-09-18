/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './localHistoryCommands.js';
import { WorkbenchPhase, registerWorkbenchContribution2 } from '../../../common/contributions.js';
import { LocalHistoryTimeline } from './localHistoryTimeline.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IQuickAccessRegistry, Extensions } from '../../../../platform/quickinput/common/quickAccess.js';
import { LocalHistoryQuickAccessProvider } from './localHistoryQuickAccess.js';
import { localize } from '../../../../nls.js';

// Register Local History Timeline
registerWorkbenchContribution2(LocalHistoryTimeline.ID, LocalHistoryTimeline, WorkbenchPhase.BlockRestore /* registrations only */);

// Register Local History Quick Access Provider
const quickAccessRegistry = Registry.as<IQuickAccessRegistry>(Extensions.Quickaccess);
quickAccessRegistry.registerQuickAccessProvider({
	ctor: LocalHistoryQuickAccessProvider,
	prefix: LocalHistoryQuickAccessProvider.PREFIX,
	placeholder: localize('localHistoryQuickAccessPlaceholder', "Type the name of a file to view its local history entries."),
	helpEntries: [{ description: localize('localHistoryQuickAccess', "Show Local History"), commandId: 'workbench.action.quickOpen', commandCenterOrder: 40, prefix: LocalHistoryQuickAccessProvider.PREFIX }]
});
