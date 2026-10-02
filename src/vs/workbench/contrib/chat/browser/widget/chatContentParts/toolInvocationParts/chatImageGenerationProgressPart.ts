/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { MutableDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { localize } from '../../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatImageRevealOrigin } from '../../../attachments/chatImageReveal.js';
import { GlyphSurface } from '../../../attachments/chatImageGlyphSurface.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatInputOutputMarkdownProgressPart } from './chatInputOutputMarkdownProgressPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { createImageGenerationLabel, getImageGenerationInvocationMessage } from './chatToolPartUtilities.js';
import '../media/chatImageGenerationProgressPart.css';
import '../../../attachments/chatImageReveal.css';

export class ChatImageGenerationToolProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	private readonly details = this._register(new MutableDisposable<ChatInputOutputMarkdownProgressPart>());
	private readonly animation = this._register(new MutableDisposable<ChatImageGenerationProgressPart>());
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.details.value?.codeblocks ?? [];
	}

	public override get codeblocksPartId(): string {
		return this.details.value?.codeblocksPartId ?? super.codeblocksPartId;
	}

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		codeBlockStartIndex: number,
		showAnimation: boolean,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super(toolInvocation);

		this.domNode = dom.$('.chat-image-generation-progress');
		const detailsContainer = dom.append(this.domNode, dom.$('div'));
		let previousInput: string | undefined;
		let previousMessage: string | undefined;
		this._register(autorun(reader => {
			const state = toolInvocation.kind === 'toolInvocation' ? toolInvocation.state.read(reader) : undefined;
			const input: unknown = state?.type === IChatToolInvocation.StateKind.Streaming
				? state.partialInput.read(reader)
				: toolInvocation.toolSpecificData?.kind === 'input'
					? toolInvocation.toolSpecificData.rawInput
					: IChatToolInvocation.getParameters(toolInvocation);
			const inputText = (typeof input === 'string' ? input : JSON.stringify(input, null, 2))
				?? localize('imageGeneration.inputUnavailable', "The image prompt is not available yet.");
			const message = getImageGenerationInvocationMessage(toolInvocation, reader);
			if (!this.details.value || inputText !== previousInput) {
				this.details.clear();
				const details = this.details.value = instantiationService.createInstance(
					ChatInputOutputMarkdownProgressPart,
					toolInvocation,
					context,
					codeBlockStartIndex,
					createImageGenerationLabel(message),
					toolInvocation.originMessage,
					inputText,
					'json',
					undefined,
					false,
				);
				dom.reset(detailsContainer, details.domNode);
			} else if (message !== previousMessage) {
				this.details.value.title = createImageGenerationLabel(message);
			}
			if (inputText !== previousInput || message !== previousMessage) {
				previousInput = inputText;
				previousMessage = message;
				this._onDidChangeHeight.fire();
			}
		}));

		this.setShowAnimation(showAnimation);
	}

	public getRevealOrigin(container: HTMLElement): IChatImageRevealOrigin | undefined {
		return this.animation.value ? { container } : undefined;
	}

	public setShowAnimation(show: boolean): void {
		if (show === !!this.animation.value) {
			return;
		}
		if (show) {
			const animation = this.animation.value = this.instantiationService.createInstance(ChatImageGenerationProgressPart, this.toolInvocation);
			this.domNode.appendChild(animation.domNode);
		} else {
			this.animation.value?.domNode.remove();
			this.animation.clear();
		}
		this._onDidChangeHeight.fire();
	}
}

export class ChatImageGenerationProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(toolInvocation);

		const label = localize('chat.imageGeneration.placeholder', "Generating image");
		this.domNode = dom.$('.chat-image-generation-placeholder', { role: 'img', 'aria-label': label, 'aria-busy': 'true' });
		const line = dom.append(this.domNode, dom.$('.chat-image-generation-line', { 'aria-hidden': 'true' }));
		this._register(instantiationService.createInstance(GlyphSurface, line));
	}
}
