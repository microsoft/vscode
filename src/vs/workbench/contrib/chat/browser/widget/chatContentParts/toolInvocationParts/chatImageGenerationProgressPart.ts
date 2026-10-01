/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { synchronizeCSSAnimations } from '../../../../../../../base/browser/animationSync.js';
import { localize } from '../../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatImageRevealOrigin } from '../../../attachments/chatImageReveal.js';
import { ChatImageLoadingSurfaces } from '../../../attachments/chatImageLoadingSurfaces.js';
import { ImageGenerationFieldCanvas } from './chatImageGenerationFieldCanvas.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatImageGenerationProgressPart.css';
import '../../../attachments/chatImageReveal.css';

export class ChatImageGenerationProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];
	private readonly line: HTMLElement | undefined;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		showLabel: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(toolInvocation);

		const label = localize('chat.imageGeneration.placeholder', "Generating image");
		this.domNode = dom.$('.chat-image-generation-placeholder', { role: 'img', 'aria-label': label, 'aria-busy': 'true' });
		if (toolInvocation.toolId === 'generate_image_mock') {
			const line = this.line = dom.append(this.domNode, dom.$('.chat-image-generation-line', { 'aria-hidden': 'true' }));
			this._register(dom.addDisposableListener(line, 'animationstart', () => synchronizeCSSAnimations(line, { subtree: true })));
			this._register(instantiationService.createInstance(ChatImageLoadingSurfaces, line));
			return;
		}

		if (showLabel) {
			dom.append(this.domNode, dom.$('.chat-image-generation-label', { 'aria-hidden': 'true' }, label));
		}

		const canvas = dom.append(this.domNode, dom.$('.chat-image-generation-canvas', { 'aria-hidden': 'true' }));
		this._register(instantiationService.createInstance(ImageGenerationFieldCanvas, canvas, toolInvocation.toolCallId));
	}

	getRevealOrigin(container: HTMLElement): IChatImageRevealOrigin | undefined {
		if (!this.line) {
			return undefined;
		}
		return { container };
	}
}
