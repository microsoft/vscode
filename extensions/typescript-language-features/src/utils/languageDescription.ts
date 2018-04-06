/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as languageModeIds from './languageModeIds';

export interface LanguageDescription {
	id: string;
	diagnosticSource: string;
	modeIds: string[];
	configFile?: string;
	isExternal?: boolean;
}

export const standardLanguageDescriptions: LanguageDescription[] = [
	{
		id: 'typescript',
		diagnosticSource: 'ts',
		modeIds: [languageModeIds.typescript, languageModeIds.typescriptreact],
		configFile: 'tsconfig.json'
	}, {
		id: 'javascript',
		diagnosticSource: 'js',
		modeIds: [languageModeIds.javascript, languageModeIds.javascriptreact],
		configFile: 'jsconfig.json'
	}
];
