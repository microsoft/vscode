/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as dom from '../../../../../../../base/browser/dom.js';
import { ProgressBar } from '../../../../../../../base/browser/ui/progressbar/progressbar.js';
import { Codicon } from '../../../../../../../base/common/codicons.js';
import { getDurationString } from '../../../../../../../base/common/date.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../../../base/common/lazy.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { getExtensionForMimeType, Mimes, normalizeMimeType } from '../../../../../../../base/common/mime.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../../../editor/common/languages/modesRegistry.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../../nls.js';
import { ByteSize, IFileService } from '../../../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../../platform/log/common/log.js';
import { ChatResponseResource } from '../../../../common/model/chatModel.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { getToolResultImageResources } from '../../../../common/chatImageExtraction.js';
import { IToolResultInputOutputDetails, ToolInputOutputEmbedded } from '../../../../common/tools/languageModelToolsService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatCollapsibleInputOutputContentPart, ChatCollapsibleIOPart, IChatCollapsibleIOCodePart } from '../chatToolInputOutputContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { getToolApprovalMessage, isImageGenerationToolInvocation, shouldShimmerForTool } from './chatToolPartUtilities.js';

export class ChatInputOutputMarkdownProgressPart extends BaseChatToolInvocationSubPart {
	/** Remembers expanded tool parts on re-render */
	private static readonly _expandedByDefault = new WeakMap<IChatToolInvocation | IChatToolInvocationSerialized, boolean>();

	public readonly domNode: HTMLElement;
	private readonly collapsibleListPart: ChatCollapsibleInputOutputContentPart;

	public set title(message: string | IMarkdownString) {
		this.collapsibleListPart.title = message;
	}

	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.collapsibleListPart.codeblocks;
	}

	public updateInput(input: string): void {
		this.collapsibleListPart.updateInput(input);
	}

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		codeBlockStartIndex: number,
		message: string | IMarkdownString,
		subtitle: string | IMarkdownString | undefined,
		input: string,
		inputLanguage: string | undefined,
		output: IToolResultInputOutputDetails['output'] | undefined,
		isError: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
	) {
		super(toolInvocation);

		let codeBlockIndex = codeBlockStartIndex;
		const isImageGeneration = isImageGenerationToolInvocation(toolInvocation);

		// Simple factory to create code part data objects
		const createCodePart = (data: string, languageId = 'json'): IChatCollapsibleIOCodePart => ({
			kind: 'code',
			data,
			languageId,
			codeBlockIndex: codeBlockIndex++,
			ownerMarkdownPartId: this.codeblocksPartId,
			options: {
				hideToolbar: true,
				reserveWidth: 19,
				maxHeightInLines: 13,
				verticalPadding: 5,
				editorOptions: {
					wordWrap: 'on'
				}
			}
		});

		const getOutputLanguageId = (part: ToolInputOutputEmbedded): string => {
			if (part.mimeType) {
				const mimeType = normalizeMimeType(part.mimeType).split(';', 1)[0].trim();
				if (mimeType === Mimes.markdown) {
					return 'markdown';
				}
				if (mimeType === Mimes.text) {
					return PLAINTEXT_LANGUAGE_ID;
				}
				if (mimeType === 'application/json' || mimeType.endsWith('+json')) {
					return 'json';
				}
				const languageId = languageService.getLanguageIdByMimeType(mimeType);
				if (languageId) {
					return languageId;
				}
			}

			return PLAINTEXT_LANGUAGE_ID;
		};

		let processedOutput = output;
		if (typeof output === 'string') { // back compat with older stored versions
			processedOutput = [{ type: 'embed', value: output, isText: true }];
		}
		const generatedImages = isImageGeneration && processedOutput
			? getToolResultImageResources({ input, output: processedOutput }, context.element.sessionResource, toolInvocation.toolCallId, 'generated-image')
			: [];
		const generatedImagesByIndex = new Map(generatedImages.map(image => [image.index, image]));

		const collapsibleListPart = this.collapsibleListPart = this._register(instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			message,
			subtitle,
			this.getAutoApproveMessageContent(),
			context,
			createCodePart(input, inputLanguage),
			processedOutput && processedOutput.length > 0 ? {
				showCollapsedResources: !isImageGeneration,
				renderMetadata: isImageGeneration && IChatToolInvocation.isComplete(toolInvocation)
					? container => this.renderImageMetadata(container, generatedImages)
					: undefined,
				parts: processedOutput.map((o, i): ChatCollapsibleIOPart => {
					const image = generatedImagesByIndex.get(i);
					if (image) {
						return { kind: 'data', uri: image.uri, name: image.name, mimeType: image.mimeType, base64Value: image.base64Value, audience: image.audience };
					}
					const permalinkBasename = o.type === 'ref' || o.uri
						? basename(o.uri!)
						: o.mimeType && getExtensionForMimeType(o.mimeType)
							? `file${getExtensionForMimeType(o.mimeType)}`
							: 'file' + (o.isText ? '.txt' : '.bin');


					if (o.type === 'ref') {
						return { kind: 'data', uri: o.uri, mimeType: o.mimeType };
					} else if (o.isText && !o.asResource) {
						return createCodePart(o.value, getOutputLanguageId(o));
					} else {
						// Defer base64 decoding to avoid expensive decode during scroll.
						// The value will be decoded lazily in ChatToolOutputContentSubPart.
						const permalinkUri = ChatResponseResource.createUri(context.element.sessionResource, toolInvocation.toolCallId, i, permalinkBasename);
						if (!o.isText) {
							// Pass base64 string for lazy decoding
							return { kind: 'data', base64Value: o.value, mimeType: o.mimeType, uri: permalinkUri, audience: o.audience };
						} else {
							// Text content: encode immediately since it's not expensive
							return { kind: 'data', value: new TextEncoder().encode(o.value), mimeType: o.mimeType, uri: permalinkUri, audience: o.audience };
						}
					}
				}),
			} : undefined,
			isError,
			ChatInputOutputMarkdownProgressPart._expandedByDefault.get(toolInvocation) ?? false,
			shouldShimmerForTool(toolInvocation, message),
			isImageGeneration ? Codicon.fileMedia : undefined,
		));
		this._register(toDisposable(() => ChatInputOutputMarkdownProgressPart._expandedByDefault.set(toolInvocation, collapsibleListPart.expanded)));

		const progressObservable = toolInvocation.kind === 'toolInvocation' && !isImageGeneration ? toolInvocation.state.map((s, r) => s.type === IChatToolInvocation.StateKind.Executing ? s.progress.read(r) : undefined) : undefined;
		const progressBar = new Lazy(() => this._register(new ProgressBar(collapsibleListPart.domNode)));
		if (progressObservable) {
			this._register(autorun(reader => {
				const progress = progressObservable?.read(reader);
				if (progress?.message) {
					collapsibleListPart.title = progress.message;
				}
				if (progress?.progress && !IChatToolInvocation.isComplete(toolInvocation, reader)) {
					progressBar.value.setWorked(progress.progress * 100);
				}
			}));
		}

		this.domNode = collapsibleListPart.domNode;
	}

	private renderImageMetadata(container: HTMLElement, images: ReturnType<typeof getToolResultImageResources>): IDisposable {
		const store = new DisposableStore();
		const metadata = dom.append(container, dom.$('dl.chat-tool-output-metadata'));
		const addField = (label: string, value?: string) => {
			const field = dom.append(metadata, dom.$('div.chat-tool-output-metadata-field'));
			dom.append(field, dom.$('dt', undefined, label));
			const content = dom.append(field, dom.$('dd', undefined, value ?? '-'));
			if (value === undefined) {
				content.setAttribute('aria-label', localize('chat.imageGeneration.notReported', "Not reported"));
			}
			return content;
		};
		const duration = this.toolInvocation.toolSpecificData?.kind === 'generatedImage' ? this.toolInvocation.toolSpecificData.durationMs : undefined;
		addField(localize('chat.imageGeneration.duration', "Duration"), duration !== undefined && Number.isFinite(duration) && duration >= 0
			? getDurationString(duration < 1000 ? Math.round(duration) : Math.round(duration / 100) * 100)
			: undefined);
		const size = addField(localize('chat.imageGeneration.imageSize', "Image size"));
		addField(localize('chat.imageGeneration.tokens', "Tokens"));
		store.add(toDisposable(() => metadata.remove()));
		const setSize = (lengths: readonly number[]) => {
			size.textContent = ByteSize.formatSize(lengths.reduce((total, length) => total + length, 0));
			size.removeAttribute('aria-label');
		};
		if (images.length > 0) {
			if (images.every(image => image.byteLength !== undefined)) {
				setSize(images.map(image => image.byteLength!));
			} else {
				void (async () => {
					try {
						const lengths = await Promise.all(images.map(async image =>
							image.byteLength ?? (await this.fileService.readFile(image.uri)).value.byteLength));
						if (!store.isDisposed) {
							setSize(lengths);
						}
					} catch (error) {
						this.logService.warn('[ChatInputOutputMarkdownProgressPart] Could not read generated image size', error);
						if (!store.isDisposed) {
							size.textContent = localize('chat.imageGeneration.sizeUnavailable', "Unavailable");
							size.removeAttribute('aria-label');
						}
					}
				})();
			}
		}
		return store;
	}

	private getAutoApproveMessageContent() {
		return getToolApprovalMessage(this.toolInvocation);
	}
}
