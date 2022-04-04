/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

// !! Do not remove the following START and END markers, they are parsed by the smoketest build

//*START
export interface IElement {
	tagName: string;
	className: string;
	textContent: string;
	attributes: { [name: string]: string };
	children: IElement[];
	top: number;
	left: number;
}

export interface ILocaleInfo {
	/**
	 * The UI language used.
	 */
	language: string;

	/**
	 * The requested locale
	 */
	locale?: string;
}

export interface ILocalizedStrings {
	open: string;
	close: string;
	find: string;
}

export interface IDriver {
	readonly _serviceBrand: undefined;

	getWindowIds(): Promise<number[]>;
	capturePage(windowId: number): Promise<string>;
	startTracing(windowId: number, name: string): Promise<void>;
	stopTracing(windowId: number, name: string, persist: boolean): Promise<void>;
	reloadWindow(windowId: number): Promise<void>;
	exitApplication(): Promise<number /* main PID */>;
	dispatchKeybinding(windowId: number, keybinding: string): Promise<void>;
	click(windowId: number, selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void>;
	setValue(windowId: number, selector: string, text: string): Promise<void>;
	getTitle(windowId: number): Promise<string>;
	isActiveElement(windowId: number, selector: string): Promise<boolean>;
	getElements(windowId: number, selector: string, recursive?: boolean): Promise<IElement[]>;
	getElementXY(windowId: number, selector: string, xoffset?: number, yoffset?: number): Promise<{ x: number; y: number }>;
	typeInEditor(windowId: number, selector: string, text: string): Promise<void>;
	getTerminalBuffer(windowId: number, selector: string): Promise<string[]>;
	writeInTerminal(windowId: number, selector: string, text: string): Promise<void>;
	getLocaleInfo(windowId: number): Promise<ILocaleInfo>;
	getLocalizedStrings(windowId: number): Promise<ILocalizedStrings>;
}

export interface IWindowDriver {
	click(selector: string, xoffset?: number | undefined, yoffset?: number | undefined): Promise<void>;
	setValue(selector: string, text: string): Promise<void>;
	getTitle(): Promise<string>;
	isActiveElement(selector: string): Promise<boolean>;
	getElements(selector: string, recursive: boolean): Promise<IElement[]>;
	getElementXY(selector: string, xoffset?: number, yoffset?: number): Promise<{ x: number; y: number }>;
	typeInEditor(selector: string, text: string): Promise<void>;
	getTerminalBuffer(selector: string): Promise<string[]>;
	writeInTerminal(selector: string, text: string): Promise<void>;
	getLocaleInfo(): Promise<ILocaleInfo>;
	getLocalizedStrings(): Promise<ILocalizedStrings>;
}
//*END

export const ID = 'driverService';
export const IDriver = createDecorator<IDriver>(ID);

export interface IWindowDriverRegistry {
	registerWindowDriver(windowId: number): Promise<void>;
	reloadWindowDriver(windowId: number): Promise<void>;
}
