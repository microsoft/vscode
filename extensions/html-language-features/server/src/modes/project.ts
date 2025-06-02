/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { LanguageServer, LanguageServerProject } from '@volar/language-server';
import { createUriConverter } from '@volar/language-server/browser';
import type { LanguagePlugin, LanguageService, TextDocument } from '@volar/language-service';
import type * as ts from 'typescript';
import type { URI } from 'vscode-uri';
import { JQUERY_PATH } from './javascriptLibs';
import { createLanguageService } from './languageService';

export const compilerOptions: ts.CompilerOptions = {
	allowNonTsExtensions: true,
	allowJs: true,
	lib: ['lib.es2020.full.d.ts'],
	target: 99 satisfies ts.ScriptTarget.Latest,
	moduleResolution: 1 satisfies ts.ModuleResolutionKind.Classic,
	experimentalDecorators: false,
};

export function createHtmlProject(languagePlugins: LanguagePlugin<URI>[]): LanguageServerProject {
	let server: LanguageServer;
	let languageService: LanguageService | undefined;
	let tsLocalized: any;
	let uriConverter: ReturnType<typeof createUriConverter>;
	let currentUri: URI;
	let currentDocument: TextDocument | undefined;
	let currentDirectory = '';

	return {
		setup(_server) {
			server = _server;
			uriConverter = createUriConverter(server.workspaceFolders.all);
			if (server.initializeParams.locale) {
				try {
					tsLocalized = require(`typescript/lib/${server.initializeParams.locale}/diagnosticMessages.generated.json`);
				} catch { }
			}
		},
		async getLanguageService(uri) {
			currentUri = uri;
			currentDocument = server.documents.get(uri);
			currentDirectory = getRootFolder(uri) ?? '';

			if (!languageService) {
				languageService = createLanguageService(
					server,
					languagePlugins,
					{
						getCurrentDirectory() {
							return currentDirectory;
						},
						getProjectVersion() {
							return currentUri.toString() + '::' + currentDocument?.version;
						},
						getScriptFileNames() {
							return [
								JQUERY_PATH,
								uriConverter.asFileName(currentUri),
							];
						},
						getCompilationSettings() {
							return compilerOptions;
						},
						getLocalizedDiagnosticMessages: tsLocalized ? () => tsLocalized : undefined,
					},
					uriConverter
				);
			}
			return languageService;
		},
		async getExistingLanguageServices() {
			return languageService ? [languageService] : [];
		},
		reload() {
			languageService?.dispose();
			languageService = undefined;
		},
	};

	function getRootFolder(uri: URI) {
		for (const folder of server.workspaceFolders.all) {
			let folderURI = folder.toString();
			if (!folderURI.endsWith('/')) {
				folderURI = folderURI + '/';
			}
			if (uri.toString().startsWith(folderURI)) {
				return folderURI;
			}
		}
		return undefined;
	}
}
