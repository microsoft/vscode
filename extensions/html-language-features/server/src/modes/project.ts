/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguagePlugin, Project } from '@volar/language-server';
import { createLanguageServiceEnvironment, createUriConverter } from '@volar/language-server/node';
import { createLanguage, createLanguageService, createUriMap, LanguageService } from '@volar/language-service';
import { createLanguageServiceHost, resolveFileLanguageId } from '@volar/typescript';
import * as ts from 'typescript';
import { TextDocument } from 'vscode-html-languageservice';
import { URI } from 'vscode-uri';
import { createProjectHost } from './projectHost';

export function createHtmlProject(languagePlugins: LanguagePlugin<URI>[]): Project {
	let languageService: LanguageService | undefined;
	let currentDocument: [URI, string, TextDocument, ts.IScriptSnapshot] | undefined;

	const { asFileName, asUri } = createUriConverter();

	return {
		getLanguageService(server, uri) {
			const document = server.documents.get(server.getSyncedDocumentKey(uri) ?? uri.toString())!;
			currentDocument = [uri, asFileName(uri), document, document.getSnapshot()];
			if (!languageService) {
				const language = createLanguage(
					[
						{ getLanguageId: uri => server.documents.get(server.getSyncedDocumentKey(uri) ?? uri.toString())?.languageId },
						...languagePlugins,
						{ getLanguageId: uri => resolveFileLanguageId(uri.path) },
					],
					createUriMap(),
					uri => {
						const key = server.getSyncedDocumentKey(uri);
						const document = !!key && server.documents.get(key);
						if (document) {
							language.scripts.set(uri, document.getSnapshot());
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
					...createLanguageServiceHost(ts, ts.sys, language, asUri, createProjectHost(() => currentDocument!)),
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
