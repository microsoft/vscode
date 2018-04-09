/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IElement {
	tagName: string;
	className: string;
	textContent: string;
}

export interface IDriver {
	_serviceBrand: any;
	getWindowIds(): Promise<number[]>;
	dispatchKeybinding(windowId: number, keybinding: string): Promise<void>;
	click(windowId: number, selector: string, xoffset: number | undefined, yoffset: number | undefined): Promise<void>;
	doubleClick(windowId: number, selector: string): Promise<void>;
	move(windowId: number, selector: string): Promise<void>;
	setValue(windowId: number, selector: string, text: string): Promise<void>;
	getTitle(windowId: number): Promise<void>;
	isActiveElement(windowId: number, selector: string): Promise<void>;
	getElements(windowId: number, selector: string): Promise<IElement[]>;
	selectorExecute<P>(selector: string, script: (elements: HTMLElement[], ...args: any[]) => P, ...args: any[]): Promise<P>;
}

export interface IDisposable {
	dispose(): void;
}

export function connect(outPath: string, handle: string): Promise<{ client: IDisposable, driver: IDriver }>;
