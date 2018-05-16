/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as languageModeIds from './languageModeIds';

export interface LanguageDescription {
	readonly id: string;
	readonly diagnosticSource: string;
	readonly modeIds: string[];
	readonly configFile?: string;
	readonly isExternal?: boolean;
	readonly diagnosticOwner: string;
}

export const standardLanguageDescriptions: LanguageDescription[] = [
	{
		id: 'typescript',
		diagnosticSource: 'ts',
		diagnosticOwner: 'typescript',
		modeIds: [languageModeIds.typescript, languageModeIds.typescriptreact],
		configFile: 'tsconfig.json'
	}, {
		id: 'javascript',
		diagnosticSource: 'ts',
		diagnosticOwner: 'typescript',
		modeIds: [languageModeIds.javascript, languageModeIds.javascriptreact],
		configFile: 'jsconfig.json'
	}
];
