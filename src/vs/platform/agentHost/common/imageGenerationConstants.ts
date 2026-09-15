/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const GenerateImageToolId = 'vscode_generateImage';
export const GenerateImageToolReferenceName = 'generateImage';
export const CodexImageGenerationToolName = 'image_gen.imagegen';

export function isClientImageGenerationTool(name: string): boolean {
	return name === GenerateImageToolId || name === GenerateImageToolReferenceName;
}

export function isImageGenerationTool(name: string): boolean {
	return isClientImageGenerationTool(name) || name === CodexImageGenerationToolName;
}
