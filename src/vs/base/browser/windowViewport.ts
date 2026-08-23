/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IWindowViewportTarget extends EventTarget {
	readonly innerWidth: number;
	readonly innerHeight: number;
	readonly visualViewport: IVisualViewportTarget | null;
}

export interface IVisualViewportTarget extends EventTarget {
	readonly width: number;
	readonly height: number;
	readonly offsetLeft: number;
	readonly offsetTop: number;
	readonly scale: number;
}

export interface IWindowViewportState {
	readonly hasVisualViewport: boolean;
	readonly layoutWidth: number;
	readonly layoutHeight: number;
	readonly visualWidth: number;
	readonly visualHeight: number;
	readonly visualOffsetLeft: number;
	readonly visualOffsetTop: number;
	readonly visualScale: number;
}

export function getWindowViewportState(targetWindow: IWindowViewportTarget): IWindowViewportState {
	const visualViewport = targetWindow.visualViewport;
	return {
		hasVisualViewport: !!visualViewport,
		layoutWidth: targetWindow.innerWidth,
		layoutHeight: targetWindow.innerHeight,
		visualWidth: visualViewport?.width ?? targetWindow.innerWidth,
		visualHeight: visualViewport?.height ?? targetWindow.innerHeight,
		visualOffsetLeft: visualViewport?.offsetLeft ?? 0,
		visualOffsetTop: visualViewport?.offsetTop ?? 0,
		visualScale: visualViewport?.scale ?? 1,
	};
}
