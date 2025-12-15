/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename } from 'path';
import * as vscode from 'vscode';
import * as languageIds from './languageIds';

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
	readonly languageIds: readonly string[];
	readonly configFilePattern?: RegExp;
	readonly isExternal?: boolean;
	readonly standardFileExtensions: readonly string[];
}

export const standardLanguageDescriptions: LanguageDescription[] = [
	{
		id: 'typescript',
		diagnosticOwner: 'typescript',
		diagnosticSource: 'ts',
		diagnosticLanguage: DiagnosticLanguage.TypeScript,
		languageIds: [languageIds.typescript, languageIds.typescriptreact],
		configFilePattern: /^tsconfig(\..*)?\.json$/i,
		standardFileExtensions: [
			'ts',
			'tsx',
			'cts',
			'mts'
		],
	}, {
		id: 'javascript',
		diagnosticOwner: 'typescript',
		diagnosticSource: 'ts',
		diagnosticLanguage: DiagnosticLanguage.JavaScript,
		languageIds: [languageIds.javascript, languageIds.javascriptreact],
		configFilePattern: /^jsconfig(\..*)?\.json$/i,
		standardFileExtensions: [
			'js',
			'jsx',
			'cjs',
			'mjs',
			'es6',
			'pac',
		],
	}
];

export function isTsConfigFileName(fileName: string): boolean {
	return /^tsconfig\.(.+\.)?json$/i.test(basename(fileName));
}

export function isJsConfigOrTsConfigFileName(fileName: string): boolean {
	return /^[jt]sconfig\.(.+\.)?json$/i.test(basename(fileName));
}

export function doesResourceLookLikeATypeScriptFile(resource: vscode.Uri): boolean {
	return /\.(tsx?|mts|cts)$/i.test(resource.fsPath);
}

export function doesResourceLookLikeAJavaScriptFile(resource: vscode.Uri): boolean {
	return /\.(jsx?|mjs|cjs)$/i.test(resource.fsPath);
}
