/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProgressBar } from '../../../../../../../base/browser/ui/progressbar/progressbar.js';
import { IMarkdownString } from '../../../../../../../base/common/htmlContent.js';
import { Lazy } from '../../../../../../../base/common/lazy.js';
import { toDisposable } from '../../../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../../../base/common/observable.js';
import { ILanguageService } from '../../../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../../../editor/common/services/model.js';
import { IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../../../platform/instantiation/common/instantiation.js';
import { ChatConfiguration } from '../../../../common/constants.js';
import { IChatSimpleToolInvocationData, IChatToolInvocation, IChatToolInvocationSerialized } from '../../../../common/chatService/chatService.js';
import { IChatCodeBlockInfo } from '../../../chat.js';
import { IChatContentPartRenderContext } from '../chatContentParts.js';
import { ChatCollapsibleInputOutputContentPart, ChatCollapsibleIOPart, IChatCollapsibleIOCodePart } from '../chatToolInputOutputContentPart.js';
import { BaseChatToolInvocationSubPart } from './chatToolInvocationSubPart.js';
import { getToolApprovalMessage } from './chatToolPartUtilities.js';

export class ChatSimpleToolProgressPart extends BaseChatToolInvocationSubPart {
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
		data: IChatSimpleToolInvocationData,
		isError: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IModelService modelService: IModelService,
		@ILanguageService languageService: ILanguageService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(toolInvocation);

		let codeBlockIndex = codeBlockStartIndex;

		// Helper to convert string or MarkdownString to a collapsible part
		const createIOPart = (content: string, label: string): IChatCollapsibleIOCodePart | ChatCollapsibleIOPart => {
			return {
				kind: 'code',
				data: content,
				languageId: 'plaintext',
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
			};
		};

		const inputPart = createIOPart(data.input, 'Input') as IChatCollapsibleIOCodePart;
		const outputParts = data.output ? [createIOPart(data.output, 'Output')] : undefined;

		const collapsibleListPart = this.collapsibleListPart = this._register(instantiationService.createInstance(
			ChatCollapsibleInputOutputContentPart,
			message,
			subtitle,
			this.getAutoApprovalMessageContent(),
			context,
			inputPart,
			outputParts ? { parts: outputParts } : undefined,
			isError,
			// Expand by default when there's an error (if setting enabled),
			// otherwise use the stored expanded state (defaulting to false)
			(isError && configurationService.getValue<boolean>(ChatConfiguration.AutoExpandToolFailures)) ||
			(ChatSimpleToolProgressPart._expandedByDefault.get(toolInvocation) ?? false),
		));
		this._register(toDisposable(() => ChatSimpleToolProgressPart._expandedByDefault.set(toolInvocation, collapsibleListPart.expanded)));

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

	private getAutoApprovalMessageContent() {
		return getToolApprovalMessage(this.toolInvocation);
	}
}
