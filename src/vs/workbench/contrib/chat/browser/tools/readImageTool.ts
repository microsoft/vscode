/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { MarkdownString } from '../../../../../base/common/htmlContent.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { CountTokensCallback, ILanguageModelToolsService, IPreparedToolInvocation, IToolImpl, IToolInvocation, IToolInvocationPreparationContext, IToolResult, IToolResultDataPart, IToolResultTextPart, ToolProgress } from '../../common/tools/languageModelToolsService.js';
import { getSupportedImageMimeType, IReadImageToolParams, ReadImageToolData } from '../../common/tools/builtinTools/readImageTool.js';
import { resizeImage } from '../chatImageUtils.js';

class ReadImageTool implements IToolImpl {

	constructor(
		@IFileService private readonly _fileService: IFileService,
	) { }

	async invoke(invocation: IToolInvocation, _countTokens: CountTokensCallback, _progress: ToolProgress, token: CancellationToken): Promise<IToolResult> {
		const filePaths = (invocation.parameters as IReadImageToolParams).filePaths || [];

		if (filePaths.length === 0) {
			return {
				content: [{ kind: 'text', value: localize('readImage.noFilePaths', 'No file paths provided.') }]
			};
		}

		const content: (IToolResultTextPart | IToolResultDataPart)[] = [];
		const validUris: URI[] = [];

		for (const filePath of filePaths) {
			let uri: URI;
			try {
				uri = URI.parse(filePath);
			} catch {
				content.push({ kind: 'text', value: localize('readImage.invalidUri', 'Invalid file path: {0}', filePath) });
				continue;
			}

			const imageMimeType = getSupportedImageMimeType(uri);
			if (!imageMimeType) {
				content.push({ kind: 'text', value: localize('readImage.unsupportedFormat', 'Unsupported image format: {0}. Supported formats are PNG, JPEG, GIF, WEBP, and BMP.', filePath) });
				continue;
			}

			try {
				const fileContent = await this._fileService.readFile(uri, undefined, token);
				const resizedData = await resizeImage(fileContent.value.buffer, imageMimeType);
				content.push({
					kind: 'data',
					value: {
						mimeType: imageMimeType,
						data: VSBuffer.wrap(resizedData)
					}
				});
				validUris.push(uri);
			} catch {
				content.push({ kind: 'text', value: localize('readImage.readError', 'Failed to read image file: {0}', filePath) });
			}
		}

		return {
			content,
			toolResultDetails: validUris.length > 0 ? validUris : undefined,
		};
	}

	async prepareToolInvocation(context: IToolInvocationPreparationContext, _token: CancellationToken): Promise<IPreparedToolInvocation | undefined> {
		const filePaths = (context.parameters as IReadImageToolParams).filePaths || [];

		const invocationMessage = new MarkdownString();
		const pastTenseMessage = new MarkdownString();

		if (filePaths.length > 1) {
			invocationMessage.appendMarkdown(localize('readImage.invocationMessage.plural', 'Reading {0} images', filePaths.length));
			pastTenseMessage.appendMarkdown(localize('readImage.pastTenseMessage.plural', 'Read {0} images', filePaths.length));
		} else if (filePaths.length === 1) {
			invocationMessage.appendMarkdown(localize('readImage.invocationMessage.singular', 'Reading image'));
			pastTenseMessage.appendMarkdown(localize('readImage.pastTenseMessage.singular', 'Read image'));
		}

		return { invocationMessage, pastTenseMessage };
	}
}

export class ReadImageToolContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'chat.readImageTool';

	constructor(
		@ILanguageModelToolsService toolsService: ILanguageModelToolsService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const readImageTool = instantiationService.createInstance(ReadImageTool);
		this._register(toolsService.registerTool(ReadImageToolData, readImageTool));
	}
}
