/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptReference, PromptSizing, SystemMessage, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { isNotebookCellOrNotebookChatInput } from '../../../../util/common/notebooks';
import { illegalArgument } from '../../../../util/vs/base/common/errors';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { GenericInlinePromptProps } from '../../../context/node/resolvers/genericInlineIntentInvocation';
import { SelectionSplitKind, SummarizedDocumentData, SummarizedDocumentWithSelection } from '../../../intents/node/testIntent/summarizedDocumentWithSelection';
import { EarlyStopping, LeadingMarkdownStreaming } from '../../../prompt/node/intents';
import { TextPieceClassifiers } from '../../../prompt/node/streamingEdits';
import { InstructionMessage } from '../base/instructionMessage';
import { LegacySafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { ChatToolReferences, ChatVariables, UserQuery } from '../panel/chatVariables';
import { HistoryWithInstructions } from '../panel/conversationHistory';
import { CustomInstructions } from '../panel/customInstructions';
import { SafePromptElement } from '../panel/safeElements';
import { SummarizedDocumentSplit } from './promptingSummarizedDocument';

export interface InlineChatGenerateMarkdownPromptProps extends GenericInlinePromptProps {
}

export class InlineChatGenerateMarkdownPrompt extends PromptElement<InlineChatGenerateMarkdownPromptProps> {

	constructor(
		props: InlineChatGenerateMarkdownPromptProps,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const context = this.props.documentContext;
		const document = context.document;
		const languageId = document.languageId;

		if (isNotebookCellOrNotebookChatInput(this.props.documentContext.document.uri)) {
			throw illegalArgument('InlineChatGenerateMarkdownPrompt should not be used with a notebook!');
		}

		if (languageId !== 'markdown') {
			throw illegalArgument('InlineChatGenerateMarkdownPrompt should only be used with markdown documents!');
		}

		const isIgnored = await this._ignoreService.isCopilotIgnored(context.document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[this.props.documentContext.document.uri]} />;
		}

		const { query, history, chatVariables, } = this.props.promptContext;

		const data = await this._instantiationService.invokeFunction(
			SummarizedDocumentData.create,
			context.document,
			context.fileIndentInfo,
			context.wholeRange,
			SelectionSplitKind.OriginalEnd
		);

		const replyInterpreterFn = (splitDoc: SummarizedDocumentSplit) => splitDoc.createReplyInterpreter(
			LeadingMarkdownStreaming.Mute,
			EarlyStopping.None,
			splitDoc.insertStreaming,
			TextPieceClassifiers.createFencedBlockClassifier(MarkdownBlock.FenceSequence),
			line => line.value.trim() !== data.placeholderText
		);

		return (
			<>
				{/* <meta value={new ReplyInterpreterMetaData(replyInterpreter)} /> */}
				<SystemMessage priority={1000}>
					You are an AI programming assistant.<br />
					When asked for your name, you must respond with "GitHub Copilot".<br />
					You are a world class markdown editor, very well versed in programming.<br />
					<LegacySafetyRules />
				</SystemMessage>
				<HistoryWithInstructions inline={true} historyPriority={700} passPriority history={history}>
					<InstructionMessage priority={1000}>
						The user needs help to write some new markdown.<br />
						The markdown is always delimited by {MarkdownBlock.FenceSequence}.<br />
						{data.hasContent && <>The user includes existing markdown and marks with {data.placeholderText} where the new code should go.<br /></>}
						{data.hasContent && <>DO NOT include the text "{data.placeholderText}" in your reply.<br /></>}
						{data.hasContent && <>DO NOT repeat any markdown from the user in your reply.<br /></>}
						{!data.hasContent && <>Your answer must begin and end with {MarkdownBlock.FenceSequence}<br /></>}
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage priority={725}>
					<CustomInstructions languageId={languageId} chatVariables={chatVariables} />
				</UserMessage>
				<ChatToolReferences priority={750} promptContext={this.props.promptContext} flexGrow={1} embeddedInsideUserMessage={false} />
				<ChatVariables priority={750} chatVariables={chatVariables} embeddedInsideUserMessage={false} />
				<UserMessage priority={900} flexGrow={2} flexReserve={sizing.endpoint.modelMaxPromptTokens / 3}>
					<SummarizedDocumentWithSelection
						flexGrow={1}
						tokenBudget={'usePromptSizingBudget'}
						documentData={data}
						createReplyInterpreter={replyInterpreterFn}
					/>
					<Tag name='userPrompt'>
						<UserQuery chatVariables={chatVariables} query={query} /><br />
					</Tag>
					{data.hasContent && <>Remember to start and end your answer with {MarkdownBlock.FenceSequence}. The markdown that would fit at {data.placeholderText} is:</>}
				</UserMessage>
			</>
		);
	}
}

export type MarkdownBlockProps = PromptElementProps<{
	uri: vscode.Uri | null;
	code: string;
	references?: PromptReference[];
}>;

export class MarkdownBlock extends SafePromptElement<MarkdownBlockProps> {

	public static FenceSequence = `-+-+-+-+-+`;

	async render(state: void) {
		const isIgnored = this.props.uri ? await this._ignoreService.isCopilotIgnored(this.props.uri) : false;
		if (isIgnored) {
			return this._handleFoulPrompt();
		}
		const fence = MarkdownBlock.FenceSequence;
		const code = `${fence}\n${this.props.code}\n${fence}`;
		return <TextChunk>{code}</TextChunk>;
	}
}
