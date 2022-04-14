/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
	language: string;
	locale?: string;
}

export interface ILocalizedStrings {
	open: string;
	close: string;
	find: string;
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
	exitApplication(): Promise<void>;
}
//*END
