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
var PromptCodingAgentActionOverlayWidget_1;
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';
import { IRemoteCodingAgentsService } from '../../../remoteCodingAgents/common/remoteCodingAgentsService.js';
import { localize } from '../../../../../nls.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { PROMPT_LANGUAGE_ID } from '../../common/promptSyntax/promptTypes.js';
import { $ } from '../../../../../base/browser/dom.js';
import { IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
let PromptCodingAgentActionOverlayWidget = class PromptCodingAgentActionOverlayWidget extends Disposable {
    static { PromptCodingAgentActionOverlayWidget_1 = this; }
    static { this.ID = 'promptCodingAgentActionOverlay'; }
    constructor(_editor, _commandService, _contextKeyService, _remoteCodingAgentService, _promptsService) {
        super();
        this._editor = _editor;
        this._commandService = _commandService;
        this._contextKeyService = _contextKeyService;
        this._remoteCodingAgentService = _remoteCodingAgentService;
        this._promptsService = _promptsService;
        this._isVisible = false;
        this._domNode = $('.prompt-coding-agent-action-overlay');
        this._button = this._register(new Button(this._domNode, {
            supportIcons: true,
            title: localize('runPromptWithCodingAgent', "Run prompt file in a remote coding agent")
        }));
        this._button.element.style.background = 'var(--vscode-button-background)';
        this._button.element.style.color = 'var(--vscode-button-foreground)';
        this._button.label = localize('runWithCodingAgent.label', "{0} Delegate to Copilot coding agent", '$(cloud-upload)');
        this._register(this._button.onDidClick(async () => {
            await this._execute();
        }));
        this._register(this._contextKeyService.onDidChangeContext(() => {
            this._updateVisibility();
        }));
        this._register(this._editor.onDidChangeModel(() => {
            this._updateVisibility();
        }));
        this._register(this._editor.onDidLayoutChange(() => {
            if (this._isVisible) {
                this._editor.layoutOverlayWidget(this);
            }
        }));
        // initial visibility
        this._updateVisibility();
    }
    getId() {
        return PromptCodingAgentActionOverlayWidget_1.ID;
    }
    getDomNode() {
        return this._domNode;
    }
    getPosition() {
        if (!this._isVisible) {
            return null;
        }
        return {
            preference: 1 /* OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER */,
        };
    }
    _updateVisibility() {
        const enableRemoteCodingAgentPromptFileOverlay = ChatContextKeys.enableRemoteCodingAgentPromptFileOverlay.getValue(this._contextKeyService);
        const hasRemoteCodingAgent = ChatContextKeys.hasRemoteCodingAgent.getValue(this._contextKeyService);
        const model = this._editor.getModel();
        const isPromptFile = model?.getLanguageId() === PROMPT_LANGUAGE_ID;
        const shouldBeVisible = !!(isPromptFile && enableRemoteCodingAgentPromptFileOverlay && hasRemoteCodingAgent);
        if (shouldBeVisible !== this._isVisible) {
            this._isVisible = shouldBeVisible;
            if (this._isVisible) {
                this._editor.addOverlayWidget(this);
            }
            else {
                this._editor.removeOverlayWidget(this);
            }
        }
    }
    async _execute() {
        const model = this._editor.getModel();
        if (!model) {
            return;
        }
        this._button.enabled = false;
        try {
            const promptContent = model.getValue();
            const promptName = await this._promptsService.getPromptSlashCommandName(model.uri, CancellationToken.None);
            const agents = this._remoteCodingAgentService.getAvailableAgents();
            const agent = agents[0]; // Use the first available agent
            if (!agent) {
                return;
            }
            await this._commandService.executeCommand(agent.command, {
                userPrompt: promptName,
                summary: promptContent,
                source: 'prompt',
            });
        }
        finally {
            this._button.enabled = true;
        }
    }
    dispose() {
        if (this._isVisible) {
            this._editor.removeOverlayWidget(this);
        }
        super.dispose();
    }
};
PromptCodingAgentActionOverlayWidget = PromptCodingAgentActionOverlayWidget_1 = __decorate([
    __param(1, ICommandService),
    __param(2, IContextKeyService),
    __param(3, IRemoteCodingAgentsService),
    __param(4, IPromptsService)
], PromptCodingAgentActionOverlayWidget);
export { PromptCodingAgentActionOverlayWidget };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0Q29kaW5nQWdlbnRBY3Rpb25PdmVybGF5LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL3Byb21wdFN5bnRheC9wcm9tcHRDb2RpbmdBZ2VudEFjdGlvbk92ZXJsYXkudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUVyRSxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0scURBQXFELENBQUM7QUFDdEYsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDN0YsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzFFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlFQUFpRSxDQUFDO0FBQzdHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSx1QkFBdUIsQ0FBQztBQUNqRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDekUsT0FBTyxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDOUUsT0FBTyxFQUFFLENBQUMsRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBQ3ZELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUN0RixPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUV4RSxJQUFNLG9DQUFvQyxHQUExQyxNQUFNLG9DQUFxQyxTQUFRLFVBQVU7O2FBRTNDLE9BQUUsR0FBRyxnQ0FBZ0MsQUFBbkMsQ0FBb0M7SUFNOUQsWUFDa0IsT0FBb0IsRUFDcEIsZUFBaUQsRUFDOUMsa0JBQXVELEVBQy9DLHlCQUFzRSxFQUNqRixlQUFpRDtRQUVsRSxLQUFLLEVBQUUs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