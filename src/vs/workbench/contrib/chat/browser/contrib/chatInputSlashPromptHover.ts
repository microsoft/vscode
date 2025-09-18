/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IModelDecoration } from '../../../../../editor/common/model.js';
import { HoverAnchor, HoverAnchorType, HoverParticipantRegistry, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart, IRenderedHoverPart, IRenderedHoverParts, RenderedHoverParts } from '../../../../../editor/contrib/hover/browser/hoverTypes.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatWidgetService } from '../chat.js';
import { ChatEditorHoverWrapper } from './editorHoverWrapper.js';
import { IChatPromptSlashCommand, IPromptsService } from '../../common/promptSyntax/service/promptsService.js';
import { ChatRequestSlashPromptPart } from '../../common/chatParserTypes.js';
import * as nls from '../../../../../nls.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownRenderer } from '../../../../../editor/browser/widget/markdownRenderer/browser/markdownRenderer.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { HoverStartSource } from '../../../../../editor/contrib/hover/browser/hoverOperation.js';
import { AsyncIterableObject, AsyncIterableProducer } from '../../../../../base/common/async.js';

/**
 * Hover participant that shows the description for a prompt slash command (e.g. `/plan`) typed into the chat input.
 */
class ChatPromptSlashHoverParticipant implements IEditorHoverParticipant<ChatPromptSlashHoverPart> {

	public readonly hoverOrdinal: number = 5; // after agent hovers

	constructor(
		private readonly editor: import('../../../../../editor/browser/editorBrowser.js').ICodeEditor,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatWidgetService private readonly chatWidgetService: IChatWidgetService,
		@IPromptsService private readonly promptsService: IPromptsService,
		@ILanguageService private readonly languageService: ILanguageService,
		@IOpenerService private readonly openerService: IOpenerService,
	) { }

	computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], source: HoverStartSource, token: CancellationToken): AsyncIterable<ChatPromptSlashHoverPart> {
		if (!this.editor.hasModel()) {
			return AsyncIterableObject.EMPTY;
		}
		const widget = this.chatWidgetService.getWidgetByInputUri(this.editor.getModel().uri);
		if (!widget) {
			return AsyncIterableObject.EMPTY;
		}
		// Find a slash prompt part in the parsed input
		const slashPromptPart = widget.parsedInput.parts.find(p => p instanceof ChatRequestSlashPromptPart) as ChatRequestSlashPromptPart | undefined;
		if (!slashPromptPart) {
			return AsyncIterableObject.EMPTY;
		}
		if (Range.containsPosition(slashPromptPart.editorRange, anchor.range.getStartPosition())) {
			const that = this;
			return AsyncIterableProducer.fromPromise((async () => {
				const items = await this.promptsService.findPromptSlashCommands();
				const item = items.find(i => i.command === slashPromptPart.slashPromptCommand.command);
				if (item?.description) {
					// title.textContent = '';
					// const renderer = new MarkdownRenderer({ editor: this.editor }, this.languageService, this.openerService);
					// const md = new MarkdownString(item.description, { isTrusted: false, supportHtml: false, supportThemeIcons: false });
					// renderer.render(md, undefined, title);
					// renderer.render(md, undefined, desc);
					// title.textContent = renderedMd.element.inn;
					// desc.textContent = renderedMd;
					return [new ChatPromptSlashHoverPart(that, Range.lift(slashPromptPart.editorRange), { command: item.command, detail: item.detail, description: item.description, promptPath: item.promptPath })];
				}
				return [];
			})());
		}


		// 	return AsyncIterableObject.fromArray([new ChatPromptSlashHoverPart(this, Range.lift(slashPromptPart.editorRange), slashPromptPart.slashPromptCommand)]);
		// }
		return AsyncIterableObject.EMPTY;
	}

	computeSync(anchor: HoverAnchor, _lineDecorations: IModelDecoration[]): ChatPromptSlashHoverPart[] {
		if (!this.editor.hasModel()) {
			return [];
		}
		const widget = this.chatWidgetService.getWidgetByInputUri(this.editor.getModel().uri);
		if (!widget) {
			return [];
		}
		// Find a slash prompt part in the parsed input
		const slashPromptPart = widget.parsedInput.parts.find(p => p instanceof ChatRequestSlashPromptPart) as ChatRequestSlashPromptPart | undefined;
		if (!slashPromptPart) {
			return [];
		}
		if (Range.containsPosition(slashPromptPart.editorRange, anchor.range.getStartPosition())) {
			return [new ChatPromptSlashHoverPart(this, Range.lift(slashPromptPart.editorRange), slashPromptPart.slashPromptCommand)];
		}
		return [];
	}

	renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ChatPromptSlashHoverPart[]): IRenderedHoverParts<ChatPromptSlashHoverPart> {
		if (!hoverParts.length) {
			return new RenderedHoverParts([]);
		}
		const hoverPart = hoverParts[0];
		const disposables = new DisposableStore();
		// Reuse ChatEditorHoverWrapper for consistent styling
		const root = document.createElement('div');
		root.classList.add('chat-prompt-slash-hover');
		const title = document.createElement('div');
		title.classList.add('markdown-hover');
		// title.style.fontWeight = 'bold';
		const description = hoverPart.command.description || hoverPart.command.detail || '';
		title.textContent = description;
		root.appendChild(title);
		// this.promptsService.findPromptSlashCommands().then(items => {
		// const item = items.find(i => i.command === hoverPart.command.command);
		const desc = document.createElement('div');
		if (description) {
			title.textContent = '';
			const renderer = new MarkdownRenderer({ editor: this.editor }, this.languageService, this.openerService);
			const md = new MarkdownString(description, { isTrusted: false, supportHtml: false, supportThemeIcons: false });
			renderer.render(md, undefined, title);
			renderer.render(md, undefined, desc);
			// title.textContent = renderedMd.element.inn;
			// desc.textContent = renderedMd;
		}
		// });
		// if (description) {
		// 	desc.classList.add('markdown-hover');
		// 	desc.textContent = description;
		// 	root.appendChild(desc);
		// }
		// const detail = 'Prompt file: [{0}]({1})', this.labelService.getUriLabel(promptPath.uri, { relative: true }))
		const detail = document.createElement('div');
		detail.classList.add('markdown-hover');
		detail.style.opacity = '0.8';
		detail.textContent = hoverPart.command.detail;
		root.appendChild(detail);
		const wrapper = this.instantiationService.createInstance(ChatEditorHoverWrapper, root, []);
		context.fragment.appendChild(wrapper.domNode);
		const rendered: IRenderedHoverPart<ChatPromptSlashHoverPart> = {
			hoverPart,
			hoverElement: wrapper.domNode,
			dispose() { disposables.dispose(); }
		};
		return new RenderedHoverParts([rendered]);
	}

	getAccessibleContent(_hoverPart: ChatPromptSlashHoverPart): string {
		return nls.localize('hoverAccessibilityChatPromptSlash', 'There is a chat prompt slash command hover here.');
	}
}

class ChatPromptSlashHoverPart implements IHoverPart {
	constructor(
		public readonly owner: IEditorHoverParticipant<ChatPromptSlashHoverPart>,
		public readonly range: Range,
		public readonly command: IChatPromptSlashCommand,
	) { }

	isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range &&
			this.range.startColumn <= anchor.range.startColumn &&
			this.range.endColumn >= anchor.range.endColumn
		);
	}
}

HoverParticipantRegistry.register(ChatPromptSlashHoverParticipant);

export { };
