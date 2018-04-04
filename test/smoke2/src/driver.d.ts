/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IWindow {
	id: string;
}

export interface IDriver {
	_serviceBrand: any;
	getWindows(): Promise<IWindow[]>;
}

export interface IDisposable {
	dispose(): void;
}

export function connect(outPath: string, handle: string): Promise<{ client: IDisposable, driver: IDriver }>;
