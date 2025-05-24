/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageServer, ProjectContext } from '@volar/language-server';
import { SnapshotDocument } from '@volar/language-server/lib/utils/snapshotDocument';
import { createLanguageServiceEnvironment } from '@volar/language-server/browser';
import { LanguagePlugin, LanguageService, createLanguageService as _createLanguageService, createLanguage, createUriMap } from '@volar/language-service';
import { TypeScriptProjectHost, createLanguageServiceHost, createSys, resolveFileLanguageId } from '@volar/typescript';
import * as ts from 'typescript';
import { URI } from 'vscode-uri';

export function createLanguageService(
	server: LanguageServer,
	languagePlugins: LanguagePlugin<URI>[],
	projectHost: TypeScriptProjectHost,
	uriConverter: {
		asUri(fileName: string): URI;
		asFileName(uri: URI): string;
	},
): LanguageService {
	const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();
	const serviceEnv = createLanguageServiceEnvironment(server, server.workspaceFolders.all);
	const sys = createSys(ts.sys, serviceEnv, projectHost.getCurrentDirectory, uriConverter);
	const docOpenWatcher = server.documents.onDidOpen(({ document }) => updateFsCacheFromSyncedDocument(document));
	const docSaveWatcher = server.documents.onDidSave(({ document }) => updateFsCacheFromSyncedDocument(document));
	const language = createLanguage<URI>(
		[
			{ getLanguageId: uri => server.documents.get(uri)?.languageId },
			...languagePlugins,
			{ getLanguageId: uri => resolveFileLanguageId(uri.path) },
		],
		createUriMap(sys.useCaseSensitiveFileNames),
		(uri, includeFsFiles) => {
			let snapshot = server.documents.get(uri)?.getSnapshot();

			if (!snapshot && includeFsFiles) {
				const cache = fsFileSnapshots.get(uri);
				const fileName = uriConverter.asFileName(uri);
				const modifiedTime = sys.getModifiedTime?.(fileName)?.valueOf();
				if (!cache || cache[0] !== modifiedTime) {
					if (sys.fileExists(fileName)) {
						const text = sys.readFile(fileName);
						const snapshot = text !== undefined ? ts.ScriptSnapshot.fromString(text) : undefined;
						fsFileSnapshots.set(uri, [modifiedTime, snapshot]);
					}
					else {
						fsFileSnapshots.set(uri, [modifiedTime, undefined]);
					}
				}
				snapshot = fsFileSnapshots.get(uri)?.[1];
			}

			if (snapshot) {
				language.scripts.set(uri, snapshot);
			}
			else {
				language.scripts.delete(uri);
			}
		}
	);
	const project: ProjectContext = {
		typescript: {
			configFileName: undefined,
			sys,
			uriConverter,
			...createLanguageServiceHost(
				ts,
				sys,
				language,
				fileName => uriConverter.asUri(fileName),
				projectHost
			),
		},
	};
	const languageService = _createLanguageService(language, server.languageServicePlugins, serviceEnv, project);

	return {
		...languageService,
		dispose: () => {
			sys.dispose();
			languageService?.dispose();
			docOpenWatcher.dispose();
			docSaveWatcher.dispose();
		},
	};

	function updateFsCacheFromSyncedDocument(document: SnapshotDocument) {
		const uri = URI.parse(document.uri);
		const fileName = uriConverter.asFileName(uri);
		if (fsFileSnapshots.has(uri) || sys.fileExists(fileName)) {
			const modifiedTime = sys.getModifiedTime?.(fileName);
			fsFileSnapshots.set(uri, [modifiedTime?.valueOf(), document.getSnapshot()]);
		}
	}
}
