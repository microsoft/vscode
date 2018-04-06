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
	getElements(windowId: number, selector: string): Promise<IElement[]>;
}

export interface IDisposable {
	dispose(): void;
}

export function connect(outPath: string, handle: string): Promise<{ client: IDisposable, driver: IDriver }>;
