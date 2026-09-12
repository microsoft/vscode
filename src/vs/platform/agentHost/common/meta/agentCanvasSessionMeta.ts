/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const canvasSessionRetainedKey = 'vscode.canvasSessionRetained';

/** Whether an extension runtime has retained this session for explicitly approved executable work. */
export function isCanvasSessionRetained(source: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return source?._meta?.[canvasSessionRetainedKey] === true;
}

export function withCanvasSessionRetained(meta: Record<string, unknown> | undefined): Record<string, unknown> {
	return { ...meta, [canvasSessionRetainedKey]: true };
}
