/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assertNever } from '../../../../../../base/common/assert.js';
import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { IMarkdownString } from '../../../../../../base/common/htmlContent.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../base/common/observable.js';
import { ILanguageService } from '../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IChatToolInvocation, IChatToolInvocationSerialized } from '../../../common/chatService.js';
import { IToolResultInputOutputDetails } from '../../../common/languageModelToolsService.js';
import { IChatCodeBlockInfo } from '../../chat.js';
import { getAttachableImageExtension } from '../../chatAttachmentResolve.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { EditorPool } from '../chatMarkdownContentPart.js';
import { ChatCollapsibleInputOutputContentPart, IChatCollapsibleIOCodePart, IChatCollapsibleIODataPart } from '../chatToolInputOutputContentPart.js';
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
			processedOutput = [{ type: 'text', value: output }];
		}

		const collapsibleListPart = this._register(instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			message,
			subtitle,
			context,
			editorPool,
			toCodePart(input),
			processedOutput && {
				parts: processedOutput.map((o): IChatCollapsibleIODataPart | IChatCollapsibleIOCodePart => {
					if (o.type === 'data') {
						const decoded = decodeBase64(o.value64).buffer;
						if (getAttachableImageExtension(o.mimeType)) {
							return { kind: 'data', value: decoded, mimeType: o.mimeType };
						} else {
							return toCodePart(localize('toolResultData', "Data of type {0} ({1} bytes)", o.mimeType, decoded.byteLength));
						}
					} else if (o.type === 'text') {
						return toCodePart(o.value);
					} else {
						assertNever(o);
					}
				}),
			},
			isError,
			ChatInputOutputMarkdownProgressPart._expandedByDefault.get(toolInvocation) ?? false,
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
