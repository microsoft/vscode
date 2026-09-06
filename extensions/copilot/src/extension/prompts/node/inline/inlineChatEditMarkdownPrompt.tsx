/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
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
import { MarkdownBlock } from './inlineChatGenerateMarkdownPrompt';
import { SummarizedDocumentSplit } from './promptingSummarizedDocument';

export interface InlineChatEditMarkdownPromptProps extends GenericInlinePromptProps {
}

export class InlineChatEditMarkdownPrompt extends PromptElement<InlineChatEditMarkdownPromptProps> {

	constructor(
		props: InlineChatEditMarkdownPromptProps,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const context = this.props.documentContext;
		const document = context.document;
		const languageId = document.languageId;

		if (isNotebookCellOrNotebookChatInput(this.props.documentContext.document.uri)) {
			throw illegalArgument('InlineChatEditMarkdownPrompt should not be used with a notebook!');
		}

		if (languageId !== 'markdown') {
			throw illegalArgument('InlineChatEditMarkdownPrompt should only be used with markdown documents!');
		}

		const isIgnored = await this._ignoreService.isCopilotIgnored(context.document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[this.props.documentContext.document.uri]} />;
		}

		const data = await this._instantiationService.invokeFunction(SummarizedDocumentData.create,
			document,
			context.fileIndentInfo,
			context.wholeRange,
			SelectionSplitKind.Adjusted
		);

		const { query, history, chatVariables, } = this.props.promptContext;

		// const summarizedDocument = await createPromptingSummarizedDocument(
		// 	this._parserService,
		// 	context.document,
		// 	context.fileIndentInfo,
		// 	context.document.validateRange(context.wholeRange),
		// 	sizing.endpoint.modelMaxPromptTokens / 3 // consume one 3rd of the model window
		// );

		// const splitDoc = summarizedDocument.splitAroundAdjustedSelection();
		// const { codeAbove, codeSelected, codeBelow, hasCodeWithoutSelection } = splitDoc;
		// const placeHolder = '$SELECTION_PLACEHOLDER$';
		// const codeWithoutSelection = `${codeAbove}${placeHolder}${codeBelow}`;
		const replyInterpreterFn = (splitDoc: SummarizedDocumentSplit) => splitDoc.createReplyInterpreter(
			LeadingMarkdownStreaming.Mute,
			EarlyStopping.None,
			splitDoc.replaceSelectionStreaming,
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
					The user needs help to modify some markdown content.<br />
					<LegacySafetyRules />
				</SystemMessage>
				<HistoryWithInstructions inline={true} historyPriority={700} passPriority history={history}>
					<InstructionMessage priority={1000}>
						The markdown is always delimited by {MarkdownBlock.FenceSequence}.<br />
						Your answer must begin and end with {MarkdownBlock.FenceSequence}.<br />
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage priority={725}>
					<CustomInstructions languageId={languageId} chatVariables={chatVariables} />
				</UserMessage>
				<ChatToolReferences priority={750} promptContext={this.props.promptContext} flexGrow={1} embeddedInsideUserMessage={false} />
				<ChatVariables priority={750} chatVariables={chatVariables} embeddedInsideUserMessage={false} />
				<UserMessage priority={900}
					flexGrow={2}
					flexReserve={sizing.endpoint.modelMaxPromptTokens / 3}>
					<SummarizedDocumentWithSelection
						documentData={data}
						createReplyInterpreter={replyInterpreterFn}
						tokenBudget={'usePromptSizingBudget'}
					/>
					<Tag name='userPrompt'>
						<UserQuery chatVariables={chatVariables} query={query} /><br />
						The rewritten markdown content that would fit at {data.placeholderText} wrapped with {MarkdownBlock.FenceSequence} is:
					</Tag>
				</UserMessage>
			</>
		);
	}
}
