/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Event, { Emitter } from 'vs/base/common/event';

export interface IEditorZoom {
	onDidChangeZoomLevel: Event<number>;
	getZoomLevel(): number;
	setZoomLevel(zoomLevel: number): void;
}

export const EditorZoom: IEditorZoom = new class {

	private _zoomLevel: number = 0;

	private _onDidChangeZoomLevel: Emitter<number> = new Emitter<number>();
	public onDidChangeZoomLevel: Event<number> = this._onDidChangeZoomLevel.event;

	public getZoomLevel(): number {
		return this._zoomLevel;
	}

	public setZoomLevel(zoomLevel: number): void {
		zoomLevel = Math.min(Math.max(-9, zoomLevel), 9);
		if (this._zoomLevel === zoomLevel) {
			return;
		}

		this._zoomLevel = zoomLevel;
		this._onDidChangeZoomLevel.fire(this._zoomLevel);
	}
};
