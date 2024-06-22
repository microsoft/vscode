/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguagePlugin, LanguageServer, LanguageServerProject } from '@volar/language-server';
import { createLanguageServiceEnvironment, createUriConverter } from '@volar/language-server/node';
import { createLanguage, createLanguageService, createUriMap, LanguageService } from '@volar/language-service';
import { createLanguageServiceHost, resolveFileLanguageId } from '@volar/typescript';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-html-languageservice';
import { URI } from 'vscode-uri';
import { createProjectHost } from './projectHost';

export function createHtmlProject(languagePlugins: LanguagePlugin<URI>[]): LanguageServerProject {
	let server: LanguageServer;
	let languageService: LanguageService | undefined;
	let currentDocument: [URI, string, TextDocument, ts.IScriptSnapshot] | undefined;

	const { asFileName, asUri } = createUriConverter();

	return {
		setup(_server) {
			server = _server;
		},
		getLanguageService(uri) {
			const document = server.documents.get(server.getSyncedDocumentKey(uri) ?? uri.toString())!;
			currentDocument = [uri, asFileName(uri), document, document.getSnapshot()];
			if (!languageService) {
				const projectHost = createProjectHost(() => currentDocument!);
				const language = createLanguage(
					[
						{ getLanguageId: uri => server.documents.get(server.getSyncedDocumentKey(uri) ?? uri.toString())?.languageId },
						...languagePlugins,
						{ getLanguageId: uri => resolveFileLanguageId(uri.path) },
					],
					createUriMap(),
					uri => {
						const documentUri = server.getSyncedDocumentKey(uri);
						const syncedDocument = documentUri ? server.documents.get(documentUri) : undefined;

						let snapshot: ts.IScriptSnapshot | undefined;

						if (syncedDocument) {
							snapshot = syncedDocument.getSnapshot();
						}
						else {
							snapshot = projectHost.getScriptSnapshot(asFileName(uri));
						}

						if (snapshot) {
							language.scripts.set(uri, snapshot);
						}
						else {
							language.scripts.delete(uri);
						}
					}
				);
				language.typescript = {
					configFileName: undefined,
					sys: ts.sys,
					asFileName: asFileName,
					asScriptId: asUri,
					...createLanguageServiceHost(ts, ts.sys, language, asUri, projectHost),
				};
				languageService = createLanguageService(
					language,
					server.languageServicePlugins,
					createLanguageServiceEnvironment(server, [...server.workspaceFolders.keys()])
				);
			}
			return languageService;
		},
		getExistingLanguageServices() {
			if (languageService) {
				return [languageService];
			}
			return [];
		},
		reload() {
			languageService?.dispose();
			languageService = undefined;
		},
	};
}
