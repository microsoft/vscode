import { ServerProject, ServerProjectProviderFactory } from '@volar/language-server';
import { createServiceEnvironment, getWorkspaceFolder } from '@volar/language-server/node';
import type { SnapshotDocument } from '@volar/snapshot-document';
import { URI } from 'vscode-uri';
import { createProject } from './project';

export const serverProjectProviderFactory: ServerProjectProviderFactory = (context, serverOptions, servicePlugins) => {

	const { uriToFileName } = context.runtimeEnv;

	let inferredProject: Promise<ServerProject> | undefined;
	let currentTextDocument: SnapshotDocument | undefined;

	return {
		async getProject(uri) {
			currentTextDocument = context.documents.get(uri);
			const workspaceFolder = getWorkspaceFolder(uri, context.workspaceFolders, uriToFileName);
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

	async function getOrCreateProject(workspaceFolder: URI) {
		if (!inferredProject) {
			inferredProject = (async () => {
				const serviceEnv = createServiceEnvironment(context, workspaceFolder);
				return createProject(
					context,
					serviceEnv,
					serverOptions.getLanguagePlugins,
					servicePlugins,
					() => currentTextDocument!,
				);
			})();
		}
		return await inferredProject;
	}
};
