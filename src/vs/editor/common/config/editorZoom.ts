/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../base/common/event.js';

export interface IEditorZoom {
	readonly onDidChangeZoomLevel: Event<number>;
	getZoomLevel(): number;
	setZoomLevel(zoomLevel: number): void;
}

export const EditorZoom: IEditorZoom = new class implements IEditorZoom {

	private _zoomLevel: number = 0;

	private readonly _onDidChangeZoomLevel = new Emitter<number>();
	public readonly onDidChangeZoomLevel: Event<number> = this._onDidChangeZoomLevel.event;

	public getZoomLevel(): number {
		return this._zoomLevel;
	}

	public setZoomLevel(zoomLevel: number): void {
		zoomLevel = Math.min(Math.max(-5, zoomLevel), 20);
		if (this._zoomLevel === zoomLevel) {
			return;
		}

		this._zoomLevel = zoomLevel;
		this._onDidChangeZoomLevel.fire(this._zoomLevel);
	}
};
