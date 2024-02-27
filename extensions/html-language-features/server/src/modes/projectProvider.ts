/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServerProject, ServerProjectProviderFactory } from '@volar/language-server';
import { createServiceEnvironment, getWorkspaceFolder } from '@volar/language-server/node';
import type { SnapshotDocument } from '@volar/snapshot-document';
import { createProject } from './project';

export const serverProjectProviderFactory: ServerProjectProviderFactory = (context, servicePlugins, getLanguagePlugins) => {

	let inferredProject: Promise<ServerProject> | undefined;
	let currentTextDocument: SnapshotDocument | undefined;

	return {
		async getProject(uri) {
			currentTextDocument = context.documents.get(uri);
			const workspaceFolder = getWorkspaceFolder(uri, context.workspaceFolders);
			return await getOrCreateProject(workspaceFolder);
		},
		async getProjects() {
			if (inferredProject) {
				return [await inferredProject];
			}
			return [];
		},
		reloadProjects() {
			inferredProject?.then(project => project.dispose());
			inferredProject = undefined;
			context.reloadDiagnostics();
		},
	};

	async function getOrCreateProject(workspaceFolder: string) {
		if (!inferredProject) {
			inferredProject = (async () => {
				const serviceEnv = createServiceEnvironment(context, workspaceFolder);
				return createProject(
					serviceEnv,
					servicePlugins,
					getLanguagePlugins,
					() => currentTextDocument!,
					() => currentTextDocument!.getSnapshot(),
				);
			})();
		}
		return await inferredProject;
	}
};
