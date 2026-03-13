/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { ServicesAccessor, IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../../../nls.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { UnifiedQuickAccess, DEFAULT_UNIFIED_QUICK_ACCESS_TABS } from './unifiedQuickAccess.js';

// Singleton instance for the unified quick access
let unifiedQuickAccessInstance: UnifiedQuickAccess | undefined;

function getUnifiedQuickAccess(instantiationService: IInstantiationService): UnifiedQuickAccess {
	if (!unifiedQuickAccessInstance) {
		unifiedQuickAccessInstance = instantiationService.createInstance(UnifiedQuickAccess, DEFAULT_UNIFIED_QUICK_ACCESS_TABS);
	}
	return unifiedQuickAccessInstance;
}

/**
 * Action ID for showing the unified quick access widget.
 */
export const UNIFIED_QUICK_ACCESS_ACTION_ID = 'workbench.action.unifiedQuickAccess';

/**
 * Action to show the unified quick access widget with tabbed providers.
 */
export class ShowUnifiedQuickAccessAction extends Action2 {

	static readonly ID = UNIFIED_QUICK_ACCESS_ACTION_ID;

	constructor() {
		super({
			id: ShowUnifiedQuickAccessAction.ID,
			title: localize2('showAgentQuickAccess', "Show Agent Quick Access"),
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)
			),
		});
	}

	override run(accessor: ServicesAccessor, initialTabId?: string): void {
		const instantiationService = accessor.get(IInstantiationService);
		const unifiedQuickAccess = getUnifiedQuickAccess(instantiationService);
		unifiedQuickAccess.show(initialTabId);
	}
}

/**
 * Action to show the unified quick access widget starting on the Agent Sessions tab.
 */
export class ShowAgentSessionsQuickAccessAction extends Action2 {

	static readonly ID = 'workbench.action.showAgentSessionsQuickAccess';

	constructor() {
		super({
			id: ShowAgentSessionsQuickAccessAction.ID,
			title: localize2('showAgentSessionsQuickAccess', "Show Agent Sessions"),
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)
			),
		});
	}

	override run(accessor: ServicesAccessor): void {
		const instantiationService = accessor.get(IInstantiationService);
		const unifiedQuickAccess = getUnifiedQuickAccess(instantiationService);
		unifiedQuickAccess.show('agentSessions');
	}
}

/**
 * Action to show the unified quick access widget starting on the Commands tab.
 */
export class ShowCommandsQuickAccessAction extends Action2 {

	static readonly ID = 'workbench.action.showCommandsQuickAccess';

	constructor() {
		super({
			id: ShowCommandsQuickAccessAction.ID,
			title: localize2('showCommandsQuickAccess', "Show Commands (Unified)"),
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)
			),
		});
	}

	override run(accessor: ServicesAccessor): void {
		const instantiationService = accessor.get(IInstantiationService);
		const unifiedQuickAccess = getUnifiedQuickAccess(instantiationService);
		unifiedQuickAccess.show('commands');
	}
}

/**
 * Action to show the unified quick access widget starting on the Files tab.
 */
export class ShowFilesQuickAccessAction extends Action2 {

	static readonly ID = 'workbench.action.showFilesQuickAccess';

	constructor() {
		super({
			id: ShowFilesQuickAccessAction.ID,
			title: localize2('showFilesQuickAccess', "Show Files (Unified)"),
			f1: true,
			precondition: ContextKeyExpr.and(
				ChatContextKeys.enabled,
				ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)
			),
		});
	}

	override run(accessor: ServicesAccessor): void {
		const instantiationService = accessor.get(IInstantiationService);
		const unifiedQuickAccess = getUnifiedQuickAccess(instantiationService);
		unifiedQuickAccess.show('files');
	}
}

// Register actions
registerAction2(ShowUnifiedQuickAccessAction);
registerAction2(ShowAgentSessionsQuickAccessAction);
registerAction2(ShowCommandsQuickAccessAction);
registerAction2(ShowFilesQuickAccessAction);
