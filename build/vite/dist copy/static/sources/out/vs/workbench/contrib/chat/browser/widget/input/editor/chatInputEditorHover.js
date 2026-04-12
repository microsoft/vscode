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
import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { HoverParticipantRegistry, RenderedHoverParts } from '../../../../../../../editor/contrib/hover/browser/hoverTypes.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatAgentHover, getChatAgentHoverOptions } from '../../chatAgentHover.js';
import { ChatEditorHoverWrapper } from './editorHoverWrapper.js';
import { extractAgentAndCommand } from '../../../../common/requestParser/chatParserTypes.js';
import * as nls from '../../../../../../../nls.js';
let ChatAgentHoverParticipant = class ChatAgentHoverParticipant {
    constructor(editor, instantiationService, chatWidgetService, commandService) {
        this.editor = editor;
        this.instantiationService = instantiationService;
        this.chatWidgetService = chatWidgetService;
        this.commandService = commandService;
        this.hoverOrdinal = 1;
    }
    computeSync(anchor, _lineDecorations) {
        if (!this.editor.hasModel()) {
            return [];
        }
        const widget = this.chatWidgetService.getWidgetByInputUri(this.editor.getModel().uri);
        if (!widget) {
            return [];
        }
        const { agentPart } = extractAgentAndCommand(widget.parsedInput);
        if (!agentPart) {
            return [];
        }
        if (Range.containsPosition(agentPart.editorRange, anchor.range.getStartPosition())) {
            return [new ChatAgentHoverPart(this, Range.lift(agentPart.editorRange), agentPart.agent)];
        }
        return [];
    }
    renderHoverParts(context, hoverParts) {
        if (!hoverParts.length) {
            return new RenderedHoverParts([]);
        }
        const disposables = new DisposableStore();
        const hover = disposables.add(this.instantiationService.createInstance(ChatAgentHover));
        disposables.add(hover.onDidChangeContents(() => context.onContentsChanged()));
        const hoverPart = hoverParts[0];
        const agent = hoverPart.agent;
        hover.setAgent(agent.id);
        const actions = getChatAgentHoverOptions(() => agent, this.commandService).actions;
        const wrapper = this.instantiationService.createInstance(ChatEditorHoverWrapper, hover.domNode, actions);
        const wrapperNode = wrapper.domNode;
        context.fragment.appendChild(wrapperNode);
        const renderedHoverPart = {
            hoverPart,
            hoverElement: wrapperNode,
            dispose() { disposables.dispose(); }
        };
        return new RenderedHoverParts([renderedHoverPart]);
    }
    getAccessibleContent(hoverPart) {
        return nls.localize('hoverAccessibilityChatAgent', 'There is a chat agent hover part here.');
    }
};
ChatAgentHoverParticipant = __decorate([
    __param(1, IInstantiationService),
    __param(2, IChatWidgetService),
    __param(3, ICommandService)
], ChatAgentHoverParticipant);
export { ChatAgentHoverParticipant };
export class ChatAgentHoverPart {
    constructor(owner, range, agent) {
        this.owner = owner;
        this.range = range;
        this.agent = agent;
    }
    isValidForHoverAnchor(anchor) {
        return (anchor.type === 1 /* HoverAnchorType.Range */
            && this.range.startColumn <= anchor.range.startColumn
            && this.range.endColumn >= anchor.range.endColumn);
    }
}
HoverParticipantRegistry.register(ChatAgentHoverParticipant);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhdElucHV0RWRpdG9ySG92ZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0L2lucHV0L2VkaXRvci9jaGF0SW5wdXRFZGl0b3JIb3Zlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFFaEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBRXpFLE9BQU8sRUFBZ0Msd0JBQXdCLEVBQTJHLGtCQUFrQixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFDdFEsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDJEQUEyRCxDQUFDO0FBQzVGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLHFFQUFxRSxDQUFDO0FBQzVHLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLGtCQUFrQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxjQUFjLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUNuRixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUVqRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSxxREFBcUQsQ0FBQztBQUM3RixPQUFPLEtBQUssR0FBRyxNQUFNLDZCQUE2QixDQUFDO0FBRTVDLElBQU0seUJBQXlCLEdBQS9CLE1BQU0seUJBQXlCO0lBSXJDLFlBQ2tCLE1BQW1CLEVBQ2Isb0JBQTRELEVBQy9ELGlCQUFzRCxFQUN6RCxjQUFnRDtRQUhoRCxXQUFNLEdBQU4sTUFBTSxDQUFhO1FBQ0kseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQUM5QyxzQkFBaUIsR0FBakIsaUJBQWlCLENBQW9CO1FBQ3hDLG1CQUFjLEdBQWQsY0FB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