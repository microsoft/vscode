/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageServer, LanguageServerProject } from '@volar/language-server';
import { createLanguageServiceEnvironment, createUriConverter, getWorkspaceFolder } from '@volar/language-server/browser';
import { createTypeScriptLS, TypeScriptProjectLS } from '@volar/language-server/lib/project/typescriptProjectLs';
import { createUriMap, LanguagePlugin } from '@volar/language-service';
import * as ts from 'typescript';
import { URI } from 'vscode-uri';
import { JQUERY_PATH } from './javascriptLibs';

export function createHtmlProject(languagePlugins: LanguagePlugin<URI>[]): LanguageServerProject {
	let server: LanguageServer;
	let tsLocalized: any;

	const { asFileName, asUri } = createUriConverter();
	const inferredProjects = createUriMap<Promise<TypeScriptProjectLS>>();

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
			project.tryAddFile(asFileName(uri));
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

	async function getOrCreateInferredProject(server: LanguageServer, workspaceFolder: URI) {
		if (!inferredProjects.has(workspaceFolder)) {
			inferredProjects.set(workspaceFolder, (async () => {
				const inferOptions = { allowNonTsExtensions: true, allowJs: true, lib: ['lib.es2020.full.d.ts'], target: 99 satisfies ts.ScriptTarget.Latest, moduleResolution: 1 satisfies ts.ModuleResolutionKind.Classic, experimentalDecorators: false };
				const serviceEnv = createLanguageServiceEnvironment(server, [workspaceFolder]);
				const project = await createTypeScriptLS(
					ts,
					tsLocalized,
					inferOptions,
					server,
					serviceEnv,
					workspaceFolder,
					() => languagePlugins,
					{ asUri, asFileName }
				);
				project.tryAddFile(JQUERY_PATH);
				return project;
			})());
		}
		return inferredProjects.get(workspaceFolder)!;
	}
}
