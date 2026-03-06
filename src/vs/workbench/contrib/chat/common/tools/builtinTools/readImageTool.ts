/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extname } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { localize } from '../../../../../../nls.js';
import { ChatImageMimeType } from '../../languageModels.js';
import { IToolData, ToolDataSource } from '../languageModelToolsService.js';

export const InternalReadImageToolId = 'vscode_readImage_internal';

export const ReadImageToolData: IToolData = {
	id: InternalReadImageToolId,
	displayName: localize('readImage.displayName', 'Read Image'),
	canBeReferencedInPrompt: false,
	modelDescription: 'Reads an image file from disk and returns its contents. Use this tool when you need to see or analyze an image file. Supports PNG, JPEG, GIF, WEBP, and BMP formats.',
	source: ToolDataSource.Internal,
	inputSchema: {
		type: 'object',
		properties: {
			filePaths: {
				type: 'array',
				items: {
					type: 'string',
				},
				description: localize('readImage.filePathsDescription', 'An array of file URIs for the images to read.')
			}
		},
		required: ['filePaths']
	}
};

export interface IReadImageToolParams {
	filePaths?: string[];
}

export function getSupportedImageMimeType(uri: URI): ChatImageMimeType | undefined {
	const ext = extname(uri.path).toLowerCase();
	switch (ext) {
		case '.png':
			return ChatImageMimeType.PNG;
		case '.jpg':
		case '.jpeg':
			return ChatImageMimeType.JPEG;
		case '.gif':
			return ChatImageMimeType.GIF;
		case '.webp':
			return ChatImageMimeType.WEBP;
		case '.bmp':
			return ChatImageMimeType.BMP;
		default:
			return undefined;
	}
}
