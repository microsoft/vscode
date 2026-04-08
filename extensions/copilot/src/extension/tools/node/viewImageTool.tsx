/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as l10n from '@vscode/l10n';
import type * as vscode from 'vscode';
import { IFileSystemService } from '../../../platform/filesystem/common/fileSystemService';
import { IImageService } from '../../../platform/image/common/imageService';
import { IPromptPathRepresentationService } from '../../../platform/prompts/common/promptPathRepresentationService';
import { IWorkspaceService } from '../../../platform/workspace/common/workspaceService';
import { dirname } from '../../../util/vs/base/common/resources';
import { URI } from '../../../util/vs/base/common/uri';
import { IInstantiationService } from '../../../util/vs/platform/instantiation/common/instantiation';
import { LanguageModelDataPart, LanguageModelTextPart, LanguageModelToolResult, MarkdownString } from '../../../vscodeTypes';
import { IBuildPromptContext } from '../../prompt/common/intents';
import { ToolName } from '../common/toolNames';
import { ICopilotTool, ToolRegistry } from '../common/toolsRegistry';
import { formatUriForFileWidget } from '../common/toolUtils';
import { getImageMimeType, MAX_IMAGE_FILE_SIZE } from './imageToolUtils';
import { assertFileNotContentExcluded, assertFileOkForTool, isFileExternalAndNeedsConfirmation, resolveToolInputPath } from './toolUtils';

export interface IViewImageParams {
	filePath: string;
}

export class ViewImageTool implements ICopilotTool<IViewImageParams> {
	public static readonly toolName = ToolName.ViewImage;
	public static readonly nonDeferred = true;

	private _promptContext: IBuildPromptContext | undefined;

	constructor(
		@IWorkspaceService private readonly workspaceService: IWorkspaceService,
		@IPromptPathRepresentationService private readonly promptPathRepresentationService: IPromptPathRepresentationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IFileSystemService private readonly fileSystemService: IFileSystemService,
		@IImageService private readonly imageService: IImageService,
	) { }

	async invoke(options: vscode.LanguageModelToolInvocationOptions<IViewImageParams>, _token: vscode.CancellationToken): Promise<LanguageModelToolResult> {
		const uri = resolveToolInputPath(options.input.filePath, this.promptPathRepresentationService);
		const imageMimeType = getImageMimeType(uri);
		if (!imageMimeType) {
			throw new Error(`Cannot view ${this.promptPathRepresentationService.getFilePath(uri)} with ${ToolName.ViewImage}. Use ${ToolName.ReadFile} for non-image files.`);
		}

		const stat = await this.fileSystemService.stat(uri);
		if (stat.size > MAX_IMAGE_FILE_SIZE) {
			return new LanguageModelToolResult([
				new LanguageModelTextPart(`Cannot view image file ${this.promptPathRepresentationService.getFilePath(uri)}: file size (${Math.round(stat.size / (1024 * 1024))}MB) exceeds the maximum allowed size of ${Math.round(MAX_IMAGE_FILE_SIZE / (1024 * 1024))}MB.`)
			]);
		}

		const imageData = await this.fileSystemService.readFile(uri, true);
		const resized = await this.imageService.resizeImage(imageData, imageMimeType);
		return new LanguageModelToolResult([
			LanguageModelDataPart.image(resized.data, resized.mimeType),
		]);
	}

	async prepareInvocation(options: vscode.LanguageModelToolInvocationPrepareOptions<IViewImageParams>, _token: vscode.CancellationToken): Promise<vscode.PreparedToolInvocation | undefined> {
		const uri = resolveToolInputPath(options.input.filePath, this.promptPathRepresentationService);
		this.assertImageFile(uri);

		const isExternal = await this.instantiationService.invokeFunction(
			accessor => isFileExternalAndNeedsConfirmation(accessor, uri, this._promptContext, { readOnly: true })
		);

		if (isExternal) {
			await this.instantiationService.invokeFunction(
				accessor => assertFileNotContentExcluded(accessor, uri)
			);

			const folderUri = dirname(uri);
			const message = this.workspaceService.getWorkspaceFolders().length === 1
				? new MarkdownString(l10n.t`${formatUriForFileWidget(uri)} is outside of the current folder in ${formatUriForFileWidget(folderUri)}.`)
				: new MarkdownString(l10n.t`${formatUriForFileWidget(uri)} is outside of the current workspace in ${formatUriForFileWidget(folderUri)}.`);

			return {
				invocationMessage: new MarkdownString(l10n.t`Viewing image ${formatUriForFileWidget(uri)}`),
				pastTenseMessage: new MarkdownString(l10n.t`Viewed image ${formatUriForFileWidget(uri)}`),
				confirmationMessages: {
					title: l10n.t`Allow viewing external images?`,
					message,
				}
			};
		}

		await this.instantiationService.invokeFunction(accessor => assertFileOkForTool(accessor, uri, this._promptContext, { readOnly: true }));

		return {
			invocationMessage: new MarkdownString(l10n.t`Viewing image ${formatUriForFileWidget(uri)}`),
			pastTenseMessage: new MarkdownString(l10n.t`Viewed image ${formatUriForFileWidget(uri)}`),
		};
	}

	async resolveInput(input: IViewImageParams, promptContext: IBuildPromptContext): Promise<IViewImageParams> {
		this._promptContext = promptContext;
		return input;
	}

	private assertImageFile(uri: URI): void {
		if (!getImageMimeType(uri)) {
			throw new Error(`Cannot view ${this.promptPathRepresentationService.getFilePath(uri)} with ${ToolName.ViewImage}. Use ${ToolName.ReadFile} for non-image files.`);
		}
	}
}

ToolRegistry.registerTool(ViewImageTool);
