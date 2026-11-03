/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing, TextChunk, TokenLimit, UserMessage } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { TextDocumentSnapshot } from '../../../../platform/editing/common/textDocumentSnapshot';
import { INotebookService, PipPackage, VariablesResult } from '../../../../platform/notebook/common/notebookService';
import { ITabsAndEditorsService } from '../../../../platform/tabs/common/tabsAndEditorsService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { ILanguage } from '../../../../util/common/languages';
import { createFencedCodeBlock } from '../../../../util/common/markdown';
import { isNotebookCellOrNotebookChatInput } from '../../../../util/common/notebooks';
import { illegalArgument } from '../../../../util/vs/base/common/errors';
import { Range } from '../../../../vscodeTypes';
import { generateNotebookCellContext, getSelectionAndCodeAroundSelection } from '../../../context/node/resolvers/inlineChatSelection';
import { CodeContextRegion, CodeContextTracker } from '../../../inlineChat/node/codeContextRegion';
import { IDocumentContext } from '../../../prompt/node/documentContext';
import { Tag } from '../base/tag';
import { NotebookPromptPriority } from './inlineChatNotebookCommon';
import { PromptingSummarizedDocument } from './promptingSummarizedDocument';
import { ProjectedDocument } from './summarizedDocument/summarizeDocument';

export interface InlineChatNotebookBasePromptState {
	summarizedDocument: PromptingSummarizedDocument;
	isIgnored: boolean;
	priorities: NotebookPromptPriority;
	tagBasedDocumentSummary: boolean;
}

export interface InlineChatNotebookSelectionCommonProps extends BasePromptElementProps {
	documentContext: IDocumentContext;
}

export interface InlineChatNotebookSelectionState {
	wholeRange: Range;
	executedCells?: vscode.NotebookCell[];
}

export interface InlineChatCellSelectionProps extends BasePromptElementProps {
	readonly cellIndex: number;
	readonly document: TextDocumentSnapshot;
	readonly projectedDocument: ProjectedDocument;
	readonly language: ILanguage;
	readonly diagnostics: vscode.Diagnostic[];
	readonly selection: vscode.Selection;
	readonly adjustedSelection: Range;
	readonly isSummarized: boolean;
	readonly selectedLinesContent: string;
}

export class NotebookCellList extends PromptElement<{ title: string; cells: CodeContextRegion[]; cellIndexDelta?: number } & BasePromptElementProps> {
	override render() {
		return <>
			{this.props.title}<br />
			{this.props.cells.map((cell, index) => (<NotebookCellContent index={index + (this.props.cellIndexDelta ?? 0)} cell={cell} />))}
		</>;
	}
}

class NotebookCellContent extends PromptElement<{ index: number; cell: CodeContextRegion } & BasePromptElementProps> {
	override render() {
		return <>
			CELL INDEX: {this.props.index}<br />
			```{this.props.cell.language.languageId}<br />
			{this.props.cell.lines.join('\n')}<br />
			```
		</>;
	}
}

interface InlineChatJupyterNotebookCellsContextRendererProps extends BasePromptElementProps {
	documentContext: IDocumentContext;
	aboveCells: CodeContextRegion[];
	belowCells: CodeContextRegion[];
}

/**
 * Notebook cell context renderer. Used by Generate and Edit intents.
 * It includes the document context of the notebook. It' using legacy prompt technique to include the examples and the cell position and content.
 */
export class InlineChatJupyterNotebookCellsContextRenderer extends PromptElement<InlineChatJupyterNotebookCellsContextRendererProps> {
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
							In this new cell, I am working with the following code:<br />
							```python<br />
							```<br />
							---------------------------------<br />
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
						</>

						{aboveCellsInfo.length > 0 && <NotebookCellList cells={aboveCellsInfo} title={'Here are the cells in this Jupyter Notebook:\n'} />}
						{belowCellsInfo.length > 0 && <NotebookCellList cells={belowCellsInfo} cellIndexDelta={aboveCellsInfo.length + 1} title={'Here are the cells below the current cell that I am editing in this Jupyter Notebook:\n'} />}
					</UserMessage>
				}
			</>
		);
	}
}

export class InlineChatJupyterNotebookCellsContextTagBasedRenderer extends PromptElement<InlineChatJupyterNotebookCellsContextRendererProps> {
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
						The content of cells are listed below, source code is contained in ```{lang.languageId} blocks<br />
						Each cell is a block of code that can be executed independently.<br />
						Below you will find a set of examples of what you should respond with. Please follow the exmaples on how to avoid repeating code.<br />
						<Tag name='example'>
							<Tag name='cellsAbove'>
								Here are the cells above the current cell that I am editing in this Jupyter Notebook:<br />
								<IndexedTag name='cell' index={0}>
									<TextChunk>
										```python<br />
										import pandas as pd<br />
										<br />
										# create a dataframe with sample data<br />
										df = pd.DataFrame(&#123;'Name': ['Alice', 'Bob', 'Charlie'], 'Age': [25, 30, 35], 'Gender': ['F', 'M', 'M']&#125;)<br />
										print(df)<br />
										```
									</TextChunk>
								</IndexedTag>
							</Tag>
							<Tag name='UserRequest'>
								Now I create a new cell in this Jupyter Notebook document at index 1.<br />
								<TextChunk>
									```python<br />
									```<br />
								</TextChunk>
								plot the data frame<br />
							</Tag>
							<Tag name='Response'>
								To plot the dataframe, we can use the `plot()` method of pandas dataframe. Here's the code:<br />
								```python<br />
								df.plot(x='Name', y='Age', kind='bar')<br />
								```<br />
							</Tag>
						</Tag>
						{aboveCellsInfo.length > 0 &&
							<Tag name='cellsAbove'>
								Here are the cells above the current cell that I am editing in this Jupyter Notebook:<br />
								{aboveCellsInfo.map((cell, index) => (this._renderCellContent(cell, index)))}
							</Tag>
						}
						{
							belowCellsInfo.length > 0 &&
							<Tag name='cellsBelow'>
								Here are the cells below the current cell that I am editing in this Jupyter Notebook:<br />
								{belowCellsInfo.map((cell, index) => (this._renderCellContent(cell, index + aboveCellsInfo.length + 1)))}
							</Tag>
						}
					</UserMessage>
				}
			</>
		);
	}

	private _renderCellContent(cell: CodeContextRegion, index: number) {
		const code = createFencedCodeBlock(cell.language.languageId, cell.lines.join('\n'));
		return <IndexedTag name='cell' index={index}>
			<TextChunk>
				{code}
			</TextChunk>
		</IndexedTag>;
	}
}

export type IndexedTagProps = PromptElementProps<{
	name: string;
	index: number;
}>;

export class IndexedTag extends PromptElement<IndexedTagProps> {

	private static readonly _regex = /^[a-zA-Z_][\w\.\-]*$/;

	render() {
		const { name, index } = this.props;

		if (!IndexedTag._regex.test(name)) {
			throw new Error(`Invalid tag name: ${this.props.name}`);
		}

		return (
			<>
				{'<'}{name} index={index}{'>'}<br />
				<>
					{this.props.children}<br />
				</>
				{'</'}{name}{'>'}
			</>
		);
	}
}

//#region Utility
export function generateSelectionContextInNotebook(
	tokensBudget: number,
	documentContext: IDocumentContext,
	range: Range,
	tabsAndEditorsService: ITabsAndEditorsService,
	workspaceService: IWorkspaceService
) {
	// 4 chars per token
	const charLimit = (tokensBudget * 4);
	const initialTracker = new CodeContextTracker(charLimit);

	const initialContext = getSelectionAndCodeAroundSelection(
		documentContext.document,
		documentContext.selection,
		range,
		new Range(0, 0, documentContext.document.lineCount, 0),
		documentContext.language,
		initialTracker
	);

	return generateNotebookCellContext(tabsAndEditorsService, workspaceService, documentContext, initialContext, initialTracker);
}
//#endregion

//#region Custom Notebook

export const CustomNotebookExamples = [
	{
		viewType: 'polyglot-notebook',
		exampleCells: [
			{ lan: 'markdown', source: 'Samples' },
			{ lan: 'csharp', source: 'using Microsoft.Data.Analysis;' },
			{ lan: 'csharp', source: 'DateTimeDataFrameColumn dateTimes = new DateTimeDataFrameColumn(\"DateTimes\");\n Int32DataFrameColumn ints = new Int32DataFrameColumn(\"Ints\", 6);\n StringDataFrameColumn strings = new StringDataFrameColumn(\"Strings\", 6);' },
			{ lan: 'csharp', source: 'dateTimes.Append(DateTime.Parse(\"2019/01/01\"));' }
		]
	},
	{
		viewType: 'sql-notebook',
		exampleCells: [
			{ lan: 'sql', source: 'SELECT * FROM users;' },
		]
	},
	{
		viewType: 'node-notebook',
		exampleCells: [
			{ lan: 'javascript', source: `console.log("Hello World");` },
			{ lan: 'javascript', source: `const {display} = require('node-kernel');` },
			{ lan: 'markdown', source: '# Plain text output' },
			{ lan: 'javascript', source: `display.text('Hello World');` },
		]
	},
	{
		viewType: 'sas-notebook',
		exampleCells: [
			{ lan: 'sas', source: 'proc print data=sashelp.class; run;' },
			{ lan: 'sas', source: 'data race;\npr = probnorm(-15/sqrt(325));\nrun;\n\nproc print data=race;\nvar pr;\nrun;\n' },
		]
	},
	{
		viewType: 'http-notebook',
		exampleCells: [
			{ lan: 'http', source: 'GET https://httpbin.org/get' },
			{ lan: 'http', source: 'POST https://httpbin.org/post' },
		]
	},
	{
		viewType: 'powerbi-notebook',
		exampleCells: [
			{ lan: 'markdown', source: '# Get Groups' },
			{ lan: 'powerbi-api', source: 'GET /groups' },
			{ lan: 'powerbi-api', source: '%dax /groups/ccce57d1-10af-1234-1234-665f8bbd8458/datasets/51ba6d4b-1234-1234-8635-a7d743a5ea89\nEVALUATE INFO.TABLES()\nThis' },
		]
	},
	{
		viewType: 'wolfram-language-notebook',
		exampleCells: [
			{ lan: 'wolfram', source: 'Plot[Sin[x], {x, 0, 2 Pi}]' },
		]
	},
	{
		viewType: 'github-issues',
		exampleCells: [
			{ lan: 'github-issues', source: '$vscode=repo:microsoft/vscode\n$milestone=milestone:"May 2020"' },
			{ lan: 'github-issues', source: '$vscode $milestone is:closed author:@me -assignee:@me label:bug -label:verified' },
			{ lan: 'github-issues', source: '$vscode assignee:@me is:open label:freeze-slow-crash-leak' },
		]
	},
	{
		viewType: 'rest-book',
		exampleCells: [
			{ lan: 'rest-book', source: 'GET google.com' },
			{ lan: 'rest-book', source: 'GET https://www.google.com\n    ?query="fun"\n    &page=2\n    User-Agent: rest-book\n    Content-Type: application/json' },
		]
	}
];

export interface CustomNotebookExampleRendererProps extends BasePromptElementProps {
	viewType: String;
}

export class CustomNotebookExampleRenderer extends PromptElement<CustomNotebookExampleRendererProps> {
	render() {
		const viewType = this.props.viewType;
		const matchedExample = CustomNotebookExamples.find(example => example.viewType === this.props.viewType);
		if (!matchedExample) {
			return <></>;
		}

		const { exampleCells } = matchedExample;

		return (
			<UserMessage>
				Below you will find a set of example cells for a {viewType} notebook.<br />
				{
					exampleCells.map((cell, index) => (
						<>
							CELL INDEX: {index}:<br />
							```{cell.lan}<br />
							{cell.source}<br />
							<br />
							```
						</>
					))
				}
			</UserMessage>
		);
	}
}

function findNotebookType(
	workspaceService: IWorkspaceService,
	uri: vscode.Uri
) {
	const notebook = workspaceService.notebookDocuments.find(
		doc =>
			doc.uri.fsPath === uri.fsPath
	);

	return notebook?.notebookType;
}

export class InlineChatCustomNotebookInfoRenderer extends PromptElement<InlineChatNotebookSelectionCommonProps> {
	constructor(
		props: InlineChatNotebookSelectionCommonProps,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService
	) {
		super(props);
	}
	render(state: void, sizing: PromptSizing) {
		if (!isNotebookCellOrNotebookChatInput(this.props.documentContext.document.uri)) {
			throw illegalArgument('InlineChatCustomNotebookInfoRenderer should be used only with a notebook!');
		}

		const notebookType = findNotebookType(this.workspaceService, this.props.documentContext.document.uri);
		const matchedExample = CustomNotebookExamples.find(example => example.viewType === notebookType);
		const notebookTypeName = matchedExample ? notebookType : 'custom';

		return (
			<>
				{
					<UserMessage>
						I am working on a {notebookTypeName} notebook in VS Code.<br />
						{notebookTypeName} notebooks in VS Code are documents that contain a mix of rich Markdown, executable code snippets, <br />
						and accompanying rich output. These are all separated into distinct cells and can be interleaved in any order <br />
						A {notebookTypeName} notebook contains multiple cells.<br />
					</UserMessage>
				}
				{
					matchedExample &&
					<CustomNotebookExampleRenderer viewType={matchedExample.viewType} />
				}
			</>
		);
	}
}

export interface InlineChatCustomNotebookCellsContextRendererProps extends InlineChatNotebookSelectionCommonProps {
	aboveCells?: CodeContextRegion[];
	belowCells?: CodeContextRegion[];
}

export class InlineChatCustomNotebookCellsContextRenderer extends PromptElement<InlineChatCustomNotebookCellsContextRendererProps> {
	render(state: void, sizing: PromptSizing) {
		if (!isNotebookCellOrNotebookChatInput(this.props.documentContext.document.uri)) {
			throw illegalArgument('InlineChatCustomNotebookCellsContextRenderer should be used only with a notebook!');
		}

		const { aboveCells, belowCells, documentContext } = this.props;
		const aboveCellsInfo = aboveCells || [];
		const belowCellsInfo = belowCells || [];
		const lang = documentContext.language;
		return (
			<>
				{
					(aboveCellsInfo.length > 0 || belowCellsInfo.length > 0) &&
					<UserMessage>
						The content of cells are listed below, each cell starts with CELL INDEX and a code block started with ```{lang.languageId}<br />
						Each cell is a block of code that can be executed independently.<br />
						Do not generate CELL INDEX in your answer, it is only used to help you understand the context.<br />
						<br />
						Below you will find a set of examples of what you should respond with. Please follow the exmaples on how to avoid repeating code.<br />
						{aboveCellsInfo.length > 0 && <NotebookCellList cells={aboveCellsInfo} title={'Here are the cells in this custom notebook:\n'} />}
						{belowCellsInfo.length > 0 && <NotebookCellList cells={belowCellsInfo} cellIndexDelta={aboveCellsInfo.length + 1} title={'Here are the cells below the current cell that I am editing in this custom notebook:\n'} />}
					</UserMessage>
				}
			</>
		);
	}
}

//#endregion

//#region Variables
type InlineChatNotebookVariablesPromptProps = PromptElementProps<{
	notebookURI: vscode.Uri;
	query: string;
	priorities: NotebookPromptPriority;
}>;

interface InlineChatNotebookRuntimeState {
	variables: VariablesResult[];
	packages: PipPackage[];
}

export class InlineChatNotebookVariables extends PromptElement<InlineChatNotebookVariablesPromptProps, InlineChatNotebookRuntimeState> {
	constructor(
		props: InlineChatNotebookVariablesPromptProps,
		@ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
		@INotebookService private readonly notebookService: INotebookService,
	) {
		super(props);
	}

	override async prepare(): Promise<InlineChatNotebookRuntimeState> {
		if (this.tabsAndEditorsService.activeNotebookEditor?.notebook.uri.path !== this.props.notebookURI.path) {
			return { variables: [], packages: [] };
		}

		const notebookEditor = this.tabsAndEditorsService.activeNotebookEditor;
		const notebook = notebookEditor?.notebook;
		if (!notebook) {
			return { variables: [], packages: [] };
		}

		const fetchVariables = this.notebookService.getVariables(notebook.uri);
		// disable fetching available packages
		const fetchPackages = Promise.resolve([]);
		const [variables, packages] = await Promise.all([fetchVariables, fetchPackages]);
		return { variables, packages };
	}

	render(state: InlineChatNotebookRuntimeState) {
		const { priorities } = this.props;
		return (
			<TokenLimit max={16384}>
				{state.variables.length !== 0 &&
					<>
						<UserMessage priority={priorities.runtimeCore}>
							The following variables are present in this Jupyter Notebook:
							{
								state.variables.map((variable) => (
									<>
										<TextChunk>
											Name: {variable.variable.name}<br />
											{variable.variable.type && <>Type: {variable.variable.type}</>}<br />
											Value: {variable.variable.value}<br />
											{variable.indexedChildrenCount > 0 && <>Length: {variable.indexedChildrenCount}</>}<br />
											{variable.variable.summary && <>Summary: {variable.variable.summary}</>}
										</TextChunk>
									</>
								))

							}
						</UserMessage>
					</>}
				{state.packages.length !== 0 &&
					<>
						<UserMessage priority={priorities.other}>
							The following pip packages are available in this Jupyter Notebook:
							{
								state.packages.map((pkg) => (
									<>
										<TextChunk>{pkg.name}=={pkg.version}</TextChunk>
										<br />
									</>
								))
							}
						</UserMessage>
					</>
				}
			</TokenLimit>
		);
	}
}

//#endregion
