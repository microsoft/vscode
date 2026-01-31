/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressBar } from '../../../../../../../base/browser/ui/progressbar/progressbar.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../../../base/common/lazy.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { getExtensionForMimeType } from '../../../../../../../base/common/mime.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { basename } from '../../../../../../../base/common/resources.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { ChatResponseResource } from '../../../../common/model/chatModel.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IToolResultInputOutputDetails } from '../../../../common/tools/languageModelToolsService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatCollapsibleInputOutputContentPart, ChatCollapsibleIOPart, IChatCollapsibleIOCodePart } from '../chatToolInputOutputContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { getToolApprovalMessage } from './chatToolPartUtilities.js';

export class ChatInputOutputMarkdownProgressPart extends BaseChatToolInvocationSubPart {
	/** Remembers expanded tool parts on re-render */
	private static readonly _expandedByDefault = new WeakMap<IChatToolInvocation | IChatToolInvocationSerialized, boolean>();

	public readonly domNode: HTMLElement;
	private readonly collapsibleListPart: ChatCollapsibleInputOutputContentPart;

	public get codeblocks(): IChatCodeBlockInfo[] {
		return this.collapsibleListPart.codeblocks;
	}

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		codeBlockStartIndex: number,
		message: string | IMarkdownString,
		subtitle: string | IMarkdownString | undefined,
		input: string,
		output: IToolResultInputOutputDetails['output'] | undefined,
		isError: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(toolInvocation);

		let codeBlockIndex = codeBlockStartIndex;

		// Simple factory to create code part data objects
		const createCodePart = (data: string): IChatCollapsibleIOCodePart => ({
			kind: 'code',
			data,
			languageId: 'json',
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

		let processedOutput = output;
		if (typeof output === 'string') { // back compat with older stored versions
			processedOutput = [{ type: 'embed', value: output, isText: true }];
		}

		const collapsibleListPart = this.collapsibleListPart = this._register(instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			message,
			subtitle,
			this.getAutoApproveMessageContent(),
			context,
			createCodePart(input),
			processedOutput && processedOutput.length > 0 ? {
				parts: processedOutput.map((o, i): ChatCollapsibleIOPart => {
					const permalinkBasename = o.type === 'ref' || o.uri
						? basename(o.uri!)
						: o.mimeType && getExtensionForMimeType(o.mimeType)
							? `file${getExtensionForMimeType(o.mimeType)}`
							: 'file' + (o.isText ? '.txt' : '.bin');


					if (o.type === 'ref') {
						return { kind: 'data', uri: o.uri, mimeType: o.mimeType };
					} else if (o.isText && !o.asResource) {
						return createCodePart(o.value);
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
			// Expand by default when there's an error (if setting enabled),
			// otherwise use the stored expanded state (defaulting to false)
			(isError && configurationService.getValue<boolean>(ChatConfiguration.AutoExpandToolFailures)) ||
			(ChatInputOutputMarkdownProgressPart._expandedByDefault.get(toolInvocation) ?? false),
		));
		this._register(toDisposable(() => ChatInputOutputMarkdownProgressPart._expandedByDefault.set(toolInvocation, collapsibleListPart.expanded)));

		const progressObservable = toolInvocation.kind === 'toolInvocation' ? toolInvocation.state.map((s, r) => s.type === IChatToolInvocation.StateKind.Executing ? s.progress.read(r) : undefined) : undefined;
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

	private getAutoApproveMessageContent() {
		return getToolApprovalMessage(this.toolInvocation);
	}
}
