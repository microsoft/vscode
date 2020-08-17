/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { zoomLevelToZoomFactor } from 'vs/platform/windows/common/windows';
import { setZoomFactor, setZoomLevel, getZoomLevel } from 'vs/base/browser/browser';
import { IElectronService } from 'vs/platform/electron/electron-sandbox/electron';

/**
 * Apply a zoom level to the window. Also sets it in our in-memory
 * browser helper so that it can be accessed in non-electron layers.
 */
export async function applyZoom(electronService: IElectronService, zoomLevel: number): Promise<void> {
	await electronService.setZoomLevel(zoomLevel);
	setZoomFactor(zoomLevelToZoomFactor(zoomLevel));
	// Cannot be trusted because the IPC call might take some time
	// until it really applies the new zoom level
	// See https://github.com/Microsoft/vscode/issues/26151
	setZoomLevel(zoomLevel, false /* isTrusted */); // TODO verify this can be removed, maybe all of trust remove?
}

export function zoomIn(electronService: IElectronService): void {
	applyZoom(electronService, getZoomLevel() + 1);
}

export function zoomOut(electronService: IElectronService): void {
	applyZoom(electronService, getZoomLevel() - 1);
}
