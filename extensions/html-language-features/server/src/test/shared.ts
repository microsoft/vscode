/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientCapabilities, LanguageServiceEnvironment, TextDocument } from '@volar/language-server';
import { default as httpSchemaRequestHandler } from '@volar/language-server/lib/schemaRequestHandlers/http';
import { createUriConverter } from '@volar/language-server/node';
import { createLanguage, createLanguageService, createUriMap, FileType, LanguageService } from '@volar/language-service';
import { createLanguageServiceHost, resolveFileLanguageId } from '@volar/typescript';
import * as fs from 'fs';
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
	// TODO: import from @volar/language-server
	fs: {
		stat(uri) {
			if (uri.scheme === 'file') {
				try {
					const stats = fs.statSync(uri.fsPath, { throwIfNoEntry: false });
					if (stats) {
						return {
							type: stats.isFile() ? FileType.File
								: stats.isDirectory() ? FileType.Directory
									: stats.isSymbolicLink() ? FileType.SymbolicLink
										: FileType.Unknown,
							ctime: stats.ctimeMs,
							mtime: stats.mtimeMs,
							size: stats.size,
						};
					}
				}
				catch {
					return undefined;
				}
			}
			return undefined;
		},
		readFile(uri, encoding) {
			if (uri.scheme === 'file') {
				try {
					return fs.readFileSync(uri.fsPath, { encoding: encoding as 'utf-8' ?? 'utf-8' });
				}
				catch {
					return undefined;
				}
			}
			if (uri.scheme === 'http' || uri.scheme === 'https') {
				return httpSchemaRequestHandler(uri);
			}
			return undefined;
		},
		readDirectory(uri) {
			if (uri.scheme === 'file') {
				try {
					const files = fs.readdirSync(uri.fsPath, { withFileTypes: true });
					return files.map<[string, FileType]>(file => {
						return [file.name, file.isFile() ? FileType.File
							: file.isDirectory() ? FileType.Directory
								: file.isSymbolicLink() ? FileType.SymbolicLink
									: FileType.Unknown];
					});
				}
				catch {
					return [];
				}
			}
			return [];
		},
	},
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
