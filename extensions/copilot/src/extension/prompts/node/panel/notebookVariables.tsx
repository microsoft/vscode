/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptElementProps, PromptSizing, TextChunk, TokenLimit } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ILogService } from '../../../../platform/log/common/logService';
import { parseAndCleanStack } from '../../../../platform/notebook/common/helpers';
import { INotebookService, VariablesResult } from '../../../../platform/notebook/common/notebookService';
import { IPromptPathRepresentationService } from '../../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { getNotebookCellOutput, isJupyterNotebookUri } from '../../../../util/common/notebooks';
import { URI } from '../../../../util/vs/base/common/uri';
import { IPromptEndpoint } from '../base/promptRenderer';
import { Tag } from '../base/tag';
import { getCharLimit } from '../inline/summarizedDocument/summarizeDocumentHelpers';
import { Image } from './image';

type NotebookVariablesPromptProps = PromptElementProps<{
	notebook: vscode.NotebookDocument;
}>;

interface InlineChatNotebookRuntimeState {
	variables: VariablesResult[];
}

export class NotebookVariables extends PromptElement<NotebookVariablesPromptProps, InlineChatNotebookRuntimeState> {
	constructor(
		props: NotebookVariablesPromptProps,
		@INotebookService private readonly notebookService: INotebookService,
		@IPromptPathRepresentationService private readonly _promptPathRepresentationService: IPromptPathRepresentationService,
		@ILogService private readonly logger: ILogService,
	) {
		super(props);
	}

	override async prepare(): Promise<InlineChatNotebookRuntimeState> {
		try {
			this.logger.trace(`Fetching notebook variables for ${this.props.notebook.uri.toString()}`);
			const variables = await this.notebookService.getVariables(this.props.notebook.uri);
			return { variables };
		} catch (error) {
			this.logger.error(`Failed to get notebook variables for ${this.props.notebook.uri.toString()}: ${error}`);
			return { variables: [] };
		}
	}

	render(state: InlineChatNotebookRuntimeState) {
		const filePath = this._promptPathRepresentationService.getFilePath(this.props.notebook.uri);
		const isJupyterNotebook = isJupyterNotebookUri(this.props.notebook.uri);
		const notebookType = isJupyterNotebook ? 'Jupyter Notebook' : 'Notebook';
		if (state.variables.length === 0) {
			return (<></>);
		}

		return (
			<TokenLimit max={16384}>
				&lt;notebook-kernel-variables&gt;<br />
				{state.variables.length !== 0 &&
					<>
						The following variables are present in the {notebookType} {filePath}:
						{
							state.variables.map((variable) => (
								<>
									<TextChunk>
										Name: {variable.variable.name}<br />
										{variable.variable.type && <>Type: {variable.variable.type}</>}<br />
									</TextChunk>
								</>
							))

						}
					</>}
				&lt;/notebook-kernel-variables&gt;<br />
			</TokenLimit>
		);
	}
}


export interface INotebookCellOutputProps extends BasePromptElementProps {
	outputUri: URI;
}


export class NotebookCellOutputVariable extends PromptElement<INotebookCellOutputProps> {
	constructor(
		props: PromptElementProps<INotebookCellOutputProps>,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IPromptEndpoint private readonly promptEndpoint: IPromptEndpoint
	) {
		super(props);
	}

	render(state: void, sizing: PromptSizing) {
		const outputUri = this.props.outputUri;
		const outputInfo = getNotebookCellOutput(outputUri, this.workspaceService.notebookDocuments);
		if (!outputInfo) {
			return;
		}
		const [notebook, cell, notebookCellOutput] = outputInfo;
		const outputIndex = cell.outputs.indexOf(notebookCellOutput);

		const allowedTextMimeTypes = ['text/plain', 'text/html', 'text/markdown', 'application/vnd.code.notebook.stdout', 'application/vnd.code.notebook.error', 'application/vnd.code.notebook.stderr'];
		const item = notebookCellOutput.items.length ? notebookCellOutput.items[0] : undefined;
		if (!item || (!allowedTextMimeTypes.includes(item.mime) && !item.mime.startsWith('image/'))) {
			return <></>;
		}
		let text;
		const cellIndex = cell.index;
		const notebookPath = this.promptPathRepresentationService.getFilePath(notebook.uri);
		if (item.mime === 'image/png') {
			if (this.promptEndpoint.supportsVision) {
				text = (
					<>
						<br />
						<Tag name={`cell-output`} attrs={{ mimeType: item.mime, outputIndex, cellIndex, notebookPath }}>
							<Image variableName={`cell-output-image-${outputIndex}`} variableValue={item.data} />
						</Tag>

					</>
				);
			} else {
				text = (<>
					<br />
					The user attempted to attach an image which is the output from the cell with index: {cellIndex} of the notebook {notebookPath} but
					images cannot be sent to this endpoint at this time and is therefore not attached. <br />
					<br />
				</>);
			}
		} else {
			// force 1/4 of the token budget for text
			const textSize = getCharLimit(sizing.tokenBudget / 4);
			let textChunk = item.data.toString();
			if (item.mime === 'application/vnd.code.notebook.stderr' || item.mime === 'application/vnd.code.notebook.error') {
				textChunk = parseAndCleanStack(textChunk);
			}
			if (textChunk.length > textSize) {
				textChunk = textChunk.substring(0, textSize);
			}
			text = (
				<>
					<br />
					<Tag name={`notebook-cell-output`} attrs={{ mimeType: item.mime, outputIndex, cellIndex, notebookPath }}>
						{textChunk}
					</Tag>
				</>
			);
		}
		return text;
	}
}

//#endregion
