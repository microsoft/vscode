/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { ISelectionHistoryService, SelectionHistoryService } from './selectionHistoryService.js';
import { registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { GoToPreviousSelectionAction, GoToNextSelectionAction, ClearSelectionHistoryAction, ShowSelectionHistoryAction } from './selectionHistoryActions.js';
import { Extensions as QuickAccessExtensions, IQuickAccessRegistry } from '../../../../../platform/quickinput/common/quickAccess.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { SelectionHistoryQuickAccessProvider } from './selectionHistoryQuickAccess.js';
import { localize } from '../../../../../nls.js';

// Export service interface for use in future phases
export { ISelectionHistoryService, SelectionHistoryEntry } from './selectionHistoryService.js';

// Register service
registerSingleton(ISelectionHistoryService, SelectionHistoryService, InstantiationType.Delayed);

// Register actions (Phase 2)
registerAction2(GoToPreviousSelectionAction);
registerAction2(GoToNextSelectionAction);
registerAction2(ClearSelectionHistoryAction);
registerAction2(ShowSelectionHistoryAction);

// Register Quick Access provider (Phase 3)
const quickAccessRegistry = Registry.as<IQuickAccessRegistry>(QuickAccessExtensions.Quickaccess);
quickAccessRegistry.registerQuickAccessProvider({
	ctor: SelectionHistoryQuickAccessProvider,
	prefix: '@',
	placeholder: localize('selectionHistory.quickAccess.placeholder', 'Type to filter selection history'),
	helpEntries: [{
		description: localize('selectionHistory.quickAccess.description', 'Browse and navigate selection history'),
		commandId: ShowSelectionHistoryAction.ID
	}]
});
