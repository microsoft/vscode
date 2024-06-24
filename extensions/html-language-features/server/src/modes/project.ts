/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageServer, LanguageServerProject } from '@volar/language-server';
import { createLanguageServiceEnvironment, createUriConverter, getWorkspaceFolder } from '@volar/language-server/browser';
import { createUriMap, LanguagePlugin, LanguageService } from '@volar/language-service';
import * as ts from 'typescript';
import { URI, Utils } from 'vscode-uri';
import { HTMLDocumentRegions } from './embeddedSupport';
import { JQUERY_PATH } from './javascriptLibs';
import { createTypeScriptLanguageService } from './typeScriptLanguageService';

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
	let tsLocalized: any;
	let projectVersion: string = '';

	const { asFileName, asUri } = createUriConverter();
	const inferredProjects = createUriMap<ReturnType<typeof createTypeScriptLanguageService>>();
	const currentRootFiles: string[] = [];

	return {
		setup(_server) {
			server = _server;
			if (server.initializeParams.locale) {
				try {
					tsLocalized = require(`typescript/lib/${server.initializeParams.locale}/diagnosticMessages.generated.json`);
				} catch { }
			}
		},
		async getLanguageService(uri) {
			const workspaceFolder = getWorkspaceFolder(uri, server.workspaceFolders);
			const project = await getOrCreateInferredProject(server, workspaceFolder);
			updateRootFiles(uri, project.languageService);
			return project.languageService;
		},
		async getExistingLanguageServices() {
			const projects = await Promise.all(inferredProjects.values());
			return projects.map(project => project.languageService);
		},
		reload() {
			for (const project of inferredProjects.values()) {
				project.then(p => p.dispose());
			}
			inferredProjects.clear();
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
		currentRootFiles.length = 0;
		currentRootFiles.push(JQUERY_PATH);
		currentRootFiles.push(asFileName(uri));

		const sourceScript = languageService.context.language.scripts.get(uri);
		if (sourceScript?.generated && 'documentRegions' in sourceScript.generated.root) {
			const regions = sourceScript.generated.root.documentRegions as HTMLDocumentRegions;
			if (regions) {
				for (const script of regions.getImportedScripts()) {
					if (script.startsWith('http://') || script.startsWith('https://') || script.startsWith('//')) {
						continue;
					}
					else if (script.startsWith('file://')) {
						const scriptUri = URI.parse(script);
						currentRootFiles.push(asFileName(scriptUri));
					}
					else {
						const scriptUri = Utils.resolvePath(Utils.dirname(uri), script);
						currentRootFiles.push(asFileName(scriptUri));
					}
				}
			}
		}
	}

	async function getOrCreateInferredProject(server: LanguageServer, workspaceFolder: URI) {
		if (!inferredProjects.has(workspaceFolder)) {
			inferredProjects.set(workspaceFolder, (async () => {
				const serviceEnv = createLanguageServiceEnvironment(server, [workspaceFolder]);
				const project = await createTypeScriptLanguageService(
					ts,
					tsLocalized,
					compilerOptions,
					server,
					serviceEnv,
					workspaceFolder,
					languagePlugins,
					{ asUri, asFileName },
					() => projectVersion,
					() => currentRootFiles
				);
				return project;
			})());
		}
		return inferredProjects.get(workspaceFolder)!;
	}
}
