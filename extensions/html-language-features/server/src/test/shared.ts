/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientCapabilities, LanguageServiceEnvironment, TextDocument } from '@volar/language-server';
import { createUriConverter, fs } from '@volar/language-server/node';
import { createLanguage, createLanguageService, createUriMap, LanguageService } from '@volar/language-service';
import { createLanguageServiceHost, resolveFileLanguageId } from '@volar/typescript';
import * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { htmlLanguagePlugin } from '../modes/languagePlugin';
import { createProjectHost } from '../modes/projectHost';
import { getLanguageServicePlugins } from '../modes/servicePlugins';

let currentDocument: [URI, string, TextDocument, ts.IScriptSnapshot];
let languageService: LanguageService;

const { asFileName, asUri } = createUriConverter();
const serviceEnv: LanguageServiceEnvironment = {
	workspaceFolders: [],
	fs,
};

export const languageServicePlugins = getLanguageServicePlugins();

export async function getTestService({
	uri = 'test://test/test.html',
	languageId = 'html',
	content,
	workspaceFolder = uri.substr(0, uri.lastIndexOf('/')),
	clientCapabilities,
}: {
	uri?: string;
	languageId?: string;
	content: string;
	workspaceFolder?: string;
	clientCapabilities?: ClientCapabilities;
}) {
	const parsedUri = URI.parse(uri);
	currentDocument = [
		parsedUri,
		asFileName(parsedUri),
		TextDocument.create(uri, languageId, (currentDocument?.[2].version ?? 0) + 1, content),
		ts.ScriptSnapshot.fromString(content),
	];
	serviceEnv.workspaceFolders = [URI.parse(workspaceFolder)];
	serviceEnv.clientCapabilities = clientCapabilities;
	if (!languageService) {
		const projectHost = createProjectHost(() => currentDocument);
		const language = createLanguage(
			[
				htmlLanguagePlugin,
				{
					getLanguageId(uri) {
						if (uri.toString() === currentDocument[0].toString()) {
							return currentDocument[2].languageId;
						}
						const tsLanguageId = resolveFileLanguageId(uri.toString());
						if (tsLanguageId) {
							return tsLanguageId;
						}
						return undefined;
					},
				}
			],
			createUriMap(),
			uri => {
				const snapshot = projectHost.getScriptSnapshot(asFileName(uri));
				if (snapshot) {
					language.scripts.set(uri, snapshot);
				}
				else {
					language.scripts.delete(uri);
				}
			},
		);
		language.typescript = {
			configFileName: undefined,
			sys: ts.sys,
			asFileName: asFileName,
			asScriptId: asUri,
			...createLanguageServiceHost(ts, ts.sys, language, asUri, createProjectHost(() => currentDocument!)),
		};
		languageService = createLanguageService(language, languageServicePlugins, serviceEnv);
	}
	return {
		document: currentDocument[2],
		languageService,
	};
}
