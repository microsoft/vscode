/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { Emitter } from '../../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { getExtensionForMimeType } from '../../../../../../../base/common/mime.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { localize } from '../../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { IMarkdownRenderer } from '../../../../../../../platform/markdown/browser/markdownRenderer.js';
import { ChatErrorLevel, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { ChatResponseResource } from '../../../../common/model/chatModel.js';
import { IChatRendererContent } from '../../../../common/model/chatViewModel.js';
import { isToolResultInputOutputDetails, type IToolResultInputOutputDetails } from '../../../../common/tools/languageModelToolsService.js';
import { type IChatCodeBlockInfo } from '../../../chat.js';
import { type IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatErrorWidget } from '../chatErrorContentPart.js';
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
		if (!isImageOutput(output)) {
			continue;
		}
		if (output.type === 'ref') {
			parts.push({ kind: 'data', uri: output.uri, mimeType: output.mimeType, audience: output.audience });
			continue;
		}
		const extension = getExtensionForMimeType(output.mimeType) ?? '';
		const uri = ChatResponseResource.createUri(sessionResource, toolCallId, index, `generated-image${extension}`);
		parts.push({ kind: 'data', base64Value: output.value, mimeType: output.mimeType, uri, audience: output.audience });
	}
	return parts;
}

function getGeneratedImageResultDetails(toolInvocation: IChatRendererContent): IToolResultInputOutputDetails | undefined {
	if ((toolInvocation.kind !== 'toolInvocation' && toolInvocation.kind !== 'toolInvocationSerialized') || toolInvocation.toolSpecificData?.kind !== 'generatedImage') {
		return undefined;
	}
	const resultDetails = toolInvocation.kind === 'toolInvocation'
		? IChatToolInvocation.resultDetails(toolInvocation)
		: toolInvocation.resultDetails;
	return isToolResultInputOutputDetails(resultDetails) ? resultDetails : undefined;
}

function isImageOutput(output: IToolResultInputOutputDetails['output'][number]): output is IToolResultInputOutputDetails['output'][number] & { mimeType: string } {
	return !!output.mimeType?.startsWith('image/') && (output.type === 'ref' || !output.isText && !!output.value);
}

export function hasGeneratedImageResult(part: IChatRendererContent): boolean {
	return getGeneratedImageResultDetails(part)?.output.some(isImageOutput) ?? false;
}

export function getGeneratedImageResults(
	content: ReadonlyArray<IChatRendererContent>,
	sessionResource: URI,
): { parts: IChatCollapsibleIODataPart[]; errors: string[] } {
	const parts: IChatCollapsibleIODataPart[] = [];
	const errors: string[] = [];
	for (const part of content) {
		if ((part.kind !== 'toolInvocation' && part.kind !== 'toolInvocationSerialized') || part.toolSpecificData?.kind !== 'generatedImage') {
			continue;
		}
		const details = getGeneratedImageResultDetails(part);
		const images = getGeneratedImageResultParts(details, sessionResource, part.toolCallId);
		parts.push(...images);
		if (images.length && details?.isError) {
			const message = typeof part.pastTenseMessage === 'string' ? part.pastTenseMessage : part.pastTenseMessage?.value;
			errors.push(message || localize('generatedImage.error', "The image was generated, but the tool reported an error."));
		}
	}
	if (parts.length < 2) {
		return { parts, errors };
	}
	return {
		errors, parts: parts.map((part, index) => ({
			...part,
			// Distinguish each attachment in the gallery's visible and accessible labels.
			uri: part.uri.with({ path: part.uri.path.replace(/generated-image(?=\.[^/]+$|$)/, `generated-image-${index + 1}`) }),
		}))
	};
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
		renderer: IMarkdownRenderer,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super(toolInvocation);
		const { parts, errors } = getGeneratedImageResults(context.content, context.element.sessionResource);
		const resourceGroup = this._register(instantiationService.createInstance(ChatResourceGroupWidget, parts, { showImageInHover: false }));
		this._register(resourceGroup.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this.domNode = dom.$('.chat-generated-image-result', undefined, resourceGroup.domNode);
		for (const message of errors) {
			const error = this._register(new ChatErrorWidget(ChatErrorLevel.Error,
				new MarkdownString().appendText(message), renderer));
			this.domNode.appendChild(error.domNode);
		}
		this.domNode.classList.toggle('multiple', parts.length > 1);
	}
}
