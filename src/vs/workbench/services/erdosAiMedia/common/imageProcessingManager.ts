/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 by Lotas Inc.
 *  Licensed under the AGPL-3.0 License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

export const IImageProcessingManager = createDecorator<IImageProcessingManager>('imageProcessingManager');

export interface IImageProcessingManager {
	readonly _serviceBrand: undefined;

	resizeImageForAI(imagePath: string, targetSizeKb?: number): Promise<{
		success: boolean;
		base64_data: string;
		original_size_kb: number;
		final_size_kb: number;
		resized: boolean;
		scale_factor?: number;
		new_dimensions?: string;
		format: string;
		warning?: string;
	}>;

	validateImageFile(imagePath: string, maxSizeMb?: number): Promise<{
		valid: boolean;
		error?: string;
		fileSize?: number;
		format?: string;
	}>;

	isImageFile(filePath: string): boolean;
	getSupportedFormats(): string[];
}
