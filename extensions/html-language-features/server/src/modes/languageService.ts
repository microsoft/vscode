/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageServer } from '@volar/language-server';
import { LanguagePlugin, LanguageServiceEnvironment, createLanguage, createLanguageService, createUriMap } from '@volar/language-service';
import type { SnapshotDocument } from '@volar/snapshot-document';
import { TypeScriptProjectHost, createLanguageServiceHost, createSys, resolveFileLanguageId } from '@volar/typescript';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';

export async function createTypeScriptLanguageService(
	ts: typeof import('typescript'),
	tsLocalized: ts.MapLike<string> | undefined,
	compilerOptions: ts.CompilerOptions,
	server: LanguageServer,
	serviceEnv: LanguageServiceEnvironment,
	languagePlugins: LanguagePlugin<URI>[],
	{
		asUri,
		asFileName,
	}: {
		asUri(fileName: string): URI;
		asFileName(uri: URI): string;
	},
	getCurrentDirectory: () => string,
	getProjectVersion: () => string,
	getScriptFileNames: () => string[]
) {
	const fsFileSnapshots = createUriMap<[number | undefined, ts.IScriptSnapshot | undefined]>();
	const sys = createSys(ts.sys, serviceEnv, getCurrentDirectory, {
		asFileName,
		asUri,
	});
	const projectHost: TypeScriptProjectHost = {
		getCurrentDirectory,
		getProjectVersion,
		getScriptFileNames,
		getScriptSnapshot(fileName) {
			const uri = asUri(fileName);
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
	};
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
	const languageService = createLanguageService(
		language,
		server.languageServicePlugins,
		serviceEnv
	);

	return {
		languageService,
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
