/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

export interface IPath {
	filePath: string;
	lineNumber?: number;
	columnNumber?: number;
}

export interface IOpenFileRequest {
	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	filesToDiff?: IPath[];
}

export interface IWindowConfiguration {
	window: {
		openFilesInNewWindow: boolean;
		reopenFolders: string;
		restoreFullscreen: boolean;
		zoomLevel: number;
	};
}