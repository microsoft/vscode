/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientCapabilities, LanguageServiceEnvironment, ProjectContext, TextDocument } from '@volar/language-server';
import { createUriConverter, fs } from '@volar/language-server/node';
import { createLanguage, createLanguageService, createUriMap, LanguageService } from '@volar/language-service';
import { createLanguageServiceHost, resolveFileLanguageId, TypeScriptProjectHost } from '@volar/typescript';
import * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { JQUERY_PATH } from '../modes/javascriptLibs';
import { htmlLanguagePlugin } from '../modes/languagePlugin';
import { compilerOptions } from '../modes/project';
import { getLanguageServicePlugins } from '../modes/languageServicePlugins';

let currentDocument: [URI, string, TextDocument, ts.IScriptSnapshot];
let languageService: LanguageService;
let uriConverter: ReturnType<typeof createUriConverter>;

const serviceEnv: LanguageServiceEnvironment = { workspaceFolders: [], fs };
const libSnapshots = new Map<string, ts.IScriptSnapshot | undefined>();
const projectHost: TypeScriptProjectHost = {
	getCompilationSettings: () => compilerOptions,
	getScriptFileNames: () => [currentDocument[1], JQUERY_PATH],
	getCurrentDirectory: () => '',
	getProjectVersion: () => currentDocument[1] + ',' + currentDocument[2].version,
	getScriptSnapshot: fileName => {
		if (fileName === currentDocument[1]) {
			return currentDocument[3];
		}
		else {
			let snapshot = libSnapshots.get(fileName);
			if (!snapshot) {
				const text = ts.sys.readFile(fileName);
				if (text !== undefined) {
					snapshot = {
						getText: (start, end) => text.substring(start, end),
						getLength: () => text.length,
						getChangeRange: () => undefined,
					};
				}
				libSnapshots.set(fileName, snapshot);
			}
			return snapshot;
		}
	},
};

export const languageServicePlugins = getLanguageServicePlugins({
	supportedLanguages: { css: true, javascript: true },
	getCustomData: () => [],
	onDidChangeCustomData: () => ({ dispose() { } }),
});

export async function getTestService({
	uri = 'test://test/test.html',
	languageId = 'html',
	content,
	workspaceFolders = [uri.substr(0, uri.lastIndexOf('/'))],
	clientCapabilities,
}: {
	uri?: string;
	languageId?: string;
	content: string;
	workspaceFolders?: string[];
	clientCapabilities?: ClientCapabilities;
}) {
	serviceEnv.workspaceFolders = workspaceFolders.map(folder => URI.parse(folder));
	serviceEnv.clientCapabilities = clientCapabilities;
	uriConverter = createUriConverter(serviceEnv.workspaceFolders);
	const parsedUri = URI.parse(uri);
	currentDocument = [
		parsedUri,
		uriConverter.asFileName(parsedUri),
		TextDocument.create(uri, languageId, (currentDocument?.[2].version ?? 0) + 1, content),
		ts.ScriptSnapshot.fromString(content),
	];
	if (!languageService) {
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
				const snapshot = projectHost.getScriptSnapshot(uriConverter.asFileName(uri));
				if (snapshot) {
					language.scripts.set(uri, snapshot);
				}
				else {
					language.scripts.delete(uri);
				}
			},
		);
		const project: ProjectContext = {
			typescript: {
				configFileName: undefined,
				sys: ts.sys,
				uriConverter,
				...createLanguageServiceHost(
					ts,
					ts.sys,
					language,
					fileName => uriConverter.asUri(fileName),
					projectHost
				),
			},
		};
		languageService = createLanguageService(language, languageServicePlugins, serviceEnv, project);
	}
	return {
		document: currentDocument[2],
		languageService,
	};
}
