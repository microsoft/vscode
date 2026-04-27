/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { createFencedCodeBlock } from '../../../util/common/markdown';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelTextPart, LanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { formatUriForFileWidget } from '../common/toolUtils';
import { createEditConfirmation } from './editFileToolUtils';
import { resolveToolInputPath } from './toolUtils';

export interface ICreateDirectoryParams {
	dirPath: string;
}

export class CreateDirectoryTool implements ICopilotTool<ICreateDirectoryParams> {
	public static toolName = ToolName.CreateDirectory;

	constructor(
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<ICreateDirectoryParams>, token: vscode.CancellationToken) {
		const uri = this.promptPathRepresentationService.resolveFilePath(options.input.dirPath);
		if (!uri) {
			throw new Error(`Invalid directory path`);
		}

		await this.fileSystemService.createDirectory(uri);

		return new LanguageModelToolResult([
			new LanguageModelTextPart(
				`Created directory at ${this.promptPathRepresentationService.getFilePath(uri)}`,
			)
		]);
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<ICreateDirectoryParams>, token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation> {
		const uri = resolveToolInputPath(options.input.dirPath, this.promptPathRepresentationService);

		const confirmation = await this.instantiationService.invokeFunction(
			createEditConfirmation,
			[uri],
			undefined,
			async () => {
				return 'Creating the directory:\n\n' + createFencedCodeBlock('plaintext', uri.fsPath);
			},
			options.forceConfirmationReason
		);

		return {
			...confirmation,
			presentation: undefined,
			invocationMessage: new MarkdownString(l10n.t`Creating ${formatUriForFileWidget(uri)}`),
			pastTenseMessage: new MarkdownString(l10n.t`Created ${formatUriForFileWidget(uri)}`)
		};
	}
}

ToolRegistry.registerTool(CreateDirectoryTool);
