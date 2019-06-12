/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Thenable is a common denominator between ES6 promises, Q, jquery.Deferred, WinJS.Promise,
 * and others. This API makes no assumption about what promise library is being used which
 * enables reusing existing code without migrating to a specific promise implementation. Still,
 * we recommend the use of native promises which are available in this editor.
 */
interface Thenable<T> {
	/**
	* Attaches callbacks for the resolution and/or rejection of the Promise.
	* @param onfulfilled The callback to execute when the Promise is resolved.
	* @param onrejected The callback to execute when the Promise is rejected.
	* @returns A Promise for the completion of which ever callback is executed.
	*/
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => TResult | Thenable<TResult>): Thenable<TResult>;
	then<TResult>(onfulfilled?: (value: T) => TResult | Thenable<TResult>, onrejected?: (reason: any) => void): Thenable<TResult>;
}

export interface IElement {
	tagName: string;
	className: string;
	textContent: string;
	attributes: { [name: string]: string; };
	children: IElement[];
	top: number;
	left: number;
}

export interface IDriver {
	_serviceBrand: any;

	getWindowIds(): Promise<number[]>;
	capturePage(windowId: number): Promise<string>;
	reloadWindow(windowId: number): Promise<void>;
	exitApplication(): Promise<void>;
	dispatchKeybinding(windowId: number, keybinding: string): Promise<void>;
	click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void>;
	doubleClick(windowId: number, selector: string): Promise<void>;
	setValue(windowId: number, selector: string, text: string): Promise<void>;
	getTitle(windowId: number): Promise<string>;
	isActiveElement(windowId: number, selector: string): Promise<boolean>;
	getElements(windowId: number, selector: string, recursive?: boolean): Promise<IElement[]>;
	typeInEditor(windowId: number, selector: string, text: string): Promise<void>;
	getTerminalBuffer(windowId: number, selector: string): Promise<string[]>;
	writeInTerminal(windowId: number, selector: string, text: string): Promise<void>;
}

export interface IDisposable {
	dispose(): void;
}

export function connect(outPath: string, handle: string): Promise<{ client: IDisposable, driver: IDriver }>;
