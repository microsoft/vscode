/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { getExtensionForMimeType } from '../../../../../../base/common/mime.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { basename } from '../../../../../../base/common/resources.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ChatResponseResource } from '../../../common/chatModel.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { isResponseVM } from '../../../common/chatViewModel.js';
import { IToolResultInputOutputDetails } from '../../../common/languageModelToolsService.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { EditorPool } from '../chatMarkdownContentPart.js';
import { ChatCollapsibleInputOutputContentPart, ChatCollapsibleIOPart, IChatCollapsibleIOCodePart } from '../chatToolInputOutputContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';

export class ChatInputOutputMarkdownProgressPart extends BaseChatToolInvocationSubPart {
	/** Remembers expanded tool parts on re-render */
	private static readonly _expandedByDefault = new WeakMap<IChatToolInvocation | IChatToolInvocationSerialized, boolean>();

	public readonly domNode: HTMLElement;

	private _codeblocks: IChatCodeBlockInfo[] = [];
	public get codeblocks(): IChatCodeBlockInfo[] {
		return this._codeblocks;
	}

	constructor(
		toolInvocation: IChatToolInvocation | IChatToolInvocationSerialized,
		context: IChatContentPartRenderContext,
		editorPool: EditorPool,
		codeBlockStartIndex: number,
		message: string | IMarkdownString,
		subtitle: string | IMarkdownString | undefined,
		input: string,
		output: IToolResultInputOutputDetails['output'] | undefined,
		isError: boolean,
		currentWidthDelegate: () => number,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
	) {
		super(toolInvocation);

		let codeBlockIndex = codeBlockStartIndex;
		const toCodePart = (data: string): IChatCollapsibleIOCodePart => {
			const model = this._register(modelService.createModel(
				data,
				languageService.createById('json'),
				undefined,
				true
			));

			return {
				kind: 'code',
				textModel: model,
				languageId: model.getLanguageId(),
				options: {
					hideToolbar: true,
					reserveWidth: 19,
					maxHeightInLines: 13,
					verticalPadding: 5,
					editorOptions: {
						wordWrap: 'on'
					}
				},
				codeBlockInfo: {
					codeBlockIndex: codeBlockIndex++,
					codemapperUri: undefined,
					elementId: context.element.id,
					focus: () => { },
					isStreaming: false,
					ownerMarkdownPartId: this.codeblocksPartId,
					uri: model.uri,
					chatSessionId: context.element.sessionId,
					uriPromise: Promise.resolve(model.uri)
				}
			};
		};

		let processedOutput = output;
		if (typeof output === 'string') { // back compat with older stored versions
			processedOutput = [{ type: 'embed', value: output, isText: true }];
		}

		const requestId = isResponseVM(context.element) ? context.element.requestId : context.element.id;
		const collapsibleListPart = this._register(instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			message,
			subtitle,
			context,
			editorPool,
			toCodePart(input),
			processedOutput && {
				parts: processedOutput.map((o, i): ChatCollapsibleIOPart => {
					const permalinkBasename = o.type === 'ref' || o.uri
						? basename(o.uri!)
						: o.mimeType && getExtensionForMimeType(o.mimeType)
							? `file${getExtensionForMimeType(o.mimeType)}`
							: 'file' + (o.isText ? '.txt' : '.bin');


					if (o.type === 'ref') {
						return { kind: 'data', uri: o.uri, mimeType: o.mimeType };
					} else if (o.isText && !o.asResource) {
						return toCodePart(o.value);
					} else {
						let decoded: Uint8Array | undefined;
						try {
							if (!o.isText) {
								decoded = decodeBase64(o.value).buffer;
							}
						} catch {
							// ignored
						}

						// Fall back to text if it's not valid base64
						const permalinkUri = ChatResponseResource.createUri(context.element.sessionId, requestId, toolInvocation.toolCallId, i, permalinkBasename);
						return { kind: 'data', value: decoded || new TextEncoder().encode(o.value), mimeType: o.mimeType, uri: permalinkUri };
					}
				}),
			},
			isError,
			ChatInputOutputMarkdownProgressPart._expandedByDefault.get(toolInvocation) ?? false,
			currentWidthDelegate(),
		));
		this._codeblocks.push(...collapsibleListPart.codeblocks);
		this._register(collapsibleListPart.onDidChangeHeight(() => this._onDidChangeHeight.fire()));
		this._register(toDisposable(() => ChatInputOutputMarkdownProgressPart._expandedByDefault.set(toolInvocation, collapsibleListPart.expanded)));

		const progressObservable = toolInvocation.kind === 'toolInvocation' ? toolInvocation.progress : undefined;
		if (progressObservable) {
			this._register(autorun(reader => {
				const progress = progressObservable?.read(reader);
				if (progress.message) {
					collapsibleListPart.title = progress.message;
				}
			}));
		}

		this.domNode = collapsibleListPart.domNode;
	}
}
