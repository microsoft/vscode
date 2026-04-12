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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { overviewRulerInfo } from '../../../../editor/common/core/editorColorRegistry.js';
import { OverviewRulerLane } from '../../../../editor/common/model.js';
import { themeColorFromId } from '../../../../platform/theme/common/themeService.js';
import { registerColor } from '../../../../platform/theme/common/colorRegistry.js';
import { localize } from '../../../../nls.js';
import { IAgentFeedbackService } from './agentFeedbackService.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { getSessionForResource } from './agentFeedbackEditorUtils.js';
import { ISessionsManagementService } from '../../sessions/browser/sessionsManagementService.js';
const overviewRulerAgentFeedbackForeground = registerColor('editorOverviewRuler.agentFeedbackForeground', overviewRulerInfo, localize('editorOverviewRuler.agentFeedbackForeground', 'Editor overview ruler decoration color for agent feedback. This color should be opaque.'));
let AgentFeedbackOverviewRulerContribution = class AgentFeedbackOverviewRulerContribution extends Disposable {
    static { this.ID = 'agentFeedback.overviewRulerContribution'; }
    constructor(_editor, _agentFeedbackService, _chatEditingService, _sessionsManagementService) {
        super();
        this._editor = _editor;
        this._agentFeedbackService = _agentFeedbackService;
        this._chatEditingService = _chatEditingService;
        this._sessionsManagementService = _sessionsManagementService;
        this._decorations = this._editor.createDecorationsCollection();
        this._store.add(this._agentFeedbackService.onDidChangeFeedback(() => this._updateDecorations()));
        this._store.add(this._editor.onDidChangeModel(() => {
            this._resolveSession();
            this._updateDecorations();
        }));
        this._resolveSession();
        this._updateDecorations();
    }
    _resolveSession() {
        const model = this._editor.getModel();
        if (!model) {
            this._sessionResource = undefined;
            return;
        }
        this._sessionResource = getSessionForResource(model.uri, this._chatEditingService, this._sessionsManagementService);
    }
    _updateDecorations() {
        if (!this._sessionResource) {
            this._decorations.clear();
            return;
        }
        const model = this._editor.getModel();
        if (!model) {
            this._decorations.clear();
            return;
        }
        const feedbackItems = this._agentFeedbackService.getFeedback(this._sessionResource);
        const modelUri = model.uri.toString();
        this._decorations.set(feedbackItems
            .filter(item => item.resourceUri.toString() === modelUri)
            .map(item => ({
            range: item.range,
            options: {
                description: 'agent-feedback-overview-ruler',
                overviewRuler: {
                    color: themeColorFromId(overviewRulerAgentFeedbackForeground),
                    position: OverviewRulerLane.Center,
                }
            }
        })));
    }
    dispose() {
        this._decorations.clear();
        super.dispose();
    }
};
AgentFeedbackOverviewRulerContribution = __decorate([
    __param(1, IAgentFeedbackService),
    __param(2, IChatEditingService),
    __param(3, ISessionsManagementService)
], AgentFeedbackOverviewRulerContribution);
export { AgentFeedbackOverviewRulerContribution };
registerEditorContribution(AgentFeedbackOverviewRulerContribution.ID, AgentFeedbackOverviewRulerContribution, 3 /* EditorContributionInstantiation.Eventually */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWdlbnRGZWVkYmFja092ZXJ2aWV3UnVsZXJDb250cmlidXRpb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrT3ZlcnZpZXdSdWxlckNvbnRyaWJ1dGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFHbEUsT0FBTyxFQUFtQywwQkFBMEIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQzdILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3ZFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3JGLE9BQU8sRUFBRSxhQUFhLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUNuRixPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sb0JBQW9CLENBQUM7QUFFOUMsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbEUsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUVBQXlFLENBQUM7QUFDOUcsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDdEUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLE1BQU0scURBQXFELENBQUM7QUFFakcsTUFBTSxvQ0FBb0MsR0FBRyxhQUFhLENBQ3pELDZDQUE2QyxFQUM3QyxpQkFBaUIsRUFDakIsUUFBUSxDQUFDLDZDQUE2QyxFQUFFLHlGQUF5RixDQUFDLENBQ2xKLENBQUM7QUFFSyxJQUFNLHNDQUFzQyxHQUE1QyxNQUFNLHNDQUF1QyxTQUFRLFVB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