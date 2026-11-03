/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ConfigKey, IConfigurationService } from '../../../../platform/configuration/common/configurationService';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { INotebookService } from '../../../../platform/notebook/common/notebookService';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { isJupyterNotebookUri, isNotebookCellOrNotebookChatInput } from '../../../../util/common/notebooks';
import { illegalArgument } from '../../../../util/vs/base/common/errors';
import { Schemas } from '../../../../util/vs/base/common/network';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { EarlyStopping, LeadingMarkdownStreaming, ReplyInterpreterMetaData } from '../../../prompt/node/intents';
import { TextPieceClassifiers } from '../../../prompt/node/streamingEdits';
import { InstructionMessage } from '../base/instructionMessage';
import { LegacySafetyRules } from '../base/safetyRules';
import { JupyterNotebookRules } from '../notebook/commonPrompts';
import { ChatToolReferences, ChatVariables, UserQuery } from '../panel/chatVariables';
import { HistoryWithInstructions } from '../panel/conversationHistory';
import { CustomInstructions } from '../panel/customInstructions';
import { CodeBlock } from '../panel/safeElements';
import { InlineChatEditCodePromptProps } from './inlineChatEditCodePrompt';
import { promptPriorities } from './inlineChatNotebookCommon';
import { generateSelectionContextInNotebook, InlineChatCustomNotebookCellsContextRenderer, InlineChatCustomNotebookInfoRenderer, InlineChatJupyterNotebookCellsContextRenderer, InlineChatJupyterNotebookCellsContextTagBasedRenderer, InlineChatNotebookBasePromptState, InlineChatNotebookSelectionCommonProps, InlineChatNotebookSelectionState, InlineChatNotebookVariables } from './inlineChatNotebookCommonPromptElements';
import { createPromptingSummarizedDocument } from './promptingSummarizedDocument';

export class InlineChatNotebookGeneratePrompt extends PromptElement<InlineChatEditCodePromptProps, InlineChatNotebookBasePromptState> {
	constructor(
		props: InlineChatEditCodePromptProps,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IParserService private readonly parserService: IParserService,
		@IExperimentationService private readonly experimentationService: IExperimentationService
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing): Promise<InlineChatNotebookBasePromptState> {
		const { documentContext: context } = this.props;
		const isIgnored = await this.ignoreService.isCopilotIgnored(context.document.uri);
		const wholeRange = context.document.validateRange(context.wholeRange);
		const summarizedDocument = await createPromptingSummarizedDocument(
			this.parserService,
			context.document,
			context.fileIndentInfo,
			wholeRange,
			sizing.endpoint.modelMaxPromptTokens / 3 // consume one 3rd of the model window
		);

		const isTagBasedDocumentSummary = this.experimentationService.getTreatmentVariable<boolean>('copilotchat.tagBasedDocumentSummary') ?? false;

		return {
			summarizedDocument,
			isIgnored,
			priorities: promptPriorities,
			tagBasedDocumentSummary: isTagBasedDocumentSummary
		};
	}

	render(state: InlineChatNotebookBasePromptState, sizing: PromptSizing) {
		if (this.props.documentContext.document.uri.scheme !== Schemas.vscodeNotebookCell) {
			throw illegalArgument('InlineChatNotebookBasePrompt should be used only with a notebook!');
		}
		const { query, history, chatVariables } = this.props.promptContext;
		const { language: lang } = this.props.documentContext;
		const extractCodeBlock = lang.languageId !== 'markdown';
		const jupyterNotebook = isJupyterNotebookUri(this.props.documentContext.document.uri);

		const splitDoc = state.summarizedDocument.splitAroundOriginalSelectionEnd();
		const { codeAbove, hasContent, codeBelow } = splitDoc;
		const code = `${codeAbove}$PLACEHOLDER$${codeBelow}`;
		const replyInterpreter = splitDoc.createReplyInterpreter(
			LeadingMarkdownStreaming.Mute,
			extractCodeBlock ? EarlyStopping.StopAfterFirstCodeBlock : EarlyStopping.None,
			splitDoc.insertOrReplaceStreaming,
			extractCodeBlock ? TextPieceClassifiers.createCodeBlockClassifier() : TextPieceClassifiers.createAlwaysInsideCodeBlockClassifier(),
			line => line.value.trim() !== '$PLACEHOLDER$',
		);

		const priorities = state.priorities;
		const tagBasedDocumentSummary = state.tagBasedDocumentSummary;

		return (
			<>
				<meta value={new ReplyInterpreterMetaData(replyInterpreter)} />
				<SystemMessage priority={priorities.core}>
					You are an AI programming assistant.<br />
					When asked for your name, you must respond with "GitHub Copilot".<br />
					You are a world class expert in programming, and especially good at {lang.languageId}.<br />
					Source code is always contained in ``` blocks.<br />
					The user needs help to write some new code.<br />
					<LegacySafetyRules />
				</SystemMessage>
				<HistoryWithInstructions inline={true} historyPriority={priorities.history ?? 700} passPriority history={history}>
					<InstructionMessage priority={priorities.core}>
						{jupyterNotebook &&
							<>
								<JupyterNotebookRules />
								{!tagBasedDocumentSummary && <>When dealing with Jupyter Notebook, do not generate CELL INDEX in the code blocks in your answer, it is only used to help you understand the context.<br /></>}
							</>
						}
						{hasContent && <>The user includes existing code and marks with $PLACEHOLDER$ where the new code should go.<br /></>}
						{hasContent && <>DO NOT include the text "$PLACEHOLDER$" in your reply.<br /></>}
						{hasContent && <>DO NOT repeat any code from the user in your reply.<br /></>}
						{(!hasContent && extractCodeBlock) && <>Your must generate a code block surrounded with ``` that will be used in a new file<br /></>}
						{!extractCodeBlock && <>When generating content for markdown cell, provide the answer directly without any additional introductory text. Ensure that the response is structured in Markdown format to seamlessly integrate into the markdown file.</>}
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage priority={priorities.context}>
					<CustomInstructions languageId={lang.languageId} chatVariables={chatVariables} />
				</UserMessage>
				<ChatToolReferences priority={priorities.context} promptContext={this.props.promptContext} flexGrow={1} embeddedInsideUserMessage={false} />
				<ChatVariables priority={priorities.context} chatVariables={chatVariables} embeddedInsideUserMessage={false} />
				<InlineChatNotebookGenerateSelection documentContext={this.props.documentContext} hasContent={hasContent} code={code} priority={priorities.core} tagBasedDocumentSummary={tagBasedDocumentSummary} />
				<InlineChatNotebookVariables notebookURI={this.props.documentContext.document.uri} priorities={priorities} query={query} />
				<UserMessage priority={priorities.core}>
					<UserQuery chatVariables={chatVariables} query={query} /><br />
					{(hasContent && extractCodeBlock) && <>The code that would fit at $PLACEHOLDER$ with ``` is:</>}
					{(hasContent && !extractCodeBlock) && <>The code that would fit at $PLACEHOLDER$ without ``` is:</>}
				</UserMessage>
			</>
		);
	}
}

interface InlineChatNotebookGenerateSelectionProps extends InlineChatNotebookSelectionCommonProps {
	hasContent: boolean;
	code: string;
	tagBasedDocumentSummary: boolean;
}

class InlineChatNotebookGenerateSelection extends PromptElement<InlineChatNotebookGenerateSelectionProps, InlineChatNotebookSelectionState> {
	constructor(
		props: InlineChatNotebookGenerateSelectionProps,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@INotebookService private readonly notebookService: INotebookService,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService
	) {
		super(props);
	}

	override async prepare(): Promise<InlineChatNotebookSelectionState> {
		const { document, wholeRange } = this.props.documentContext;

		const inSummaryExperiment = this.experimentationService.getTreatmentVariable('copilotchat.notebookSummary')
			|| this.configurationService.getConfig(ConfigKey.Advanced.NotebookSummaryExperimentEnabled);

		let executedCells: vscode.NotebookCell[] | undefined = undefined;
		if (inSummaryExperiment && this.tabsAndEditorsService.activeNotebookEditor?.notebook && this.tabsAndEditorsService.activeNotebookEditor?.notebook.uri.path === document.uri.path) {
			// experiment new notebook summary
			executedCells = this.notebookService.getCellExecutions(this.tabsAndEditorsService.activeNotebookEditor.notebook.uri);
		}

		return {
			wholeRange: document.validateRange(wholeRange),
			executedCells
		};
	}

	render(state: InlineChatNotebookSelectionState, sizing: PromptSizing) {
		if (this.props.documentContext.document.uri.scheme !== Schemas.vscodeNotebookCell) {
			throw illegalArgument('InlineChatNotebookSelection should be used only with a notebook!');
		}
		const { wholeRange } = state;
		const contextInfo = generateSelectionContextInNotebook(
			sizing.endpoint.modelMaxPromptTokens / 3, // consume one 3rd of the model window
			this.props.documentContext,
			wholeRange,
			this.tabsAndEditorsService,
			this.workspaceService
		);
		const doc = this.props.documentContext.document;

		const jupyterNotebook = isJupyterNotebookUri(this.props.documentContext.document.uri);
		const { hasContent, code } = this.props;
		const { aboveCells, belowCells } = contextInfo;
		const aboveCellsInfo = aboveCells || [];
		const belowCellsInfo = belowCells || [];
		const lang = this.props.documentContext.language;
		const isMarkdown = lang.languageId === 'markdown';
		const executedCells = state.executedCells || [];

		const tagBasedDocumentSummary = this.props.tagBasedDocumentSummary;

		return <>
			{
				jupyterNotebook
					? <>
						{
							(executedCells.length > 0 &&
								<InlineChatJupyterNotebookCellSummaryContextRenderer documentContext={this.props.documentContext} executedCells={executedCells} />
							)
						}
						{
							(executedCells.length === 0 && (aboveCellsInfo.length > 0 || belowCellsInfo.length > 0) && !tagBasedDocumentSummary) &&
							<InlineChatJupyterNotebookCellsContextRenderer documentContext={this.props.documentContext} aboveCells={aboveCellsInfo} belowCells={belowCellsInfo} />
						}
						{
							(executedCells.length === 0 && (aboveCellsInfo.length > 0 || belowCellsInfo.length > 0) && tagBasedDocumentSummary) &&
							<InlineChatJupyterNotebookCellsContextTagBasedRenderer documentContext={this.props.documentContext} aboveCells={aboveCellsInfo} belowCells={belowCellsInfo} />
						}
						<UserMessage>
							{
								isMarkdown ?
									<>
										{hasContent && <>Now I edit a markdown cell in this Jupyter Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{!hasContent && <>Now I create a new markdown cell in this Jupyter Notebook document at index {aboveCellsInfo.length}.<br /></>}
										This is a markdown cell. Markdown cell is used to describe and document your workflow.<br />
										{hasContent && <><CodeBlock uri={doc.uri} languageId={lang.languageId} code={code} shouldTrim={false} /><br /></>}
									</>
									:
									<>
										{hasContent && <>Now I edit a cell in this Jupyter Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{!hasContent && <>Now I create a new cell in this Jupyter Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{hasContent && <><CodeBlock uri={doc.uri} languageId={lang.languageId} code={code} shouldTrim={false} /><br /></>}
									</>
							}

						</UserMessage>
					</>
					: <>
						<InlineChatCustomNotebookInfoRenderer documentContext={this.props.documentContext} />
						<InlineChatCustomNotebookCellsContextRenderer documentContext={this.props.documentContext} aboveCells={aboveCellsInfo} belowCells={belowCellsInfo} />
						<UserMessage>
							{
								isMarkdown ?
									<>
										{hasContent && <>Now I edit a markdown cell in this custom Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{!hasContent && <>Now I create a new markdown cell in this custom Notebook document at index {aboveCellsInfo.length}.<br /></>}
										This is a markdown cell. Markdown cell is used to describe and document your workflow.<br />
										{hasContent && <><CodeBlock uri={doc.uri} languageId={lang.languageId} code={code} shouldTrim={false} /><br /></>}
									</>
									:
									<>
										{hasContent && <>Now I edit a cell in this custom Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{!hasContent && <>Now I create a new cell in this custom Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{hasContent && <><CodeBlock uri={doc.uri} languageId={lang.languageId} code={code} shouldTrim={false} /><br /></>}
									</>
							}
						</UserMessage>
					</>
			}
		</>;
	}
}

interface InlineChatJupyterNotebookCellSummaryContextRendererProps extends BasePromptElementProps {
	documentContext: IDocumentContext;
	executedCells: vscode.NotebookCell[] | undefined;
}

class InlineChatJupyterNotebookCellSummaryContextRenderer extends PromptElement<InlineChatJupyterNotebookCellSummaryContextRendererProps> {
	render(state: void, sizing: PromptSizing) {
		if (!isNotebookCellOrNotebookChatInput(this.props.documentContext.document.uri)) {
			throw illegalArgument('InlineChatJupyterNotebookCellSummaryContextRenderer should be used only with a notebook!');
		}
		const lang = this.props.documentContext.language;
		const executedCells = this.props.executedCells || [];

		return (
			<>
				{
					<UserMessage>
						I am working on a Jupyter notebook.<br />
						Users have executed the following cells in this notebook<br />
						Each cell contains a code block started with ```{lang.languageId}<br />
						Since it is Jupyter Notebook, if a module is already imported in a cell, it can be used in other cells as well.<br />
						For the same reason, if a variable is defined in a cell, it can be used in other cells as well.<br />
						We should not repeat the same import or variable definition in multiple cells, unless we want to overwrite the previous definition.<br />
						Do not generate CELL INDEX in your answer, it is only used to help you understand the context.<br />
						<br />
						Below you will find a set of examples of what you should respond with. Please follow the exmaples on how to avoid repeating code.<br />
						## Examples starts here<br />
						Here are the executed cells in this Jupyter Notebook:<br />
						```python<br />
						import pandas as pd<br />
						<br />
						df = pd.DataFrame(&#123;'Name': ['Alice', 'Bob', 'Charlie'], 'Age': [25, 30, 35], 'Gender': ['F', 'M', 'M']&#125;)<br />
						print(df)<br />
						```<br />
						---------------------------------<br />
						USER:<br />
						Now I create a new cell in this Jupyter Notebook document at index 1.<br />
						USER:<br />
						plot the data frame<br />
						<br />
						---------------------------------<br />
						ChatGPT Answer<br />
						---------------------------------<br />
						To plot the dataframe, we can use the `plot()` method of pandas dataframe. Here's the code:<br />
						<br />
						```python<br />
						df.plot(x='Name', y='Age', kind='bar')<br />
						```<br />
						## Example ends here<br />
						{executedCells.map((cell) => (<NotebookCellContent cell={cell} />))}
					</UserMessage>
				}
			</>
		);
	}
}

class NotebookCellContent extends PromptElement<{ cell: vscode.NotebookCell } & BasePromptElementProps> {
	override render() {
		return <>
			```{this.props.cell.document.languageId}<br />
			{this.props.cell.document.getText()}<br />
			```
		</>;
	}
}