/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import { BasePromptElementProps, PromptElement, PromptPiece, PromptSizing, TextChunk } from '@vscode/prompt-tsx';
import type * as vscode from 'vscode';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { FileType } from '../../../platform/filesystem/common/fileTypes';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IInstantiationService, ServicesAccessor } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelPromptTsxPart, LanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { renderPromptElementJSON } from '../../prompts/node/base/promptRenderer';
import { ToolName } from '../common/toolNames';
import { ToolRegistry } from '../common/toolsRegistry';
import { formatUriForFileWidget } from '../common/toolUtils';
import { checkCancellation, isDirExternalAndNeedsConfirmation, resolveToolInputPath } from './toolUtils';
import { IBuildPromptContext } from '../../prompt/common/intents';

interface IListDirParams {
	path: string;
}

class ListDirTool implements vscode.LanguageModelTool<IListDirParams> {
	public static readonly toolName = ToolName.ListDirectory;
	public static readonly nonDeferred = true;

	private _promptContext: IBuildPromptContext | undefined;

	constructor(
		@IFileSystemService private readonly fsService: IFileSystemService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IListDirParams>, token: CancellationToken) {
		const uri = resolveToolInputPath(options.input.path, this.promptPathRepresentationService);

		checkCancellation(token);
		const contents = await this.fsService.readDirectory(uri);

		checkCancellation(token);
		return new LanguageModelToolResult([
			new LanguageModelPromptTsxPart(
				await renderPromptElementJSON(this.instantiationService, ListDirResult, { results: contents }, options.tokenizationOptions, token))]);
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IListDirParams>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation | undefined> {
		const uri = resolveToolInputPath(options.input.path, this.promptPathRepresentationService);

		// Check if directory is external (outside workspace)
		const isExternal = this.instantiationService.invokeFunction(
			(accessor: ServicesAccessor) => isDirExternalAndNeedsConfirmation(accessor, uri, this._promptContext, { readOnly: true })
		);

		if (isExternal) {
			const message = this.workspaceService.getWorkspaceFolders().length === 1
				? new MarkdownString(l10n.t`${formatUriForFileWidget(uri)} is outside of the current folder.`)
				: new MarkdownString(l10n.t`${formatUriForFileWidget(uri)} is outside of the current workspace.`);

			return {
				invocationMessage: new MarkdownString(l10n.t`Reading ${formatUriForFileWidget(uri)}`),
				pastTenseMessage: new MarkdownString(l10n.t`Read ${formatUriForFileWidget(uri)}`),
				confirmationMessages: {
					title: l10n.t`Allow reading external directory?`,
					message,
				}
			};
		}

		return {
			invocationMessage: new MarkdownString(l10n.t`Reading ${formatUriForFileWidget(uri)}`),
			pastTenseMessage: new MarkdownString(l10n.t`Read ${formatUriForFileWidget(uri)}`),
		};
	}

	async resolveInput(input: IListDirParams, promptContext: IBuildPromptContext): Promise<IListDirParams> {
		this._promptContext = promptContext;
		return input;
	}
}

ToolRegistry.registerTool(ListDirTool);

interface ListDirResultProps extends BasePromptElementProps {
	results: [string, FileType][];
}

class ListDirResult extends PromptElement<ListDirResultProps> {
	override render(state: void, sizing: PromptSizing): PromptPiece<any, any> | undefined {
		if (this.props.results.length === 0) {
			return <>Folder is empty</>;
		}

		return <>
			{this.props.results.map(([name, type]) => <TextChunk>{name}{type === FileType.Directory ? '/' : ''}</TextChunk>)}
		</>;
	}
}
