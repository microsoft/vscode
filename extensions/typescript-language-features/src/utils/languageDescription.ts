/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as languageModeIds from './languageModeIds';

export const enum DiagnosticLanguage {
	JavaScript,
	TypeScript
}

export const allDiagnosticLanguages = [DiagnosticLanguage.JavaScript, DiagnosticLanguage.TypeScript];

export interface LanguageDescription {
	readonly id: string;
	readonly diagnosticOwner: string;
	readonly diagnosticSource: string;
	readonly diagnosticLanguage: DiagnosticLanguage;
	readonly modeIds: string[];
	readonly configFilePattern?: RegExp;
	readonly isExternal?: boolean;
}

export const standardLanguageDescriptions: LanguageDescription[] = [
	{
		id: 'typescript',
		diagnosticOwner: 'typescript',
		diagnosticSource: 'ts',
		diagnosticLanguage: DiagnosticLanguage.TypeScript,
		modeIds: [languageModeIds.typescript, languageModeIds.typescriptreact],
		configFilePattern: /^tsconfig(\..*)?\.json$/gi
	}, {
		id: 'javascript',
		diagnosticOwner: 'typescript',
		diagnosticSource: 'ts',
		diagnosticLanguage: DiagnosticLanguage.JavaScript,
		modeIds: [languageModeIds.javascript, languageModeIds.javascriptreact],
		configFilePattern: /^jsconfig(\..*)?\.json$/gi
	}
];
