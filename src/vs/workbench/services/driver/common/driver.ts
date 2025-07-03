/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// !! Do not remove the following START and END markers, they are parsed by the smoketest build

//*START
export interface IElement {
	readonly tagName: string;
	readonly className: string;
	readonly textContent: string;
	readonly attributes: { [name: string]: string };
	readonly children: IElement[];
	readonly top: number;
	readonly left: number;
}

export interface ILocaleInfo {
	readonly language: string;
	readonly locale?: string;
}

export interface ILocalizedStrings {
	readonly open: string;
	readonly close: string;
	readonly find: string;
}

export interface ILogFile {
	readonly relativePath: string;
	readonly contents: string;
}

export interface IWindowDriver {
	setValue(selector: string, text: string): Promise<void>;
	isActiveElement(selector: string): Promise<boolean>;
	getElements(selector: string, recursive: boolean): Promise<IElement[]>;
	getElementXY(selector: string, xoffset?: number, yoffset?: number): Promise<{ x: number; y: number }>;
	typeInEditor(selector: string, text: string): Promise<void>;
	getEditorSelection(selector: string): Promise<{ selectionStart: number; selectionEnd: number }>;
	getTerminalBuffer(selector: string): Promise<string[]>;
	writeInTerminal(selector: string, text: string): Promise<void>;
	getLocaleInfo(): Promise<ILocaleInfo>;
	getLocalizedStrings(): Promise<ILocalizedStrings>;
	getLogs(): Promise<ILogFile[]>;
	whenWorkbenchRestored(): Promise<void>;
}
//*END
