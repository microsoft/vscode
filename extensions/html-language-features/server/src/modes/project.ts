/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageServer, LanguageServerProject } from '@volar/language-server';
import { createUriConverter } from '@volar/language-server/browser';
import { LanguagePlugin, LanguageService } from '@volar/language-service';
import * as ts from 'typescript';
import { URI, Utils } from 'vscode-uri';
import { JQUERY_PATH } from './javascriptLibs';
import { createLanguageService } from './languageService';
import { HTMLVirtualCode } from './virtualCode';

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
	let projectVersion = '';
	let currentDirectory = '';
	let tsLocalized: any;
	let uriConverter: ReturnType<typeof createUriConverter>;

	const currentRootFiles: string[] = [];

	return {
		setup(_server) {
			server = _server;
			uriConverter = createUriConverter([...server.workspaceFolders.keys()]);
			if (server.initializeParams.locale) {
				try {
					tsLocalized = require(`typescript/lib/${server.initializeParams.locale}/diagnosticMessages.generated.json`);
				} catch { }
			}
		},
		async getLanguageService(uri) {
			if (!languageService) {
				languageService = createLanguageService(
					server,
					languagePlugins,
					{
						getCurrentDirectory() {
							return currentDirectory;
						},
						getProjectVersion() {
							return projectVersion;
						},
						getScriptFileNames() {
							return currentRootFiles;
						},
						getScriptSnapshot(fileName) {
							const uri = uriConverter.asUri(fileName);
							const documentKey = server.getSyncedDocumentKey(uri) ?? uri.toString();
							const document = server.documents.get(documentKey);
							if (document) {
								return document.getSnapshot();
							}
							return undefined;
						},
						getCompilationSettings() {
							return compilerOptions;
						},
						getLocalizedDiagnosticMessages: tsLocalized ? () => tsLocalized : undefined,
					},
					uriConverter
				);
			}
			updateRootFiles(uri, languageService);
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

	function updateRootFiles(uri: URI, languageService: LanguageService) {
		const document = server.documents.get(server.getSyncedDocumentKey(uri) ?? uri.toString());
		if (!document) {
			return;
		}
		const newProjectVersion = document.uri.toString() + '::' + document.version;
		if (newProjectVersion === projectVersion) {
			return;
		}
		projectVersion = newProjectVersion;
		currentDirectory = getRootFolder(uri) ?? '';

		currentRootFiles.length = 0;
		currentRootFiles.push(JQUERY_PATH);
		currentRootFiles.push(uriConverter.asFileName(uri));

		const sourceScript = languageService.context.language.scripts.get(uri);
		if (sourceScript?.generated?.root instanceof HTMLVirtualCode) {
			const regions = sourceScript.generated.root.documentRegions;
			for (const script of regions.getImportedScripts()) {
				if (script.startsWith('http://') || script.startsWith('https://') || script.startsWith('//')) {
					continue;
				}
				else if (script.startsWith('file://')) {
					const scriptUri = URI.parse(script);
					currentRootFiles.push(uriConverter.asFileName(scriptUri));
				}
				else {
					const scriptUri = Utils.resolvePath(Utils.dirname(uri), script);
					currentRootFiles.push(uriConverter.asFileName(scriptUri));
				}
			}
		}
	}

	function getRootFolder(uri: URI) {
		for (const folder of server.workspaceFolders) {
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
