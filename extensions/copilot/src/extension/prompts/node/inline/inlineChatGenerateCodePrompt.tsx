/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { KnownSources } from '../../../../platform/languageServer/common/languageContextService';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { isNotebookCellOrNotebookChatInput } from '../../../../util/common/notebooks';
import { illegalArgument } from '../../../../util/vs/base/common/errors';
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
import { ProjectLabels } from '../panel/projectLabels';
import { LanguageServerContextPrompt } from './languageServerContextPrompt';
import { SummarizedDocumentSplit } from './promptingSummarizedDocument';

export interface InlineChatGenerateCodePromptProps extends GenericInlinePromptProps {
}

export class InlineChatGenerateCodePrompt extends PromptElement<InlineChatGenerateCodePromptProps> {

	constructor(
		props: InlineChatGenerateCodePromptProps,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IParserService private readonly _parserService: IParserService,
		@IExperimentationService private readonly _experimentationService: IExperimentationService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		super(props);
	}

	async render(state: void, sizing: PromptSizing) {
		const context = this.props.documentContext;
		const document = context.document;
		const languageId = document.languageId;

		if (isNotebookCellOrNotebookChatInput(document.uri)) {
			throw illegalArgument('InlineChatGenerateCodePrompt should not be used with a notebook!');
		}

		if (languageId === 'markdown') {
			throw illegalArgument('InlineChatGenerateCodePrompt should not be used with a markdown document!');
		}

		const isIgnored = await this._ignoreService.isCopilotIgnored(document.uri);
		if (isIgnored) {
			return <ignoredFiles value={[document.uri]} />;
		}

		const { query, history, chatVariables, } = this.props.promptContext;

		const useProjectLabels = this._configurationService.getExperimentBasedConfig(ConfigKey.Advanced.ProjectLabelsInline, this._experimentationService);

		const data = await SummarizedDocumentData.create(this._parserService, document, context.fileIndentInfo, context.wholeRange, SelectionSplitKind.OriginalEnd);

		const replyInterpreterFn = (splitDoc: SummarizedDocumentSplit) => splitDoc.createReplyInterpreter(
			LeadingMarkdownStreaming.Mute,
			EarlyStopping.StopAfterFirstCodeBlock,
			splitDoc.insertStreaming,
			TextPieceClassifiers.createCodeBlockClassifier(),
			line => line.value.trim() !== data.placeholderText
		);

		return (
			<>
				<SystemMessage priority={1000}>
					You are an AI programming assistant.<br />
					When asked for your name, you must respond with "GitHub Copilot".<br />
					You are a world class expert in programming, and especially good at {languageId}.<br />
					<LegacySafetyRules />
				</SystemMessage >
				<HistoryWithInstructions inline={true} historyPriority={700} history={history} passPriority>
					<InstructionMessage priority={1000}>
						Source code is always contained in ``` blocks.<br />
						The user needs help to write some new code.<br />
						{data.hasContent && <>The user includes existing code and marks with {data.placeholderText} where the new code should go.<br /></>}
						{data.hasContent && <>DO NOT include the text "{data.placeholderText}" in your reply.<br /></>}
						{data.hasContent && <>DO NOT repeat any code from the user in your reply.<br /></>}
						{!data.hasContent && <>Your must generate a code block surrounded with ``` that will be used in a new file<br /></>}
					</InstructionMessage>
				</HistoryWithInstructions>
				{useProjectLabels && <ProjectLabels priority={600} embeddedInsideUserMessage={false} />}
				<UserMessage priority={725}>
					<CustomInstructions languageId={languageId} chatVariables={chatVariables} />
					<LanguageServerContextPrompt priority={700} document={document} position={context.selection.start} requestId={this.props.promptContext.requestId} source={KnownSources.chat} />
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
					{data.hasContent && <>The code that would fit at {data.placeholderText} with ``` is:</>}
				</UserMessage>
			</>
		);
	}
}
