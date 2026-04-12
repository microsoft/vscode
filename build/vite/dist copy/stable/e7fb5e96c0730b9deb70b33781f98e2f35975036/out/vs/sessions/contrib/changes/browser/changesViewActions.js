/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Codicon } from '../../../../base/common/codicons.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { registerWorkbenchContribution2 } from '../../../../workbench/common/contributions.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { CHANGES_VIEW_ID } from './changesView.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { bindContextKey } from '../../../../platform/observable/common/platformObservableUtils.js';
import { activeSessionHasChangesContextKey } from '../common/changes.js';
const openChangesViewActionOptions = {
    id: 'workbench.action.agentSessions.openChangesView',
    title: localize2('openChangesView', "Changes"),
    icon: Codicon.diffMultiple,
    f1: false,
};
class OpenChangesViewAction extends Action2 {
    static { this.ID = openChangesViewActionOptions.id; }
    constructor() {
        super(openChangesViewActionOptions);
    }
    async run(accessor) {
        const viewsService = accessor.get(IViewsService);
        await viewsService.openView(CHANGES_VIEW_ID, true);
    }
}
registerAction2(OpenChangesViewAction);
let ChangesViewActionsContribution = class ChangesViewActionsContribution extends Disposable {
    static { this.ID = 'workbench.contrib.changesViewActions'; }
    constructor(contextKeyService, sessionManagementService) {
        super();
        // Bind context key: true when the active session has changes
        this._register(bindContextKey(activeSessionHasChangesContextKey, contextKeyService, reader => {
            const activeSession = sessionManagementService.activeSession.read(reader);
            if (!activeSession) {
                return false;
            }
            const changes = activeSession.changes.read(reader);
            return changes.length > 0;
        }));
    }
};
ChangesViewActionsContribution = __decorate([
    __param(0, IContextKeyService),
    __param(1, ISessionsManagementService)
], ChangesViewActionsContribution);
registerWorkbenchContribution2(ChangesViewActionsContribution.ID, ChangesViewActionsContribution, 3 /* WorkbenchPhase.AfterRestored */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhbmdlc1ZpZXdBY3Rpb25zLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9jaGFuZ2VzL2Jyb3dzZXIvY2hhbmdlc1ZpZXdBY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUM5RCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQy9DLE9BQU8sRUFBRSxPQUFPLEVBQW1CLGVBQWUsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBRTNHLE9BQU8sRUFBMEIsOEJBQThCLEVBQWtCLE1BQU0sK0NBQStDLENBQUM7QUFDdkksT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBQzVGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxrQkFBa0IsQ0FBQztBQUNuRCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUMxRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sbUVBQW1FLENBQUM7QUFFbkcsT0FBTyxFQUFFLGlDQUFpQyxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFFekUsTUFBTSw0QkFBNEIsR0FBb0I7SUFDckQsRUFBRSxFQUFFLGdEQUFnRDtJQUNwRCxLQUFLLEVBQUUsU0FBUyxDQUFDLGlCQUFpQixFQUFFLFNBQVMsQ0FBQztJQUM5QyxJQUFJLEVBQUUsT0FBTyxDQUFDLFlBQVk7SUFDMUIsRUFBRSxFQUFFLEtBQUs7Q0FDVCxDQUFDO0FBRUYsTUFBTSxxQkFBc0IsU0FBUSxPQUFPO2FBRTFCLE9BQUUsR0FBRyw0QkFBNEIsQ0FBQyxFQUFFLENBQUM7SUFFckQ7UUFDQyxLQUFLLENBQUMsNEJBQTRCLENBQUMsQ0FBQztJQUNyQyxDQUFDO0lBRUQsS0FBSyxDQUFDLEdBQUcsQ0FBQyxRQUEwQjtRQUNuQyxNQUFNLFlBQVksR0FBRyxRQUFRLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxDQUFDO1FBQ2pELE1BQU0sWUFBWSxDQUFDLFFBQVEsQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDcEQsQ0FBQzs7QUFHRixlQUFlLENBQUMscUJBQXFCLENBQUMsQ0FBQztBQUV2QyxJQUFNLDhCQUE4QixHQUFwQyxNQUFNLDhCQUErQixTQUFRLFVBQVU7YUFFdEMsT0FBRSxHQUFHLHNDQUFzQyxBQUF6QyxDQUEwQztJQUU1RCxZQUNxQixpQkFBcUMsRUFDN0Isd0JBQW9EO1FBRWhGLEtBQUssRUFBRSxDQUFDO1FBRVIsNkRBQTZEO1FBQzdELElBQUksQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLGlDQUFpQyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxFQUFFO1lBQzVGLE1BQU0sYUFBYSxHQUFHLHdCQUF3QixDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDMUUsSUFBSSxDQUFDLGFBQWEsRUFBRSxDQUFDO2dCQUNwQixPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNuRCxPQUFPLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQzNCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDOztBQW5CSSw4QkFBOEI7SUFLakMsV0FBQSxrQkFBa0IsQ0FBQTtJQUNsQixXQUFBLDBCQUEwQixDQUFBO0dBTnZCLDhCQUE4QixDQW9CbkM7QUFFRCw4QkFBOEIsQ0FBQyw4QkFBOEIsQ0FBQyxFQUFFLEVBQUUsOEJBQThCLHVDQUErQixDQUFDIn0=