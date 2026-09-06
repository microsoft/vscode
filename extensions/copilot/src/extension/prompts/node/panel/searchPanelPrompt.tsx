/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, SystemMessage, TextChunk, UserMessage } from '@vscode/prompt-tsx';
import { FileChunk } from '../../../../platform/chunking/common/chunk';
import { IChatEndpoint } from '../../../../platform/networking/common/networking';
import { getWorkspaceFileDisplayPath, IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import { createFencedCodeBlock, getLanguageId } from '../../../../util/common/markdown';
import { IBuildPromptContext } from '../../../prompt/common/intents';
import { CopilotIdentityRules } from '../base/copilotIdentity';
import { InstructionMessage } from '../base/instructionMessage';
import { ResponseTranslationRules } from '../base/responseTranslationRules';
import { SafetyRules } from '../base/safetyRules';
import { ChatToolReferences, ChatVariablesAndQuery } from './chatVariables';
import { HistoryWithInstructions } from './conversationHistory';
import { EditorIntegrationRules } from './editorIntegrationRules';

export interface ISearchPanelPromptProps extends BasePromptElementProps {
	promptContext: ISearchPanelPromptContext;
	endpoint: IChatEndpoint;
}

export interface ISearchPanelPromptContext extends IBuildPromptContext {
	chunkResults: FileChunk[];
}

export interface ISearchChunkResultProps extends BasePromptElementProps {
	chunkResults: FileChunk[];
}

export class SearchChunkResult extends PromptElement<ISearchChunkResultProps> {
	constructor(props: ISearchChunkResultProps,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
	) {
		super(props);
	}

	override render(): PromptPiece<any, any> | undefined {
		if (!this.props.chunkResults.length) {
			return;
		}

		return <>
			{this.props.chunkResults
				.map((chunk, i) => {
					// Give chunks a scaled priority from `X` to `X + 1` with the earliest chunks having the highest priority
					const priority = typeof this.props.priority !== 'undefined'
						? this.props.priority + (1 - ((i + 1) / this.props.chunkResults.length))
						: undefined;

					return { chunk, priority };
				})
				// Send chunks in reverse order with most relevant chunks last
				.reverse()
				.filter(x => x.chunk.text)
				.map(({ chunk, priority }) => {
					const fileLabel = getWorkspaceFileDisplayPath(this.workspaceService, chunk.file);
					return <TextChunk priority={priority}>
						{chunk.isFullFile
							? `Here is the full text of \`${fileLabel}\`:`
							: `Here is a potentially relevant text excerpt in \`${fileLabel}\` starting at line ${chunk.range.startLineNumber}:`}<br />
						{createFencedCodeBlock(getLanguageId(chunk.file), chunk.text)}<br /><br />
					</TextChunk>;
				})}
		</>;
	}
}

export class SearchPanelPrompt extends PromptElement<ISearchPanelPromptProps> {
	private base64Code = `
\`\`\`json
[
	{
		"file": "/src/encoders/base64.ts",
		"query": "/src/encoders/base64.ts:private async decodeFunction()"
	}
]
\`\`\`
`;
	private npmCode = `
\`\`\`json
[
	{
		"file": "/package.json",
		"query": "npm run test"
	},
	{
		"file": "/src/second-package/package.json",
		"query": "npm run production"
	}
]
\`\`\`
`;
	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		const { query, history, chatVariables } = this.props.promptContext;
		return <>
			<SystemMessage priority={1000}>
				You are a software engineer with expert knowledge of the codebase the user has open in their workspace.<br />
				You will be provided with a few code excerpts, file names, and symbols from the user's that have been extracted as important to the user's query.<br />
				Your job is to understand what the user is searching for and find the relevant piece of code.<br />
				That piece of code will be searched for using grep in the user's workspace.<br />
				<br />
				<CopilotIdentityRules />
				<SafetyRules />
			</SystemMessage>
			<HistoryWithInstructions flexGrow={2} historyPriority={400} history={history} passPriority>
				<InstructionMessage priority={1000}>
					<EditorIntegrationRules />
					<ResponseTranslationRules />
					# Additional Rules<br />
					Think step by step:<br />
					1. Read the provided relevant workspace information (code excerpts, file names, and symbols) to understand the user's workspace.<br />
					2. Select ONLY from the provided code excerpts, file names, and symbols any code snippets that are relevant to the user's query.<br />
					3. Provide ONE query FOR EACH code excerpt the user should search for in order to find the relevant wrapping code, prioritizing the most meaningful code, class names, functions, definitions, etc.<br />
					<br />
					You MUST ONLY consider the included code excerpts, file names and symbols to provide your answer.<br />
					You MUST only return the file path and the query or phrase to search for using grep<br />
					You MUST avoid returning queries that are too short and too generic that would return a lot of noisy results<br />
					You MUST return one query per code excerpt provided<br />
					<br />
					# Examples<br />
					Question:<br />
					base64 encoding<br />
					<br />
					Response:<br />
					{this.base64Code}
					<br />
					<br />
					Question:<br />
					npm scripts<br />
					<br />
					Response:<br />
					{this.npmCode}
				</InstructionMessage>
			</HistoryWithInstructions>
			<UserMessage>
				<SearchChunkResult priority={898} chunkResults={this.props.promptContext.chunkResults} />
				<ChatToolReferences priority={899} flexGrow={3} promptContext={this.props.promptContext} />
				<ChatVariablesAndQuery flexGrow={3} chatVariables={chatVariables} priority={900} query={`Here is the user query: ${query}`} />
			</UserMessage>
		</>;
	}
}
