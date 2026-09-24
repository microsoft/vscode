/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { localize } from '../../../../../../../nls.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import '../media/chatImageGenerationProgressPart.css';

export class ChatImageGenerationProgressPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];

	constructor(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized, showLabel: boolean) {
		super(toolInvocation);

		const label = localize('chat.imageGeneration.placeholder', "Generating image");
		this.domNode = dom.$('.chat-image-generation-placeholder', { role: 'img', 'aria-label': label, 'aria-busy': 'true' });
		if (showLabel) {
			dom.append(this.domNode, dom.$('.chat-image-generation-label', { 'aria-hidden': 'true' }, label));
		}

		const canvas = dom.append(this.domNode, dom.$('.chat-image-generation-canvas', { 'aria-hidden': 'true' }));
		const contours = dom.append(canvas, dom.$.SVG<SVGSVGElement>('svg', {
			class: 'chat-image-generation-contours',
			viewBox: '0 0 420 315',
			preserveAspectRatio: 'none',
			fill: 'none',
			focusable: 'false',
		}));
		for (let index = 0; index < 19; index++) {
			const y = 22 + index * 15;
			const curve = Math.sin(index / 18 * Math.PI) * 72;
			const contour = dom.$.SVG<SVGPathElement>('path', {
				class: 'chat-image-generation-contour',
				d: `M -40 ${y + 24} C 36 ${y + 24}, 52 ${y - curve}, 128 ${y - curve} S 244 ${y + curve * 0.55}, 300 ${y + curve * 0.55} S 408 ${y - 12}, 460 ${y - 12}`,
				'vector-effect': 'non-scaling-stroke',
			});
			contours.appendChild(contour);
			contour.style.animationDelay = `${-index * 0.18}s`;
		}
	}
}
