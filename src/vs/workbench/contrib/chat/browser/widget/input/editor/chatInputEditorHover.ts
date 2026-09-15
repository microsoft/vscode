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
import { ChatRequestDynamicVariablePart, extractAgentAndCommand } from '../../../../common/requestParser/chatParserTypes.js';
import * as nls from '../../../../../../../nls.js';
import { isImageVariableEntry, type IImageVariableEntry } from '../../../../common/attachments/chatVariableEntries.js';
import { coerceImageBuffer } from '../../../../common/chatImageExtraction.js';
import { createImageHoverContent } from '../../../attachments/chatAttachmentWidgets.js';
import { URI } from '../../../../../../../base/common/uri.js';

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

export class ChatAttachmentReferenceHoverParticipant implements IEditorHoverParticipant<ChatAttachmentReferenceHoverPart> {

	public readonly hoverOrdinal: number = 2;

	constructor(
		private readonly editor: ICodeEditor,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
	) { }

	public computeSync(anchor: HoverAnchor, _lineDecorations: IModelDecoration[]): ChatAttachmentReferenceHoverPart[] {
		if (!this.editor.hasModel()) {
			return [];
		}

		const widget = this.chatWidgetService.getWidgetByInputUri(this.editor.getModel().uri);
		if (!widget) {
			return [];
		}

		const part = widget.parsedInput.parts.find((part): part is ChatRequestDynamicVariablePart =>
			part instanceof ChatRequestDynamicVariablePart
			&& part.isAttachmentReference === true
			&& Range.containsPosition(part.editorRange, anchor.range.getStartPosition()));
		if (!part) {
			return [];
		}

		const attachment = widget.attachmentModel.attachments.find(attachment => attachment.id === part.id && !attachment.range);
		if (!attachment || !isImageVariableEntry(attachment)) {
			return [];
		}

		const buffer = coerceImageBuffer(attachment.value);
		return buffer ? [new ChatAttachmentReferenceHoverPart(this, Range.lift(part.editorRange), attachment, buffer)] : [];
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ChatAttachmentReferenceHoverPart[]): IRenderedHoverParts<ChatAttachmentReferenceHoverPart> {
		if (!hoverParts.length) {
			return new RenderedHoverParts([]);
		}

		const hoverPart = hoverParts[0];
		const resource = hoverPart.attachment.references?.find(reference => URI.isUri(reference.reference))?.reference;
		const hover = createImageHoverContent(URI.isUri(resource) ? resource : undefined, hoverPart.attachment.fullName ?? hoverPart.attachment.name, hoverPart.buffer, hoverPart.attachment.id, () => context.onContentsChanged());
		hover.element.setAttribute('aria-label', nls.localize('chat.attachmentReference.imageHover', "Image attachment reference, {0}", hoverPart.attachment.name));
		context.fragment.appendChild(hover.element);
		return new RenderedHoverParts([{
			hoverPart,
			hoverElement: hover.element,
			dispose: () => hover.disposable.dispose(),
		}]);
	}

	public getAccessibleContent(hoverPart: ChatAttachmentReferenceHoverPart): string {
		return nls.localize('chat.attachmentReference.imageHoverAccessible', "Image attachment reference, {0}", hoverPart.attachment.name);
	}
}

export class ChatAttachmentReferenceHoverPart implements IHoverPart {

	constructor(
		public readonly owner: IEditorHoverParticipant<ChatAttachmentReferenceHoverPart>,
		public readonly range: Range,
		public readonly attachment: IImageVariableEntry,
		public readonly buffer: Uint8Array,
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return anchor.type === HoverAnchorType.Range && Range.containsPosition(this.range, anchor.range.getStartPosition());
	}
}

HoverParticipantRegistry.register(ChatAttachmentReferenceHoverParticipant);
