/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { zoomLevelToZoomFactor } from 'vs/platform/windows/common/windows';
import { setZoomFactor, setZoomLevel, getZoomLevel } from 'vs/base/browser/browser';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';

/**
 * Apply a zoom level to the window. Also sets it in our in-memory
 * browser helper so that it can be accessed in non-electron layers.
 */
export async function applyZoom(nativeHostService: INativeHostService, zoomLevel: number): Promise<void> {
	await nativeHostService.setZoomLevel(zoomLevel);
	setZoomFactor(zoomLevelToZoomFactor(zoomLevel));
	// Cannot be trusted because the IPC call might take some time
	// until it really applies the new zoom level
	// See https://github.com/microsoft/vscode/issues/26151
	setZoomLevel(zoomLevel, false /* isTrusted */); // TODO@alexdima check if this can be trusted now that we await IPC call
}

export function zoomIn(nativeHostService: INativeHostService): void {
	applyZoom(nativeHostService, getZoomLevel() + 1);
}

export function zoomOut(nativeHostService: INativeHostService): void {
	applyZoom(nativeHostService, getZoomLevel() - 1);
}
