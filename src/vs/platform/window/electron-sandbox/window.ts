/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getZoomLevel, setZoomFactor, setZoomLevel } from 'vs/base/browser/browser';
import { webFrame } from 'vs/base/parts/sandbox/electron-sandbox/globals';
import { zoomLevelToZoomFactor } from 'vs/platform/window/common/window';

/**
 * Apply a zoom level to the window. Also sets it in our in-memory
 * browser helper so that it can be accessed in non-electron layers.
 */
export function applyZoom(zoomLevel: number): void {
	webFrame.setZoomLevel(zoomLevel);
	setZoomFactor(zoomLevelToZoomFactor(zoomLevel));
	setZoomLevel(zoomLevel);
}

export function zoomIn(): void {
	applyZoom(getZoomLevel() + 1);
}

export function zoomOut(): void {
	applyZoom(getZoomLevel() - 1);
}
