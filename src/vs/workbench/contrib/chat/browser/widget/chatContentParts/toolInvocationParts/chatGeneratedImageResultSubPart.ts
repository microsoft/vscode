/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { ResourceMap } from '../../../../../../../base/common/map.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { getChatImageResourceComparisonKey, getToolResultImageResources } from '../../../../common/chatImageExtraction.js';
import { IChatProgressResponseContent } from '../../../../common/model/chatModel.js';
import { IChatRendererContent } from '../../../../common/model/chatViewModel.js';
import { isToolResultInputOutputDetails, type IToolResultInputOutputDetails } from '../../../../common/tools/languageModelToolsService.js';
import { type IChatCodeBlockInfo } from '../../../chat.js';
import { IChatImageRevealOrigin } from '../../../attachments/chatImageReveal.js';
import { type IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatResourceGroupWidget } from '../chatResourceGroupWidget.js';
import { type IChatCollapsibleIODataPart } from '../chatToolInputOutputContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export function getGeneratedImageResultParts(
	details: IToolResultInputOutputDetails | undefined,
	sessionResource: URI,
	toolCallId: string,
): IChatCollapsibleIODataPart[] {
	return getToolResultImageResources(details, sessionResource, toolCallId, 'generated-image').map(image => ({
		kind: 'data',
		uri: image.uri,
		name: image.name,
		mimeType: image.mimeType,
		...(image.base64Value !== undefined ? { base64Value: image.base64Value } : {}),
		audience: image.audience,
	}));
}

function getGeneratedImageResultDetails(toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized): IToolResultInputOutputDetails | undefined {
	const resultDetails = toolInvocation.kind === 'toolInvocation'
		? IChatToolInvocation.resultDetails(toolInvocation)
		: toolInvocation.resultDetails;
	return isToolResultInputOutputDetails(resultDetails) ? resultDetails : undefined;
}

/** Collects completed top-level image results for the response gallery, excluding subagent tools. */
export function getGeneratedImageResultSnapshot(content: ReadonlyArray<IChatRendererContent | IChatProgressResponseContent>): { readonly toolCallId: string; readonly details: IToolResultInputOutputDetails }[] {
	const results: { toolCallId: string; details: IToolResultInputOutputDetails }[] = [];
	for (const part of content) {
		if ((part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') || part.subAgentInvocationId || part.toolSpecificData?.kind !== 'generatedImage' || !IChatToolInvocation.isComplete(part)) {
			continue;
		}
		const details = getGeneratedImageResultDetails(part);
		if (details) {
			results.push({ toolCallId: part.toolCallId, details });
		}
	}
	return results;
}

export function getLastGeneratedImageToolCallId(content: ReadonlyArray<IChatRendererContent>): string | undefined {
	const lastImageTool = content.findLast(part =>
		(part.kind === 'toolInvocation' || part.kind === 'toolInvocationSerialized')
		&& !part.subAgentInvocationId
		&& part.toolSpecificData?.kind === 'generatedImage'
		&& IChatToolInvocation.isComplete(part));
	return lastImageTool?.kind === 'toolInvocation' || lastImageTool?.kind === 'toolInvocationSerialized'
		? lastImageTool.toolCallId
		: undefined;
}

export function getGeneratedImageResultCount(content: ReadonlyArray<IChatRendererContent>, subAgentInvocationId?: string): number {
	let count = 0;
	for (const part of content) {
		if ((part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') || part.subAgentInvocationId !== subAgentInvocationId || part.toolSpecificData?.kind !== 'generatedImage') {
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
	for (const { toolCallId, details } of getGeneratedImageResultSnapshot(content)) {
		parts.push(...getGeneratedImageResultParts(details, sessionResource, toolCallId));
	}
	return parts;
}

/** Renders generated images as response outcomes using the shared image preview affordances. */
export class ChatGeneratedImageResultSubPart extends BaseChatToolInvocationSubPart {
	private static readonly imageDimensions = new WeakMap<IChatContentPartRenderContext['element'], ResourceMap<dom.IDimension>>();

	public readonly domNode: HTMLElement;
	public readonly codeblocks: IChatCodeBlockInfo[] = [];
	private readonly _onDidChangeHeight = this._register(new Emitter<void>());
	public readonly onDidChangeHeight = this._onDidChangeHeight.event;

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		imageReveal: IChatImageRevealOrigin | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(toolInvocation);
		this.domNode = dom.$('.chat-generated-image-tool-result');

		if (!toolInvocation.subAgentInvocationId && getLastGeneratedImageToolCallId(context.content) !== toolInvocation.toolCallId) {
			return;
		}

		// Child tools retain their own results rather than claiming the response-level gallery.
		const parts = toolInvocation.subAgentInvocationId
			? getGeneratedImageResultParts(getGeneratedImageResultDetails(toolInvocation), context.element.sessionResource, toolInvocation.toolCallId)
			: getGeneratedImageResultPartsFromContent(context.content, context.element.sessionResource);
		let imageDimensions = ChatGeneratedImageResultSubPart.imageDimensions.get(context.element);
		if (!imageDimensions) {
			imageDimensions = new ResourceMap<dom.IDimension>(getChatImageResourceComparisonKey);
			ChatGeneratedImageResultSubPart.imageDimensions.set(context.element, imageDimensions);
		}
		const resourceGroup = this._register(instantiationService.createInstance(ChatResourceGroupWidget, parts, {
			showImageInHover: false,
			imagePresentation: 'inline',
			imageReveal: parts.length === 1 ? imageReveal : undefined,
			imageDimensions,
		}));
		this._register(resourceGroup.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		const gallery = dom.append(this.domNode, dom.$('.chat-generated-image-result', undefined, resourceGroup.domNode));
		gallery.classList.toggle('multiple', parts.length > 1);
	}
}
