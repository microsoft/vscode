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
import { autorun, derived } from '../../../../base/common/observable.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
import { IViewsService } from '../../../../workbench/services/views/common/viewsService.js';
import { CHANGES_VIEW_ID } from '../../changes/browser/changesView.js';
let LayoutController = class LayoutController extends Disposable {
    static { this.ID = 'workbench.contrib.sessionsLayoutController'; }
    constructor(_layoutService, _sessionManagementService, _chatService, _viewsService) {
        super();
        this._layoutService = _layoutService;
        this._sessionManagementService = _sessionManagementService;
        this._chatService = _chatService;
        this._viewsService = _viewsService;
        this._pendingTurnStateByResource = new ResourceMap();
        this._panelVisibilityBySession = new ResourceMap();
        const activeSessionHasChangesObs = derived(reader => {
            const activeSession = this._sessionManagementService.activeSession.read(reader);
            if (!activeSession) {
                return false;
            }
            const changes = activeSession.changes.read(reader);
            return changes.length > 0;
        });
        // Switch between sessions — sync auxiliary bar and panel visibility
        this._register(autorun(reader => {
            const activeSession = this._sessionManagementService.activeSession.read(reader);
            const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);
            this._syncAuxiliaryBarVisibility(activeSessionHasChanges);
            this._syncPanelVisibility(activeSession?.resource);
        }));
        // When a turn is completed, check if there were changes before the turn and
        // if there are changes after the turn. If there were no changes before the
        // turn and there are changes after the turn, show the auxiliary bar.
        this._register(autorun((reader) => {
            const activeSession = this._sessionManagementService.activeSession.read(reader);
            const activeSessionHasChanges = activeSessionHasChangesObs.read(reader);
            if (!activeSession) {
                return;
            }
            const pendingTurnState = this._pendingTurnStateByResource.get(activeSession.resource);
            if (!pendingTurnState) {
                return;
            }
            const lastTurnEnd = activeSession.lastTurnEnd.read(reader);
            const turnCompleted = !!lastTurnEnd && lastTurnEnd.getTime() >= pendingTurnState.submittedAt;
            if (!turnCompleted) {
                return;
            }
            if (!pendingTurnState.hadChangesBeforeSend && activeSessionHasChanges) {
                this._layoutService.setPartHidden(false, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
            }
            this._pendingTurnStateByResource.delete(activeSession.resource);
        }));
        this._register(this._chatService.onDidSubmitRequest(({ chatSessionResource }) => {
            this._pendingTurnStateByResource.set(chatSessionResource, {
                hadChangesBeforeSend: activeSessionHasChangesObs.get(),
                submittedAt: Date.now(),
            });
        }));
        // Track panel visibility changes by the user
        this._register(this._layoutService.onDidChangePartVisibility(e => {
            if (e.partId !== "workbench.parts.panel" /* Parts.PANEL_PART */) {
                return;
            }
            const activeSession = this._sessionManagementService.activeSession.get();
            if (activeSession) {
                this._panelVisibilityBySession.set(activeSession.resource, e.visible);
            }
        }));
    }
    _syncAuxiliaryBarVisibility(hasChanges) {
        if (hasChanges) {
            this._viewsService.openView(CHANGES_VIEW_ID, false);
        }
        else {
            this._layoutService.setPartHidden(true, "workbench.parts.auxiliarybar" /* Parts.AUXILIARYBAR_PART */);
        }
    }
    _syncPanelVisibility(sessionResource) {
        if (!sessionResource) {
            this._layoutService.setPartHidden(true, "workbench.parts.panel" /* Parts.PANEL_PART */);
            return;
        }
        const wasVisible = this._panelVisibilityBySession.get(sessionResource);
        // Default to hidden if we have no record for this session
        this._layoutService.setPartHidden(wasVisible !== true, "workbench.parts.panel" /* Parts.PANEL_PART */);
    }
};
LayoutController = __decorate([
    __param(0, IWorkbenchLayoutService),
    __param(1, ISessionsManagementService),
    __param(2, IChatService),
    __param(3, IViewsService)
], LayoutController);
export { LayoutController };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGF5b3V0Q29udHJvbGxlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0Q29udHJvbGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFFN0QsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLHNFQUFzRSxDQUFDO0FBQ3BHLE9BQU8sRUFBRSx1QkFBdUIsRUFBUyxNQUFNLGdFQUFnRSxDQUFDO0FBQ2hILE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLHFEQUFxRCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSw2REFBNkQsQ0FBQztBQUM1RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFPaEUsSUFBTSxnQkFBZ0IsR0FBdEIsTUFBTSxnQkFBaUIsU0FBUSxVQUFVO2FBRS9CLE9BQUUsR0FBRyw0Q0FBNEMsQUFBL0MsQ0FBZ0Q7SUFLbEUsWUFDMEIsY0FBd0QsRUFDckQseUJBQXNFLEVBQ3BGLFlBQTJDLEVBQzFDLGFBQTZDO1FBRTVELEtBQUssRUFBRSxDQUFDO1FBTGtDLG1CQUFjLEdBQWQsY0FBYyxDQUF5QjtRQUNwQyw4QkFBeUIsR0FBekIseUJBQXlCLENBQTRCO1FBQ25FLGlCQUFZLEdBQVosWUFBWSxDQUFjO1FBQ3pCLGtCQUFhLEdBQWIsYUFBYSxDQUFlO1FBUDVDLGdDQUEyQixHQUFHLElBQUksV0FBVyxFQUFxQixDQUFDO1FBQ25FLDhCQUF5QixHQUFHLElB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