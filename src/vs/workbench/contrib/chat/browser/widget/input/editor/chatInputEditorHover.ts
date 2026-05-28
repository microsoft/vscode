/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../../../../editor/browser/editorBrowser.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { IModelDecoration } from '../../../../../../../editor/common/model.js';
import { HoverAnchor, HoverAnchorType, HoverParticipantRegistry, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from '../../../../../../../editor/contrib/hover/browser/hoverTypes.js';
import { ICommandService } from '../../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatWidgetService } from '../../../chat.js';
import { ChatAgentHover, getChatAgentHoverOptions } from '../../chatAgentHover.js';
import { ChatEditorHoverWrapper } from './editorHoverWrapper.js';
import { IChatAgentData } from '../../../../common/participants/chatAgents.js';
import { extractAgentAndCommand } from '../../../../common/requestParser/chatParserTypes.js';
import * as nls from '../../../../../../../nls.js';

export class ChatAgentHoverParticipant implements IEditorHoverParticipant<ChatAgentHoverPart> {

	public readonly hoverOrdinal: number = 1;

	constructor(
		private readonly editor: ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@ICommandService private readonly commandService: ICommandService,
	) { }

	public computeSync(anchor: HoverAnchor, _lineDecorations: IModelDecoration[]): ChatAgentHoverPart[] {
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

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ChatAgentHoverPart[]): IRenderedHoverParts<ChatAgentHoverPart> {
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
		const renderedHoverPart: IRenderedHoverPart<ChatAgentHoverPart> = {
			hoverPart,
			hoverElement: wrapperNode,
			dispose() { disposables.dispose(); }
		};
		return new RenderedHoverParts([renderedHoverPart]);
	}

	public getAccessibleContent(hoverPart: ChatAgentHoverPart): string {
		return nls.localize('hoverAccessibilityChatAgent', 'There is a chat agent hover part here.');

	}
}

export class ChatAgentHoverPart implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<ChatAgentHoverPart>,
		public readonly range: Range,
		public readonly agent: IChatAgentData
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}
}

HoverParticipantRegistry.register(ChatAgentHoverParticipant);
