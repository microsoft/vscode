/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptElementProps, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IResponsePart } from '../../../../platform/chat/common/chatMLFetcher';
import { ChatLocation } from '../../../../platform/chat/common/commonTypes';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { isNotebookCellOrNotebookChatInput } from '../../../../util/common/notebooks';
import { CancellationToken } from '../../../../util/vs/base/common/cancellation';
import { illegalArgument } from '../../../../util/vs/base/common/errors';
import { assertType } from '../../../../util/vs/base/common/types';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { IIntentInvocation, IResponseProcessorContext, ReplyInterpreter, ReplyInterpreterMetaData } from '../../../prompt/node/intents';
import { Test2Impl } from '../../../prompt/node/test2Impl';
import { CopilotIdentityRules } from '../../../prompts/node/base/copilotIdentity';
import { InstructionMessage } from '../../../prompts/node/base/instructionMessage';
import { PromptRenderer } from '../../../prompts/node/base/promptRenderer';
import { SafetyRules } from '../../../prompts/node/base/safetyRules';
import { Tag } from '../../../prompts/node/base/tag';
import { ChatToolReferences, ChatVariables, UserQuery } from '../../../prompts/node/panel/chatVariables';
import { HistoryWithInstructions } from '../../../prompts/node/panel/conversationHistory';
import { CustomInstructions } from '../../../prompts/node/panel/customInstructions';
import { SelectionSplitKind, SummarizedDocumentData, SummarizedDocumentWithSelection } from './summarizedDocumentWithSelection';
import { TestDeps } from './testDeps';
import { TestsIntent } from './testIntent';
import { PseudoStopStartResponseProcessor } from '../../../prompt/node/pseudoStartStopConversationCallback';


/**
 * Invoke from within a test file
 */
export class TestFromTestInvocation implements IIntentInvocation {

	private replyInterpreter: ReplyInterpreter | null = null;

	constructor(
		readonly intent: TestsIntent,
		readonly endpoint: IChatEndpoint,
		readonly location: ChatLocation,
		private readonly context: IDocumentContext,
		private readonly alreadyConsumedChatVariable: vscode.ChatPromptReference | undefined,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
	}

	async buildPrompt(
		promptContext: IBuildPromptContext,
		progress: vscode.Progress<
			vscode.ChatResponseProgressPart | vscode.ChatResponseReferencePart
		>,
		token: vscode.CancellationToken
	) {
		const renderer = PromptRenderer.create(
			this.instantiationService,
			this.endpoint,
			TestFromTestPrompt,
			{
				context: this.context,
				promptContext,
				alreadyConsumedChatVariable: this.alreadyConsumedChatVariable,
			}
		);

		const result = await renderer.render(progress, token);

		this.replyInterpreter = result.metadata.get(ReplyInterpreterMetaData)?.replyInterpreter ?? null;

		return result;
	}

	async processResponse(
		context: IResponseProcessorContext,
		inputStream: AsyncIterable<IResponsePart>,
		outputStream: vscode.ChatResponseStream,
		token: CancellationToken
	): Promise<vscode.ChatResult | void> {

		if (this.location === ChatLocation.Panel) {
			const responseProcessor = this.instantiationService.createInstance(PseudoStopStartResponseProcessor, [], undefined);
			await responseProcessor.processResponse(context, inputStream, outputStream, token);
			return;
		}

		assertType(this.replyInterpreter !== null, 'TestFromTestInvocation should have received replyInterpreter from its prompt element');

		return this.replyInterpreter.processResponse(
			context,
			inputStream,
			outputStream,
			token
		);
	}
}

type Props = PromptElementProps<{
	context: IDocumentContext;
	promptContext: IBuildPromptContext;
	alreadyConsumedChatVariable: vscode.ChatPromptReference | undefined;
}>;

class TestFromTestPrompt extends PromptElement<Props> {

	constructor(
		props: Props,
		@IParserService private readonly parserService: IParserService
	) {
		super(props);
	}

	override async render(_state: void, sizing: PromptSizing) {

		const { history, query, chatVariables, } = this.props.promptContext;
		const { context, alreadyConsumedChatVariable, } = this.props;

		if (isNotebookCellOrNotebookChatInput(context.document.uri)) {
			throw illegalArgument('TestFromTestPrompt should not be used for notebooks');
		}

		const requestAndUserQuery = `Please, generate more tests, taking into account existing tests. ${query}`.trim();

		const data = await SummarizedDocumentData.create(
			this.parserService,
			context.document,
			context.fileIndentInfo,
			context.wholeRange,
			SelectionSplitKind.Adjusted,
		);

		const filteredChatVariables = alreadyConsumedChatVariable === undefined ? chatVariables : chatVariables.filter(v => v.reference !== alreadyConsumedChatVariable);

		return (
			<>
				<SystemMessage priority={1000}>
					You are an AI programming assistant.<br />
					<CopilotIdentityRules /><br />
					<SafetyRules />
				</SystemMessage>
				<HistoryWithInstructions passPriority history={history} historyPriority={700}>
					<InstructionMessage priority={1000}>
						The user has a {context.language.languageId} file opened in a code editor.<br />
						The user includes some code snippets from the file.<br />
						Answer with a single {context.language.languageId} code block.<br />
						Your expertise is strictly limited to software development topics.<br />
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage>
					<TestDeps priority={750} languageId={context.language.languageId} />
					<CustomInstructions chatVariables={filteredChatVariables} priority={725} languageId={context.language.languageId} includeTestGenerationInstructions={true} />

					<ChatToolReferences priority={750} promptContext={this.props.promptContext} flexGrow={1} />
					<ChatVariables priority={750} chatVariables={filteredChatVariables} />

					{/* include summarized source file: */}
					<Test2Impl priority={800} documentContext={context} />
					{/* include summarized test file: */}
					<Tag name='testsFile' priority={900}>
						<SummarizedDocumentWithSelection
							documentData={data}
							tokenBudget={sizing.tokenBudget / 3}
							_allowEmptySelection={true}
						/>{ /* FIXME@ulugbekna: rework summarization to be more intelligent */}
					</Tag>
					<Tag name='userPrompt' priority={900}>
						<UserQuery chatVariables={filteredChatVariables} query={requestAndUserQuery} />
					</Tag>
				</UserMessage>
			</>
		);
	}
}
