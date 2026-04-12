/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Action2, registerAction2 } from '../../../../../../platform/actions/common/actions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { localize2 } from '../../../../../../nls.js';
import { ChatContextKeys } from '../../../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { UnifiedQuickAccess, DEFAULT_UNIFIED_QUICK_ACCESS_TABS } from './unifiedQuickAccess.js';
// Singleton instance for the unified quick access
let unifiedQuickAccessInstance;
function getUnifiedQuickAccess(instantiationService) {
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
    static { this.ID = UNIFIED_QUICK_ACCESS_ACTION_ID; }
    constructor() {
        super({
            id: ShowUnifiedQuickAccessAction.ID,
            title: localize2('showAgentQuickAccess', "Show Agent Quick Access"),
            f1: true,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)),
        });
    }
    run(accessor, initialTabId) {
        const instantiationService = accessor.get(IInstantiationService);
        const unifiedQuickAccess = getUnifiedQuickAccess(instantiationService);
        unifiedQuickAccess.show(initialTabId);
    }
}
/**
 * Action to show the unified quick access widget starting on the Agent Sessions tab.
 */
export class ShowAgentSessionsQuickAccessAction extends Action2 {
    static { this.ID = 'workbench.action.showAgentSessionsQuickAccess'; }
    constructor() {
        super({
            id: ShowAgentSessionsQuickAccessAction.ID,
            title: localize2('showAgentSessionsQuickAccess', "Show Agent Sessions"),
            f1: true,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)),
        });
    }
    run(accessor) {
        const instantiationService = accessor.get(IInstantiationService);
        const unifiedQuickAccess = getUnifiedQuickAccess(instantiationService);
        unifiedQuickAccess.show('agentSessions');
    }
}
/**
 * Action to show the unified quick access widget starting on the Commands tab.
 */
export class ShowCommandsQuickAccessAction extends Action2 {
    static { this.ID = 'workbench.action.showCommandsQuickAccess'; }
    constructor() {
        super({
            id: ShowCommandsQuickAccessAction.ID,
            title: localize2('showCommandsQuickAccess', "Show Commands (Unified)"),
            f1: true,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)),
        });
    }
    run(accessor) {
        const instantiationService = accessor.get(IInstantiationService);
        const unifiedQuickAccess = getUnifiedQuickAccess(instantiationService);
        unifiedQuickAccess.show('commands');
    }
}
/**
 * Action to show the unified quick access widget starting on the Files tab.
 */
export class ShowFilesQuickAccessAction extends Action2 {
    static { this.ID = 'workbench.action.showFilesQuickAccess'; }
    constructor() {
        super({
            id: ShowFilesQuickAccessAction.ID,
            title: localize2('showFilesQuickAccess', "Show Files (Unified)"),
            f1: true,
            precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${ChatConfiguration.UnifiedAgentsBar}`)),
        });
    }
    run(accessor) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidW5pZmllZFF1aWNrQWNjZXNzQWN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2V4cGVyaW1lbnRzL3VuaWZpZWRRdWlja0FjY2Vzc0FjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUNoRyxPQUFPLEVBQW9CLHFCQUFxQixFQUFFLE1BQU0sa0VBQWtFLENBQUM7QUFDM0gsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDBCQUEwQixDQUFDO0FBQ3JELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3RSxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUNqRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDNUYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLGlDQUFpQyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFFaEcsa0RBQWtEO0FBQ2xELElBQUksMEJBQTBELENBQUM7QUFFL0QsU0FBUyxxQkFBcUIsQ0FBQyxvQkFBMkM7SUFDekUsSUFBSSxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDakMsMEJBQTBCLEdBQUcsb0JBQW9CLENBQUMsY0FBYyxDQUFDLGtCQUFrQixFQUFFLGlDQUFpQyxDQUFDLENBQUM7SUFDekgsQ0FBQztJQUNELE9BQU8sMEJBQTBCLENBQUM7QUFDbkMsQ0FBQztBQUVEOztHQUVHO0FBQ0gsTUFBTSxDQUFDLE1BQU0sOEJBQThCLEdBQUcscUNBQXFDLENBQUM7QUFFcEY7O0dBRUc7QUFDSCxNQUFNLE9BQU8sNEJBQTZCLFNBQVEsT0FBTzthQUV4QyxPQUFFLEdB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