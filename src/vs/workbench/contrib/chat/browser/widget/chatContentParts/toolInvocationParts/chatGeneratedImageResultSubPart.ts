/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { getExtensionForMimeType } from '../../../../../../../base/common/mime.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { ChatResponseResource } from '../../../../common/model/chatModel.js';
import { IChatRendererContent } from '../../../../common/model/chatViewModel.js';
import { isToolResultInputOutputDetails, type IToolResultInputOutputDetails } from '../../../../common/tools/languageModelToolsService.js';
import { type IChatCodeBlockInfo } from '../../../chat.js';
import { type IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatResourceGroupWidget } from '../chatResourceGroupWidget.js';
import { type IChatCollapsibleIODataPart } from '../chatToolInputOutputContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export function getGeneratedImageResultParts(
	details: IToolResultInputOutputDetails | undefined,
	sessionResource: URI,
	toolCallId: string,
): IChatCollapsibleIODataPart[] {
	if (!details) {
		return [];
	}

	const parts: IChatCollapsibleIODataPart[] = [];
	for (let index = 0; index < details.output.length; index++) {
		const output = details.output[index];
		if (!output.mimeType?.startsWith('image/')) {
			continue;
		}
		if (output.type === 'ref') {
			parts.push({ kind: 'data', uri: output.uri, mimeType: output.mimeType, audience: output.audience });
			continue;
		}
		if (output.isText) {
			continue;
		}

		const extension = getExtensionForMimeType(output.mimeType) ?? '';
		const uri = ChatResponseResource.createUri(sessionResource, toolCallId, index, `generated-image${extension}`);
		parts.push({ kind: 'data', base64Value: output.value, mimeType: output.mimeType, uri, audience: output.audience });
	}
	return parts;
}

function getGeneratedImageResultDetails(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): IToolResultInputOutputDetails | undefined {
	const resultDetails = toolInvocation.kind === 'toolInvocation'
		? IChatToolInvocation.resultDetails(toolInvocation)
		: toolInvocation.resultDetails;
	return isToolResultInputOutputDetails(resultDetails) ? resultDetails : undefined;
}

export function getGeneratedImageResultCount(content: ReadonlyArray<IChatRendererContent>): number {
	let count = 0;
	for (const part of content) {
		if ((part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') || part.toolSpecificData?.kind !== 'generatedImage') {
			continue;
		}
		const details = getGeneratedImageResultDetails(part);
		count += details?.output.filter(output => output.mimeType?.startsWith('image/') && (output.type === 'ref' || !output.isText)).length ?? 0;
	}
	return count;
}

export function getGeneratedImageResultPartsFromContent(
	content: ReadonlyArray<IChatRendererContent>,
	sessionResource: URI,
): IChatCollapsibleIODataPart[] {
	const parts: IChatCollapsibleIODataPart[] = [];
	for (const part of content) {
		if ((part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') || part.toolSpecificData?.kind !== 'generatedImage') {
			continue;
		}
		parts.push(...getGeneratedImageResultParts(getGeneratedImageResultDetails(part), sessionResource, part.toolCallId));
	}
	if (parts.length < 2) {
		return parts;
	}
	return parts.map((part, index) => ({
		...part,
		// Distinguish each attachment in the gallery's visible and accessible labels.
		uri: part.uri.with({ path: part.uri.path.replace(/generated-image(?=\.[^/]+$|$)/, `generated-image-${index + 1}`) }),
	}));
}

/** Renders generated images as response outcomes using the shared image preview affordances. */
export class ChatGeneratedImageResultSubPart extends BaseChatToolInvocationSubPart {
	public readonly domNode: HTMLElement;
	public override readonly codeblocks: IChatCodeBlockInfo[] = [];
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(toolInvocation);
		const parts = getGeneratedImageResultPartsFromContent(context.content, context.element.sessionResource);
		const resourceGroup = this._register(instantiationService.createInstance(ChatResourceGroupWidget, parts, { showImageInHover: false }));
		this._register(resourceGroup.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this.domNode = dom.$('.chat-generated-image-result', undefined, resourceGroup.domNode);
		const hasMultipleGeneratedImages = getGeneratedImageResultCount(context.content) > 1;
		this.domNode.classList.toggle('multiple', hasMultipleGeneratedImages);
	}
}
