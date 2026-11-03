/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptSizing, SystemMessage, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { IIgnoreService } from '../../../../platform/ignore/common/ignoreService';
import { ILanguageDiagnosticsService, rangeSpanningDiagnostics } from '../../../../platform/languages/common/languageDiagnosticsService';
import { IParserService } from '../../../../platform/parser/node/parserService';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { ILanguage } from '../../../../util/common/languages';
import { isJupyterNotebookUri, isNotebookCellOrNotebookChatInput } from '../../../../util/common/notebooks';
import { illegalArgument } from '../../../../util/vs/base/common/errors';
import { Schemas } from '../../../../util/vs/base/common/network';
import { StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { IInstantiationService } from '../../../../util/vs/platform/instantiation/common/instantiation';
import { Range, Uri } from '../../../../vscodeTypes';
import { findDiagnosticForSelectionAndPrompt, findFixRangeOfInterest, generateFixContext } from '../../../context/node/resolvers/fixSelection';
import { generateNotebookCellContext } from '../../../context/node/resolvers/inlineChatSelection';
import { InlineFixProps } from '../../../context/node/resolvers/inlineFixIntentInvocation';
import { getStructure } from '../../../context/node/resolvers/selectionContextHelpers';
import { CodeContextRegion } from '../../../inlineChat/node/codeContextRegion';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { ReplyInterpreterMetaData } from '../../../prompt/node/intents';
import { CompositeElement } from '../base/common';
import { InstructionMessage } from '../base/instructionMessage';
import { IPromptEndpoint } from '../base/promptRenderer';
import { LegacySafetyRules } from '../base/safetyRules';
import { Tag } from '../base/tag';
import { PatchEditExamplePatch, PatchEditInputCodeBlock, PatchEditRules } from '../codeMapper/patchEditGeneration';
import { JupyterNotebookRules } from '../notebook/commonPrompts';
import { ChatToolReferences, ChatVariables, UserQuery } from '../panel/chatVariables';
import { HistoryWithInstructions } from '../panel/conversationHistory';
import { CustomInstructions } from '../panel/customInstructions';
import { CodeBlock } from '../panel/safeElements';
import { PatchEditFixReplyInterpreter } from './inlineChatFix3Prompt';
import { NotebookPromptPriority, promptPriorities } from './inlineChatNotebookCommon';
import { InlineChatCellSelectionProps, InlineChatCustomNotebookCellsContextRenderer, InlineChatCustomNotebookInfoRenderer, InlineChatNotebookSelectionCommonProps, InlineChatNotebookVariables, NotebookCellList } from './inlineChatNotebookCommonPromptElements';
import { ProjectedDocument } from './summarizedDocument/summarizeDocument';
import { summarizeDocumentSync } from './summarizedDocument/summarizeDocumentHelpers';

const FIX_SELECTION_LENGTH_THRESHOLD = 15;
interface InlineChatNotebookFixPromptState {
	isIgnored: boolean;
	priorities: NotebookPromptPriority;
}


export class InlineFixNotebookPrompt extends PromptElement<InlineFixProps, InlineChatNotebookFixPromptState> {

	constructor(
		props: InlineFixProps,
		@IIgnoreService private readonly _ignoreService: IIgnoreService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ILanguageDiagnosticsService private readonly _languageDiagnosticsService: ILanguageDiagnosticsService,
		@IParserService private readonly _parserService: IParserService,
		@ITabsAndEditorsService private readonly _tabsAndEditorsService: ITabsAndEditorsService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IPromptEndpoint private readonly _promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	override async prepare(sizing: PromptSizing): Promise<InlineChatNotebookFixPromptState> {
		const { documentContext: context } = this.props;
		const isIgnored = await this._ignoreService.isCopilotIgnored(context.document.uri);

		return {
			isIgnored,
			priorities: promptPriorities
		};
	}

	async render(state: InlineChatNotebookFixPromptState, sizing: PromptSizing) {
		const documentContext = this.props.documentContext;

		if (!isNotebookCellOrNotebookChatInput(documentContext.document.uri)) {
			throw illegalArgument('InlineFixNotebookPrompt should not be used with a non-notebook!');
		}

		if (state.isIgnored) {
			return <ignoredFiles value={[documentContext.document.uri]} />;
		}

		const { query, history, chatVariables } = this.props.promptContext;
		const selection = documentContext.selection;

		// find the diagnostics of interest and the selection of interest surrounding the diagnostics
		const diagnostics = findDiagnosticForSelectionAndPrompt(this._languageDiagnosticsService, documentContext.document.uri, documentContext.selection, query);
		const range = diagnostics.length > 0 ? rangeSpanningDiagnostics(diagnostics) : documentContext.selection;

		const treeSitterAST = this._parserService.getTreeSitterAST(documentContext.document);
		const rangeOfInterest = treeSitterAST ? await findFixRangeOfInterest(treeSitterAST, range, FIX_SELECTION_LENGTH_THRESHOLD) : range;

		const fixContext = generateFixContext(this._promptEndpoint, documentContext, range, rangeOfInterest);
		const inputDocCharLimit = (sizing.endpoint.modelMaxPromptTokens / 3) * 4; // consume one 3rd of the model window, estimating roughly 4 chars per token;
		let projectedDocument: ProjectedDocument;
		let isSummarized = false;
		if (documentContext.document.getText().length > inputDocCharLimit) {
			// only compute the summarized document if needed
			const structure = await getStructure(this._parserService, documentContext.document, documentContext.fileIndentInfo);
			projectedDocument = summarizeDocumentSync(inputDocCharLimit, documentContext.document, documentContext.wholeRange, structure, { tryPreserveTypeChecking: true });
			isSummarized = true;
		} else {
			projectedDocument = new ProjectedDocument(documentContext.document.getText(), StringEdit.empty, documentContext.document.languageId);
		}

		const adjustedSelection = projectedDocument.projectRange(selection);
		const selectedLinesContent = documentContext.document.getText(new Range(selection.start.line, 0, selection.end.line + 1, 0)).trimEnd();

		const contextInfo = generateNotebookCellContext(this._tabsAndEditorsService, this._workspaceService, documentContext, fixContext.contextInfo, fixContext.tracker);
		const replyInterpreter = this._instantiationService.createInstance(PatchEditFixReplyInterpreter, projectedDocument, documentContext.document.uri, adjustedSelection);

		// const replyInterpreter = this._instantiationService.createInstance(FixNotebookReplyInterpreter, range, contextInfo, documentContext);
		const exampleUri = Uri.file('/someFolder/myFile.ts');
		const priorities = state.priorities;
		return (
			<>
				<meta value={new ReplyInterpreterMetaData(replyInterpreter)} />
				<SystemMessage priority={priorities.core}>
					You are an AI programming assistant.<br />
					When asked for your name, you must respond with "GitHub Copilot".<br />
					You are a world class expert in programming, and especially good at {documentContext.language.languageId}.<br />
					Source code is always contained in ``` blocks.<br />
				</SystemMessage>
				<HistoryWithInstructions inline={true} passPriority historyPriority={priorities.history ?? 700} history={history}>
					<InstructionMessage priority={priorities.core}>
						The user needs help to write some new code.<br />
						<JupyterNotebookRules />
						When dealing with Jupyter Notebook, do not generate CELL INDEX in the code blocks in your answer, it is only used to help you understand the context.<br />
						If you suggest to run a terminal command, use a code block that starts with ```bash.<br />
						When fixing "ModuleNotFoundError" or "Import could not be resolved" errors, always use magic command "%pip install" to add the missing packages. The imports MUST be inserted at the top of the code block and it should not replace existing code.<br />
						You should not import the same module twice.<br />
						<PatchEditRules />
						<LegacySafetyRules />
						<Tag name='example' priority={100}>
							<Tag name='user'>
								I have the following code open in the editor.<br />
								<PatchEditInputCodeBlock
									uri={exampleUri}
									languageId='csharp'
									code={['// This is my class', 'class C { }', '', 'new C().Field = 9;']}
								/>
							</Tag>
							<Tag name='assistant'>
								The problem is that the class 'C' does not have a field or property named 'Field'. To fix this, you need to add a 'Field' property to the 'C' class.<br />
								<br />
								<PatchEditExamplePatch
									changes={
										[
											{
												uri: exampleUri,
												find: ['// This is my class', 'class C { }'],
												replace: ['// This is my class', 'class C {', 'public int Field { get; set; }', '}']
											},
											{
												uri: exampleUri,
												find: ['new C().Field = 9;'],
												replace: ['// set the field to 9', 'new C().Field = 9;']
											}
										]
									}
								/>
							</Tag>
						</Tag>
					</InstructionMessage>
				</HistoryWithInstructions>
				<UserMessage priority={priorities.context}>
					<CustomInstructions languageId={documentContext.language.languageId} chatVariables={chatVariables} />
				</UserMessage>
				<ChatToolReferences priority={priorities.context} promptContext={this.props.promptContext} flexGrow={1} embeddedInsideUserMessage={false} />
				<ChatVariables priority={priorities.context} chatVariables={chatVariables} embeddedInsideUserMessage={false} />
				<InlineChatFixNotebookSelectionRenderer
					priority={priorities.core}
					documentContext={documentContext}
					aboveCells={contextInfo.aboveCells}
					belowCells={contextInfo.belowCells}
					document={documentContext.document}
					projectedDocument={projectedDocument}
					language={documentContext.language}
					diagnostics={diagnostics}
					selection={documentContext.selection}
					adjustedSelection={adjustedSelection}
					isSummarized={isSummarized}
					selectedLinesContent={selectedLinesContent}
				/>
				<InlineChatNotebookVariables notebookURI={this.props.documentContext.document.uri} priority={priorities.runtimeCore} priorities={priorities} query={query} />
				<UserMessage priority={priorities.core}>
					{/* <Diagnostics documentContext={documentContext} diagnostics={diagnostics} /> */}
					{/* Describe in a single sentence how you would solve the problem. After that sentence, add an empty line. Then add a code block with the fix. */}
					Please find a fix for my code so that the result is without any errors.<br />
					<UserQuery chatVariables={chatVariables} query={query} /><br />
				</UserMessage>
			</>
		);
	}
}

interface InlineChatNotebookSelectionRendererProps extends InlineChatNotebookSelectionCommonProps {
	aboveCells?: CodeContextRegion[];
	belowCells?: CodeContextRegion[];

	readonly document: TextDocumentSnapshot;
	readonly projectedDocument: ProjectedDocument;
	readonly language: ILanguage;
	readonly diagnostics: vscode.Diagnostic[];
	readonly selection: vscode.Selection;
	readonly adjustedSelection: Range;
	readonly isSummarized: boolean;
	readonly selectedLinesContent: string;
}

class InlineChatFixNotebookSelectionRenderer extends PromptElement<InlineChatNotebookSelectionRendererProps> {

	render(state: void, sizing: PromptSizing) {
		if (this.props.documentContext.document.uri.scheme !== Schemas.vscodeNotebookCell) {
			throw illegalArgument('InlineChatNotebookSelectionRenderer should be used only with a notebook!');
		}

		const jupyterNotebook = isJupyterNotebookUri(this.props.documentContext.document.uri);
		const { projectedDocument, aboveCells, belowCells } = this.props;
		const aboveCellsInfo = aboveCells || [];
		const belowCellsInfo = belowCells || [];
		const lang = this.props.documentContext.language;

		return (
			<>
				{
					jupyterNotebook
						? <>
							<InlineChatFixNotebookCellsContextRenderer documentContext={this.props.documentContext} aboveCells={aboveCellsInfo} belowCells={belowCellsInfo} />
						</>
						: <>
							<InlineChatCustomNotebookInfoRenderer documentContext={this.props.documentContext} />
							<InlineChatCustomNotebookCellsContextRenderer documentContext={this.props.documentContext} aboveCells={aboveCellsInfo} belowCells={belowCellsInfo} />
						</>
				}
				<NotebookCellSelection cellIndex={aboveCellsInfo.length} document={this.props.document} projectedDocument={projectedDocument} language={lang} diagnostics={this.props.diagnostics} selection={this.props.selection} adjustedSelection={this.props.adjustedSelection} isSummarized={this.props.isSummarized} selectedLinesContent={this.props.selectedLinesContent} />
			</>
		);
	}
}

class NotebookCellSelection extends PromptElement<InlineChatCellSelectionProps> {
	override render() {
		const { cellIndex, document, projectedDocument, diagnostics, language, selection, adjustedSelection, isSummarized, selectedLinesContent } = this.props;
		const notebookType = isNotebookCellOrNotebookChatInput(document.uri) ? 'Jupyter' : 'custom';
		const isMarkdown = language.languageId === 'markdown';

		return <>
			<UserMessage>
				Now I create a new cell in this {notebookType} Notebook document at index {this.props.cellIndex}.<br />
				{isMarkdown && <>This is a markdown cell. Markdown cell is used to describe and document your workflow.<br /></>}
				<NotebookCellRenderer cellIndex={cellIndex} document={document} projectedDocument={projectedDocument} diagnostics={diagnostics} language={language} selection={selection} adjustedSelection={adjustedSelection} isSummarized={isSummarized} selectedLinesContent={selectedLinesContent} />
			</UserMessage>
		</>;
	}
}

class NotebookCellRenderer extends PromptElement<InlineChatCellSelectionProps> {
	constructor(
		props: InlineChatCellSelectionProps
	) {
		super(props);
	}

	override render() {
		const { document, projectedDocument, diagnostics, language, selection, adjustedSelection, isSummarized, selectedLinesContent } = this.props;
		const isMarkdown = language.languageId === 'markdown';

		return <>
			<CompositeElement>
				{
					projectedDocument.text.length > 0 ?
						<>
							{
								isMarkdown ?
									<>I have the following markdown content in this cell, starting from line 1 to line {projectedDocument.lineCount}.<br /></> :
									<>I have the following code in this cell, starting from line 1 to line {projectedDocument.lineCount}.<br /></>
							}

							<PatchEditInputCodeBlock uri={document.uri} languageId={language.languageId} code={projectedDocument.text} shouldTrim={false} isSummarized={isSummarized} /><br />
						</> :
						<>
							I am in an empty file:
							<PatchEditInputCodeBlock uri={document.uri} languageId={language.languageId} code={projectedDocument.text} shouldTrim={false} isSummarized={isSummarized} /><br />
						</>
				}
			</CompositeElement >
			<CompositeElement>
				{
					selection.isEmpty ?
						<>
							I have the selection at line {adjustedSelection.start.line + 1}, column {adjustedSelection.start.character + 1}<br />
						</> :
						<>
							I have currently selected from line {adjustedSelection.start.line + 1}, column {adjustedSelection.start.character + 1} to line {adjustedSelection.end.line + 1} column {adjustedSelection.end.character + 1}.<br />
						</>
				}
			</CompositeElement >
			<CompositeElement>
				{
					selectedLinesContent.length && !diagnostics.some(d => d.range.contains(selection)) &&
					<>
						The content of the lines at the selection is
						<CodeBlock uri={document.uri} languageId={language.languageId} code={selectedLinesContent} shouldTrim={false} /><br />
					</>
				}
			</CompositeElement >
		</>;
	}
}

interface InlineChatFixNotebookCellsContextRendererProps extends BasePromptElementProps {
	documentContext: IDocumentContext;
	aboveCells: CodeContextRegion[];
	belowCells: CodeContextRegion[];
}

/**
 * Notebook cell context renderer. Used by Fix intents.
 * It's using following example for llm response:
 * 	---FILEPATH Untitled-1<br />
	---FIND<br />
	---REPLACE<br />
	```python<br />
	df.plot(x='Name', y='Age', kind='bar')<br />
	```<br />
	---COMPLETE<br />
 * However, we don't use this in Generate and Edit intents yet.
 */
class InlineChatFixNotebookCellsContextRenderer extends PromptElement<InlineChatFixNotebookCellsContextRendererProps> {
	render(state: void, sizing: PromptSizing) {
		if (!isNotebookCellOrNotebookChatInput(this.props.documentContext.document.uri)) {
			throw illegalArgument('InlineChatNotebookSelectionRenderer should be used only with a notebook!');
		}

		const { aboveCells: aboveCellsInfo, belowCells: belowCellsInfo } = this.props;
		const lang = this.props.documentContext.language;

		return (
			<>
				{
					(aboveCellsInfo.length > 0 || belowCellsInfo.length > 0) &&
					<UserMessage>
						I am working on a Jupyter notebook.<br />
						This Jupyter Notebook already contains multiple cells.<br />
						The content of cells are listed below, each cell starts with CELL INDEX and a code block started with ```{lang.languageId}<br />
						Each cell is a block of code that can be executed independently.<br />
						Since it is Jupyter Notebook, if a module is already imported in a cell, it can be used in other cells as well.<br />
						For the same reason, if a variable is defined in a cell, it can be used in other cells as well.<br />
						We should not repeat the same import or variable definition in multiple cells, unless we want to overwrite the previous definition.<br />
						Do not generate CELL INDEX in your answer, it is only used to help you understand the context.<br />
						<br />
						<>Below you will find a set of examples of what you should respond with. Please follow the exmaples on how to avoid repeating code.<br />
							## Examples starts here<br />
							Here are the cells in this Jupyter Notebook:<br />
							`CELL INDEX: 0<br />
							```python<br />
							import pandas as pd<br />
							<br />
							# create a dataframe with sample data<br />
							df = pd.DataFrame(&#123;'Name': ['Alice', 'Bob', 'Charlie'], 'Age': [25, 30, 35], 'Gender': ['F', 'M', 'M']&#125;)<br />
							print(df)<br />
							```<br />
							---------------------------------<br />
							USER:<br />
							Now I create a new cell in this Jupyter Notebook document at index 1.<br />
							I have the following code open in this cell, starting from line 1 to line 1.<br />
							```python<br />
							```<br />
							---------------------------------<br />
							USER:<br />
							plot the data frame<br />
							<br />
							---------------------------------<br />
							Assistant Answer<br />
							---------------------------------<br />
							To plot the dataframe, we can use the `plot()` method of pandas dataframe.<br />
							<br />
							---FILEPATH Untitled-1<br />
							---FIND<br />
							---REPLACE<br />
							```python<br />
							df.plot(x='Name', y='Age', kind='bar')<br />
							```<br />
							---COMPLETE<br />
							## Example ends here<br />
						</>

						{aboveCellsInfo.length > 0 && <NotebookCellList cells={aboveCellsInfo} title={'Here are the cells in this Jupyter Notebook:\n'} />}
						{belowCellsInfo.length > 0 && <NotebookCellList cells={belowCellsInfo} cellIndexDelta={aboveCellsInfo.length + 1} title={'Here are the cells below the current cell that I am editing in this Jupyter Notebook:\n'} />}
					</UserMessage>
				}
			</>
		);
	}
}