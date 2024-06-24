/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageServer } from '@volar/language-server';
import { createLanguageServiceEnvironment } from '@volar/language-server/browser';
import { LanguagePlugin, LanguageService, createLanguageService as _createLanguageService, createLanguage, createUriMap } from '@volar/language-service';
import type { SnapshotDocument } from '@volar/snapshot-document';
import { TypeScriptProjectHost, createLanguageServiceHost, createSys, resolveFileLanguageId } from '@volar/typescript';
import * as ts from 'typescript';
import { URI } from 'vscode-uri';

export function createLanguageService(
	server: LanguageServer,
	languagePlugins: LanguagePlugin<URI>[],
	projectHost: TypeScriptProjectHost,
	{ asUri, asFileName }: {
		asUri(fileName: string): URI;
		asFileName(uri: URI): string;
	},
): LanguageService {
	const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();
	const serviceEnv = createLanguageServiceEnvironment(server, [...server.workspaceFolders.keys()])
	const sys = createSys(ts.sys, serviceEnv, projectHost.getCurrentDirectory, {
		asFileName,
		asUri,
	});
	const docOpenWatcher = server.documents.onDidOpen(({ document }) => updateFsCacheFromSyncedDocument(document));
	const docSaveWatcher = server.documents.onDidSave(({ document }) => updateFsCacheFromSyncedDocument(document));
	const language = createLanguage<URI>(
		[
			{ getLanguageId: uri => server.documents.get(server.getSyncedDocumentKey(uri) ?? uri.toString())?.languageId },
			...languagePlugins,
			{ getLanguageId: uri => resolveFileLanguageId(uri.path) },
		],
		createUriMap(sys.useCaseSensitiveFileNames),
		uri => {
			const documentUri = server.getSyncedDocumentKey(uri);
			const syncedDocument = documentUri ? server.documents.get(documentUri) : undefined;

			let snapshot: ts.IScriptSnapshot | undefined;

			if (syncedDocument) {
				snapshot = syncedDocument.getSnapshot();
			}
			else {
				// fs files
				const cache = fsFileSnapshots.get(uri);
				const fileName = asFileName(uri);
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
	language.typescript = {
		configFileName: undefined,
		sys,
		asScriptId: asUri,
		asFileName: asFileName,
		...createLanguageServiceHost(
			ts,
			sys,
			language,
			asUri,
			projectHost
		),
	};
	const languageService = _createLanguageService(
		language,
		server.languageServicePlugins,
		serviceEnv
	);

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
		const fileName = asFileName(uri);
		if (fsFileSnapshots.has(uri) || sys.fileExists(fileName)) {
			const modifiedTime = sys.getModifiedTime?.(fileName);
			fsFileSnapshots.set(uri, [modifiedTime?.valueOf(), document.getSnapshot()]);
		}
	}
}
