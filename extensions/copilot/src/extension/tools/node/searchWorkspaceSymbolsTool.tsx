/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptElementProps, PromptPiece, PromptReference, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { ILanguageFeaturesService } from '../../../platform/languages/common/languageFeaturesService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { ExtendedLanguageModelToolResult, LanguageModelPromptTsxPart, MarkdownString } from '../../../vscodeTypes';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { Tag } from '../../prompts/node/base/tag';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { checkCancellation } from './toolUtils';

interface ISearchWorkspaceSymbolsTool {
	symbolName: string;
}

class SearchWorkspaceSymbolsTool implements vscode.LanguageModelTool<ISearchWorkspaceSymbolsTool> {

	public static readonly toolName = ToolName.SearchWorkspaceSymbols;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ISearchWorkspaceSymbolsTool>, token: CancellationToken): Promise<vscode.LanguageModelToolResult> {
		const symbols = await this.languageFeaturesService.getWorkspaceSymbols(options.input.symbolName);
		checkCancellation(token);
		const result = await renderPromptElementJSON(this.instantiationService, WorkspaceSymbolSearchOutput, { symbols }, options.tokenizationOptions, token);

		const toolResult = new ExtendedLanguageModelToolResult([
			new LanguageModelPromptTsxPart(
				result)]);
		const query = `\`${options.input.symbolName}\``;

		toolResult.toolResultMessage = symbols.length === 0 ?
			new MarkdownString(l10n.t`Searched for ${query}, no results`) :
			symbols.length === 1 ?
				new MarkdownString(l10n.t`Searched for ${query}, 1 result`) :
				new MarkdownString(l10n.t`Searched for ${query}, ${symbols.length} results`);

		return toolResult;
	}

	prepareInvocation?(options: vscode.LanguageModelToolInvocationPrepareOptions<ISearchWorkspaceSymbolsTool>, token: vscode.CancellationToken): vscode.ProviderResult<vscode.PreparedToolInvocation> {
		const query = `\`${options.input.symbolName}\``;
		return {
			invocationMessage: l10n.t`Searching for ${query}`,
			pastTenseMessage: l10n.t`Searched for ${query}`
		};
	}
}

ToolRegistry.registerTool(SearchWorkspaceSymbolsTool);


interface IWorkspaceSymbolSearchOutputProps extends BasePromptElementProps {
	symbols: vscode.SymbolInformation[];
}

class WorkspaceSymbolSearchOutput extends PromptElement<IWorkspaceSymbolSearchOutputProps> {
	constructor(
		props: PromptElementProps<IWorkspaceSymbolSearchOutputProps>,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) {
		super(props);
	}

	override async render(state: void, sizing: PromptSizing, progress?: vscode.Progress<vscode.ChatResponsePart>, token?: vscode.CancellationToken): Promise<PromptPiece | undefined> {
		if (!this.props.symbols.length) {
			return <>No symbols found.</>;
		}

		const symbols = this.props.symbols.slice(0, 20);
		const maxResultsText = this.props.symbols.length > 20 ? ` (additional ${this.props.symbols.length - symbols.length} results omitted)` : '';

		return <>
			{<TextChunk priority={20}>{this.props.symbols.length} total result{this.props.symbols.length === 1 ? '' : 's'}{maxResultsText}</TextChunk>}
			{symbols.map((s, i) => (<><Tag name='symbol' priority={20 - i}>
				<references value={[new PromptReference(s.location, undefined, { isFromTool: true })]} />
				From {this.promptPathRepresentationService.getFilePath(s.location.uri)}, lines {s.location.range.start.line} to {s.location.range.end.line}:<br />
				Symbol: {s.name}, containing symbol: {s.containerName}
			</Tag><br /></>))}
			{symbols.length < this.props.symbols.length && <TextChunk priority={20}>...</TextChunk>}
		</>;
	}
}
