/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptElement, PromptSizing, SystemMessage, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import type { NotebookDocument } from 'vscode';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { IExperimentationService } from '../../../../platform/telemetry/common/nullExperimentationService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { findNotebook, isJupyterNotebookUri } from '../../../../util/common/notebooks';
import { illegalArgument } from '../../../../util/vs/base/common/errors';
import { Schemas } from '../../../../util/vs/base/common/network';
import { SelectionSplitKind, SummarizedDocumentData } from '../../../intents/node/testIntent/summarizedDocumentWithSelection';
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
import { generateSelectionContextInNotebook, InlineChatCustomNotebookCellsContextRenderer, InlineChatCustomNotebookInfoRenderer, InlineChatJupyterNotebookCellsContextRenderer, InlineChatNotebookBasePromptState, InlineChatNotebookSelectionCommonProps, InlineChatNotebookSelectionState, InlineChatNotebookVariables } from './inlineChatNotebookCommonPromptElements';
import { createPromptingSummarizedDocument } from './promptingSummarizedDocument';

interface InlineChatNotebookEditSelectionProps extends InlineChatNotebookSelectionCommonProps {
	hasCodeWithoutSelection: boolean;
	codeWithoutSelection: string;
	codeSelected: string;
	tagBasedDocumentSummary: boolean;
}

class InlineChatNotebookEditSelection extends PromptElement<InlineChatNotebookEditSelectionProps, InlineChatNotebookSelectionState> {
	constructor(
		props: InlineChatNotebookEditSelectionProps,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService
	) {
		super(props);
	}

	override async prepare(): Promise<InlineChatNotebookSelectionState> {
		const { document, wholeRange } = this.props.documentContext;
		return {
			wholeRange: document.validateRange(wholeRange)
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
		const { hasCodeWithoutSelection, codeWithoutSelection, codeSelected } = this.props;
		const { aboveCells, belowCells } = contextInfo;
		const aboveCellsInfo = aboveCells || [];
		const belowCellsInfo = belowCells || [];
		const lang = this.props.documentContext.language;
		const isMarkdown = lang.languageId === 'markdown';

		const isEditing = hasCodeWithoutSelection || codeSelected.length > 0;
		const tagBasedDocumentSummary = this.props.tagBasedDocumentSummary;

		return <>
			{
				jupyterNotebook
					? <>
						{
							((aboveCellsInfo.length > 0 || belowCellsInfo.length > 0) && !tagBasedDocumentSummary) &&
							<InlineChatJupyterNotebookCellsContextRenderer documentContext={this.props.documentContext} aboveCells={aboveCellsInfo} belowCells={belowCellsInfo} />
						}
						{
							((aboveCellsInfo.length > 0 || belowCellsInfo.length > 0) && tagBasedDocumentSummary) &&
							<InlineChatJupyterNotebookCellsContextRenderer documentContext={this.props.documentContext} aboveCells={aboveCellsInfo} belowCells={belowCellsInfo} />
						}
						<UserMessage>
							{
								isMarkdown ?
									<>
										{isEditing && <>Now I edit a markdown cell in this Jupyter Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{!isEditing && <>Now I create a new markdown cell in this Jupyter Notebook document at index {aboveCellsInfo.length}.<br /></>}
										This is a markdown cell. Markdown cell is used to describe and document your workflow.<br />
										{hasCodeWithoutSelection && <><CodeBlock uri={doc.uri} languageId={lang.languageId} code={codeWithoutSelection} shouldTrim={false} /><br /></>}
										{hasCodeWithoutSelection && <>The $SELECTION_PLACEHOLDER$ code is:<br /></>}
										<CodeBlock uri={doc.uri} languageId={lang.languageId} code={codeSelected} shouldTrim={false} />
									</>
									:
									<>
										{isEditing && <>Now I edit a cell in this Jupyter Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{!isEditing && <>Now I create a new cell in this Jupyter Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{hasCodeWithoutSelection && <><CodeBlock uri={doc.uri} languageId={lang.languageId} code={codeWithoutSelection} shouldTrim={false} /><br /></>}
										{(codeSelected.length > 0) && <>The $SELECTION_PLACEHOLDER$ code is:<br /></>}
										<CodeBlock uri={doc.uri} languageId={lang.languageId} code={codeSelected} shouldTrim={false} />
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
										{hasCodeWithoutSelection && <>Now I edit a markdown cell in this custom Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{!hasCodeWithoutSelection && <>Now I create a new markdown cell in this custom Notebook document at index {aboveCellsInfo.length}.<br /></>}
										This is a markdown cell. Markdown cell is used to describe and document your workflow.<br />
										{hasCodeWithoutSelection && <><CodeBlock uri={doc.uri} languageId={lang.languageId} code={codeWithoutSelection} shouldTrim={false} /><br /></>}
										{hasCodeWithoutSelection && <>The $SELECTION_PLACEHOLDER$ code is:<br /></>}
										<CodeBlock uri={doc.uri} languageId={lang.languageId} code={codeSelected} shouldTrim={false} />
									</>
									:
									<>
										{hasCodeWithoutSelection && <>Now I edit a cell in this custom Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{!hasCodeWithoutSelection && <>Now I create a new cell in this custom Notebook document at index {aboveCellsInfo.length}.<br /></>}
										{hasCodeWithoutSelection && <><CodeBlock uri={doc.uri} languageId={lang.languageId} code={codeWithoutSelection} shouldTrim={false} /><br /></>}
										{hasCodeWithoutSelection && <>The $SELECTION_PLACEHOLDER$ code is:<br /></>}
										<CodeBlock uri={doc.uri} languageId={lang.languageId} code={codeSelected} shouldTrim={false} />
									</>
							}
						</UserMessage>
					</>
			}
		</>;
	}
}

interface InlineChatNotebookAlternativeEditPromptState extends InlineChatNotebookBasePromptState {
	notebook?: NotebookDocument;
	activeDocumentContext: IDocumentContext;
	isJupyterNotebook: boolean;
}

export class InlineChatNotebookEditPrompt extends PromptElement<InlineChatEditCodePromptProps, InlineChatNotebookAlternativeEditPromptState> {
	constructor(
		props: InlineChatEditCodePromptProps,
		@IIgnoreService private readonly ignoreService: IIgnoreService,
		@IParserService private readonly parserService: IParserService,
		@IExperimentationService private readonly experimentationService: IExperimentationService,
		@IParserService private readonly _parserService: IParserService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing): Promise<InlineChatNotebookAlternativeEditPromptState> {
		const currentDocumentContext = this.props.documentContext;
		const activeDocumentContext = currentDocumentContext;
		const notebook = findNotebook(currentDocumentContext.document.uri, this.workspaceService.notebookDocuments);

		const isIgnored = await this.ignoreService.isCopilotIgnored(activeDocumentContext.document.uri);
		const wholeRange = activeDocumentContext.document.validateRange(activeDocumentContext.wholeRange);

		const summarizedDocument = await createPromptingSummarizedDocument(
			this.parserService,
			activeDocumentContext.document,
			activeDocumentContext.fileIndentInfo,
			wholeRange,
			sizing.endpoint.modelMaxPromptTokens / 3 // consume one 3rd of the model window
		);

		const isTagBasedDocumentSummary = this.experimentationService.getTreatmentVariable<boolean>('copilotchat.tagBasedDocumentSummary') ?? false;

		return {
			notebook,
			isJupyterNotebook: isJupyterNotebookUri(currentDocumentContext.document.uri),
			summarizedDocument,
			isIgnored,
			priorities: promptPriorities,
			tagBasedDocumentSummary: isTagBasedDocumentSummary,
			activeDocumentContext: activeDocumentContext,
		};
	}

	async render(state: InlineChatNotebookAlternativeEditPromptState, sizing: PromptSizing) {
		if (!state.notebook) {
			throw illegalArgument('InlineChatNotebookEditPrompt should be used only with a notebook!');
		}

		const context = state.activeDocumentContext;
		const promptContext = this.props.promptContext;
		if (context.document.uri.scheme !== Schemas.vscodeNotebookCell) {
			throw illegalArgument('InlineChatNotebookEditPrompt should be used only with a notebook!');
		}
		if (state.isIgnored) {
			return <ignoredFiles value={[context.document.uri]} />;
		}

		const tagBasedDocumentSummary = state.tagBasedDocumentSummary;

		const { query, history, chatVariables } = promptContext;
		const jupyterNotebook = state.isJupyterNotebook;
		const document = context.document;
		const lang = context.language;
		const isMarkdown = lang.languageId === 'markdown';
		const splitDoc = state.summarizedDocument.splitAroundAdjustedSelection();
		const { codeAbove, codeSelected, codeBelow, hasCodeWithoutSelection } = splitDoc;
		const data = await SummarizedDocumentData.create(this._parserService, document, context.fileIndentInfo, context.wholeRange, SelectionSplitKind.Adjusted);
		const codeWithoutSelection = `${codeAbove}${data.placeholderText}${codeBelow}`;
		const replyInterpreter = splitDoc.createReplyInterpreter(
			LeadingMarkdownStreaming.Mute,
			EarlyStopping.StopAfterFirstCodeBlock,
			splitDoc.replaceSelectionStreaming,
			TextPieceClassifiers.createCodeBlockClassifier(),
			line => line.value.trim() !== data.placeholderText
		);

		const priorities = state.priorities;
		return (
			<>
				<meta value={new ReplyInterpreterMetaData(replyInterpreter)} />
				<SystemMessage priority={priorities.core}>
					You are an AI programming assistant.<br />
					When asked for your name, you must respond with "GitHub Copilot".<br />
					You are a world class expert in programming, and especially good at {lang.languageId}.<br />
					Source code is always contained in ``` blocks.<br />
					The user needs help to modify some code.<br />
					{hasCodeWithoutSelection && <>The user includes existing code and marks with {data.placeholderText} where the selected code should go.<br /></>}
					<LegacySafetyRules />
				</SystemMessage>
				<HistoryWithInstructions inline={true} passPriority historyPriority={priorities.history ?? 700} history={history}>
					<InstructionMessage priority={priorities.core}>
						{jupyterNotebook &&
							<>
								<JupyterNotebookRules />
								{!tagBasedDocumentSummary && <>When dealing with Jupyter Notebook, do not generate CELL INDEX in the code blocks in your answer, it is only used to help you understand the context.<br /></>}
							</>
						}
						{isMarkdown && <>When generating content for markdown cell, provide the answer directly without any additional introductory text. Ensure that the response is structured in Markdown format to seamlessly integrate into the markdown file.</>}
						{hasCodeWithoutSelection && <>The user includes existing code and marks with {data.placeholderText} where the selected code should go.<br /></>}
					</InstructionMessage>
				</HistoryWithInstructions>
				<ChatToolReferences priority={priorities.context} promptContext={promptContext} flexGrow={1} embeddedInsideUserMessage={false} />
				<ChatVariables priority={priorities.context} chatVariables={chatVariables} embeddedInsideUserMessage={false} />
				<InlineChatNotebookEditSelection documentContext={context} hasCodeWithoutSelection={hasCodeWithoutSelection} codeWithoutSelection={codeWithoutSelection} codeSelected={codeSelected} priority={priorities.core} tagBasedDocumentSummary={tagBasedDocumentSummary} />
				<InlineChatNotebookVariables notebookURI={context.document.uri} priority={priorities.runtimeCore} priorities={priorities} query={query} />
				<UserMessage>
					<CustomInstructions priority={priorities.context} languageId={lang.languageId} chatVariables={chatVariables} />
					<UserQuery priority={priorities.core} chatVariables={chatVariables} query={query} /><br />
					{(hasCodeWithoutSelection && isMarkdown) && <TextChunk priority={priorities.core} >The modified {data.placeholderText} code without ``` is:</TextChunk>}
					{(hasCodeWithoutSelection && !isMarkdown) && <TextChunk priority={priorities.core} >The modified {data.placeholderText} code with ``` is:</TextChunk>}
				</UserMessage>
			</>
		);
	}
}
