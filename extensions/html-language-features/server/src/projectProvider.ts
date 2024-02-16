import { ServerProjectProviderFactory } from '@volar/language-server';
import { getInferredCompilerOptions } from '@volar/language-server/lib/project/inferredCompilerOptions';
import { TypeScriptServerProject, createTypeScriptServerProject } from '@volar/language-server/lib/project/typescriptProject';
import { createUriMap } from '@volar/language-server/lib/utils/uriMap';
import { createServiceEnvironment, getWorkspaceFolder } from '@volar/language-server/node';
import { URI } from 'vscode-uri';

export const serverProjectProviderFactory: ServerProjectProviderFactory = (context, serverOptions, servicePlugins) => {

	const { uriToFileName } = context.runtimeEnv;
	const inferredProjects = createUriMap<Promise<TypeScriptServerProject>>(context.runtimeEnv.fileNameToUri);

	return {
		async getProject(uri) {
			const workspaceFolder = getWorkspaceFolder(uri, context.workspaceFolders, uriToFileName);
			return await getOrCreateInferredProject(uri, workspaceFolder);
		},
		async getProjects() {
			return await Promise.all(inferredProjects.values());
		},
		reloadProjects() {
			for (const project of inferredProjects.values()) {
				project.then(project => project.dispose());
			}
			inferredProjects.clear();
			context.reloadDiagnostics();
		},
	};

	async function getOrCreateInferredProject(uri: string, workspaceFolder: URI) {
		if (!inferredProjects.uriHas(workspaceFolder.toString())) {
			inferredProjects.uriSet(workspaceFolder.toString(), (async () => {
				const inferOptions = await getInferredCompilerOptions(context.configurationHost);
				const serviceEnv = createServiceEnvironment(context, workspaceFolder);
				return createTypeScriptServerProject(inferOptions, context, serviceEnv, serverOptions, servicePlugins);
			})());
		}
		const project = await inferredProjects.uriGet(workspaceFolder.toString())!;
		project.tryAddFile(uriToFileName(uri));
		return project;
	}
};
