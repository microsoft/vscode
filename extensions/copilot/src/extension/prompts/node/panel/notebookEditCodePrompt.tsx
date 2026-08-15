/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptSizing } from '@vscode/prompt-tsx';
import type { Uri } from 'vscode';
import { IAlternativeNotebookContentService } from '../../../../platform/notebook/common/alternativeContent';
import { INotebookService } from '../../../../platform/notebook/common/notebookService';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { findNotebook, getNotebookAndCellFromUri, isJupyterNotebookUri } from '../../../../util/common/notebooks';
import { isLocation, isUri } from '../../../../util/common/types';
import { coalesce } from '../../../../util/vs/base/common/arrays';
import { ResourceSet } from '../../../../util/vs/base/common/map';
import { Schemas } from '../../../../util/vs/base/common/network';
import { extname } from '../../../../util/vs/base/common/resources';
import { URI } from '../../../../util/vs/base/common/uri';
import { isNotebookVariable } from '../../../intents/node/editCodeStep';
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { isNotebookWorkingSetEntry, IWorkingSet } from '../../../prompt/common/intents';
import { IPromptEndpoint } from '../base/promptRenderer';
import { Tag } from '../base/tag';
import { ExampleCodeBlock } from './safeElements';


export interface NotebookFormatPromptProps extends BasePromptElementProps {
	readonly chatVariables: ChatVariablesCollection | IWorkingSet;
	readonly query: string;
}

export class NotebookReminderInstructions extends PromptElement<NotebookFormatPromptProps> {
	constructor(
		props: NotebookFormatPromptProps,
		@INotebookService private readonly notebookService: INotebookService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
	) {
		super(props);
	}

	public override render(_state: void, _sizing: PromptSizing) {
		const notebookRelatedUris = this.props.chatVariables instanceof ChatVariablesCollection ?
			getNotebookUrisFromChatVariables(this.props.chatVariables, this._workspaceService, this.notebookService) :
			this.props.chatVariables.filter(entry => isNotebookWorkingSetEntry(entry)).map(entry => entry.document.uri);
		if (notebookRelatedUris.length || queryContainsNotebookSpecificKeywords(this.props.query)) {
			return <>Do not show Cell IDs to the user.<br /></>;
		}
	}
}

export class NotebookFormat extends PromptElement<NotebookFormatPromptProps> {
	constructor(
		props: NotebookFormatPromptProps,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IAlternativeNotebookContentService private readonly alternativeNotebookContentService: IAlternativeNotebookContentService,
		@INotebookService private readonly notebookService: INotebookService,
		@IWorkspaceService private readonly _workspaceService: IWorkspaceService,
		@IPromptEndpoint private readonly _promptEndpoint: IPromptEndpoint,
	) {
		super(props);
	}

	public override render(_state: void, _sizing: PromptSizing) {
		// These could be cell uris or output uris etc.
		const notebookRelatedUris = this.props.chatVariables instanceof ChatVariablesCollection ?
			getNotebookUrisFromChatVariables(this.props.chatVariables, this._workspaceService, this.notebookService) :
			this.props.chatVariables.filter(entry => isNotebookWorkingSetEntry(entry)).map(entry => entry.document.uri);
		if (notebookRelatedUris.length || queryContainsNotebookSpecificKeywords(this.props.query)) {
			const notebookUris = getNotebookUris(notebookRelatedUris, this._workspaceService);
			return <>
				<Tag name='notebookFormatInstructions'>
					{this.getNotebookFormatInstructions(notebookUris)}
				</Tag>
				{this.getListOfNotebookFiles(notebookUris)}
			</>;
		}
	}
	private getListOfNotebookFiles(notebookUris: Uri[]) {
		if (notebookUris.length) {
			return <>
				<br />
				The following files are notebooks:<br />
				{notebookUris.map(uri => (<>- {uri.toString()}<br /></>))}
				<br />
			</>;
		} else {
			return <></>;
		}
	}

	private getNotebookFormatInstructions(notebookUris: Uri[]) {
		const hasJupyterNotebook = notebookUris.some(uri => isJupyterNotebookUri(uri));
		const extension = (hasJupyterNotebook || notebookUris.length === 0) ? '.ipynb' : extname(notebookUris[0]);
		const tsExampleFilePath = this.promptPathRepresentationService.getExampleFilePath(`/Users/someone/proj01/example${extension}`);
		switch (this.alternativeNotebookContentService.getFormat(this._promptEndpoint)) {
			case 'xml':
				return <NotebookXmlFormatPrompt tsExampleFilePath={tsExampleFilePath} />;
			case 'text':
				return <NotebookTextFormatPrompt tsExampleFilePath={tsExampleFilePath} />;
			default:
				return <NotebookJsonFormatPrompt tsExampleFilePath={tsExampleFilePath} />;

		}
	}
}

function queryContainsNotebookSpecificKeywords(query: string): boolean {
	const keywords = ['notebook', 'jupyter'];
	return keywords.some(keyword => query.toLowerCase().includes(keyword));
}

function getNotebookUris(uris: Uri[], workspace: IWorkspaceService): Uri[] {
	return Array.from(new ResourceSet(coalesce(uris.map(uri => {
		const nb = findNotebook(uri, workspace.notebookDocuments);
		if (nb) {
			return nb.uri;
		}
		const info = getNotebookAndCellFromUri(uri, workspace.notebookDocuments);
		if (info[0]) {
			return info[0].uri;
		}
		return undefined;
	}))));
}

function getNotebookUrisFromChatVariables(chatVariables: ChatVariablesCollection, workspaceService: IWorkspaceService, notebookService: INotebookService): URI[] {
	const notebookUris = [];
	for (const chatVar of chatVariables) {
		let notebookUri: Uri | undefined;
		if (isNotebookVariable(chatVar.value)) {
			// Notebook cell or output
			const [notebook,] = getNotebookAndCellFromUri(chatVar.value, workspaceService.notebookDocuments);
			if (chatVar.value.scheme === Schemas.vscodeNotebookCellOutput) {
				continue;
			}
			notebookUri = notebook?.uri;
		} else if (isUri(chatVar.value)) {
			notebookUri = chatVar.value;
		} else if (isLocation(chatVar.value)) {
			notebookUri = chatVar.value.uri;
		}
		if (notebookUri && notebookService.hasSupportedNotebooks(notebookUri)) {
			notebookUris.push(notebookUri);
		}
	}
	return notebookUris;
}

interface NotebookFormatCommonPromptProps extends BasePromptElementProps {
	readonly tsExampleFilePath: string;
}

export class NotebookXmlFormatPrompt extends PromptElement<NotebookFormatCommonPromptProps> {
	constructor(
		props: NotebookFormatCommonPromptProps
	) {
		super(props);
	}
	async render(_state: void, _sizing: PromptSizing) {
		return <>
			When generating notebook content, use an XML-based format. <br />
			1. Each cell must be wrapped in a {'<VSCode.Cell>'} with a `language` attribute indicating the type of content. (e.g., `markdown`, `python`). <br />
			2. Existing cells must contain the `id` attribute to uniquely identify each cell. <br />
			3. New cells do not need an `id` attribute. <br />
			4. Ensure that each {'<VSCode.Cell>'} is valid XML and logically structured. <br />
			5. Do not XML encode the contents within each {'<VSCode.Cell>'} cell. <br />
			6. Do not reference the XML tags {`<VSCode.Cell>`} in user messages. <br />
			7. Do not reference Cell Ids (as users cannot see these values) in user messages, instead use the Cell number (starting from 1). <br />
			<br />
			Here is sample content of a Notebook document:<br />
			<br />
			<Tag name='example'>
				<ExampleCodeBlock languageId='xml' examplePath={this.props.tsExampleFilePath} includeFilepath={true} minNumberOfBackticks={4}
					code={[
						`<VSCode.Cell id="f8939937" language="markdown">`,
						`# Import Required Libraries`,
						`Import the necessary libraries, including pandas and plotly.`,
						`</VSCode.Cell>`,
						`<VSCode.Cell id="0b4e03d1" language="python">`,
						`# Import Required Libraries`,
						`import pandas as pd`,
						`import plotly.express as px`,
						`</VSCode.Cell>`,
					].join('\n')}
				/>
			</Tag>
		</>;
	}
}

class NotebookJsonFormatPrompt extends PromptElement<NotebookFormatCommonPromptProps> {
	constructor(
		props: NotebookFormatCommonPromptProps
	) {
		super(props);
	}
	async render(_state: void, _sizing: PromptSizing) {
		return <>
			When generating notebook content, use a JSON format. <br />
			1. Each cell must be a valid JSON object within the {'cells'} array property with a `metadata.language` property indicating the type of content (e.g., `markdown`, `python`). <br />
			2. Existing cells must contain the `metadata.id` property to uniquely identify each cell. <br />
			3. New cells do not need a `metadata.id` property. <br />
			4. Ensure the content is valid JSON and logically structured. <br />
			5. Do not reference Cell Ids (as users cannot see these values) in user messages, instead use the Cell number (starting from 1). <br />
			<br />
			Here is sample content of a Notebook document:<br />
			<br />
			<Tag name='example'>
				<ExampleCodeBlock languageId='json' examplePath={this.props.tsExampleFilePath} includeFilepath={true} minNumberOfBackticks={4}
					code={[
						`{`,
						`  cells: [`,
						`    {`,
						`      cell_type: "markdown",`,
						`      metadata: {`,
						`          id: "f8939937",`,
						`          language: "markdown"`,
						`      },`,
						`      source: [`,
						`          "# Import Required Libraries",`,
						`          "Import the necessary libraries, including pandas and plotly."`,
						`      ]`,
						`    },`,
						`    {`,
						`      cell_type: "code",`,
						`      metadata: {`,
						`          id: "0b4e03d1",`,
						`          language: "python"`,
						`      },`,
						`      source: [`,
						`          "# Import Required Libraries",`,
						`          "import pandas as pd",`,
						`          "import plotly.express as px"`,
						`      ]`,
						`    }`,
						`  ]`,
						`}`,
					].join('\n')}
				/>
			</Tag>
		</>;
	}
}

class NotebookTextFormatPrompt extends PromptElement<NotebookFormatCommonPromptProps> {
	constructor(
		props: NotebookFormatCommonPromptProps
	) {
		super(props);
	}
	async render(_state: void, _sizing: PromptSizing) {
		return <>
			When generating notebook content, use a Jupytext like format. <br />
			1. Each cell must begin with a comment beginning with `#%% vscode.cell` followed by the cell attributes.<br />
			2. For existing cell in the document, use the `id` attribute to identify the cell. If the cell is new, DO NOT include the `id` attribute.<br />
			3. Use the `language` attribute to define the language of the content (e.g., `markdown`, `python`). <br />
			4. For markdown cells, use triple quotes to wrap the content.<br />
			5. Ensure that each cell is logically structured. <br />
			6. Do not reference Cell Ids (as users cannot see these values) in user messages, instead use the Cell number (starting from 1). <br />
			<br />
			Here is sample content of a Notebook document:<br />
			<br />
			<Tag name='example'>
				<ExampleCodeBlock languageId='python' examplePath={this.props.tsExampleFilePath} includeFilepath={true} minNumberOfBackticks={4}
					code={[
						`#%% vscode.cell [id=0fd89b28] [language=markdown]`,
						`"""`,
						`# Import Required Libraries`,
						`Import the necessary libraries, including pandas and plotly.`,
						`"""`,
						`#%% vscode.cell [id=0b4e03d1] [language=python]`,
						`# Import Required Libraries`,
						`import pandas as pd`,
						`import plotly.express as px`,
					].join('\n')}
				/>
			</Tag>
		</>;
	}
}
