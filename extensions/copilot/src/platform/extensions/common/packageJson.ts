/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IPackageJson {
	name: string;
	version: string;

	// Partial typings for VS Code contributions
	contributes?: {
		debuggers?: IDebugConfigSchema[];
	};

	// Copilot contribution section https://github.com/microsoft/vscode-copilot-chat/wiki/Package.json-Copilot-Contributions
	copilot?: {
		tests?: {
			setupTests?: string;
			getSetupConfirmation?: string;
		};
	};
}


export interface IDebugConfigSchema {
	type: string;
	deprecated: boolean;
	configurationAttributes: {
		tags: string[];
		attach: { properties: { [key: string]: { description?: string; markdownDescription?: string } } };
		launch: { properties: { [key: string]: { description?: string; markdownDescription?: string } } };
	};
}
