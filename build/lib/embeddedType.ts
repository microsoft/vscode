/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type EmbeddedProductInfo = {
	nameShort: string;
	nameLong: string;
	applicationName: string;
	dataFolderName: string;
	darwinBundleIdentifier: string;
	urlProtocol: string;
	win32AppUserModelId: string;
	win32MutexName: string;
	win32RegValueName: string;
	win32NameVersion: string;
	win32VersionedUpdate: boolean;
};
