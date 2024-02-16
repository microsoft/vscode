import { ServerProject, ServerProjectProviderFactory } from '@volar/language-server';
import { ServerContext, ServerOptions } from '@volar/language-server/lib/server';
import { createServiceEnvironment, getWorkspaceFolder } from '@volar/language-server/node';
import { LanguageService, ServiceEnvironment, ServicePlugin, TypeScriptProjectHost, createLanguageService, resolveCommonLanguageId } from '@volar/language-service';
import { createLanguage, createSys } from '@volar/typescript';
import type * as ts from 'typescript';
import { URI } from 'vscode-uri';
import type { SnapshotDocument } from '@volar/snapshot-document'
import { JQUERY_PATH } from './javascriptLibs';

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
				return createProject(context, serviceEnv, serverOptions.getLanguagePlugins, servicePlugins);
			})();
		}
		return await inferredProject;
	}

	async function createProject(
		context: ServerContext,
		serviceEnv: ServiceEnvironment,
		getLanguagePlugins: ServerOptions['getLanguagePlugins'],
		servicePlugins: ServicePlugin[],
	): Promise<ServerProject> {

		let languageService: LanguageService | undefined;

		const libSnapshots = new Map<string, ts.IScriptSnapshot | undefined>();
		const { fileNameToUri } = context.runtimeEnv;
		const ts = context.ts!;
		const compilerOptions: ts.CompilerOptions = { allowNonTsExtensions: true, allowJs: true, lib: ['lib.es2020.full.d.ts'], target: ts.ScriptTarget.Latest, moduleResolution: ts.ModuleResolutionKind.Classic, experimentalDecorators: false };
		const sys = createSys(ts, serviceEnv, { getCurrentDirectory: () => '' } as any);
		const host: TypeScriptProjectHost = {
			getCompilationSettings: () => compilerOptions,
			getScriptFileNames: () => [uriToFileName(currentTextDocument!.uri), JQUERY_PATH],
			getCurrentDirectory: () => '',
			getProjectVersion: () => currentTextDocument!.uri + ',' + currentTextDocument!.version.toString() + ',' + sys.version,
			getScriptSnapshot: fileName => {
				if (fileNameToUri(fileName) === currentTextDocument!.uri) {
					const document = context.documents.get(fileNameToUri(fileName));
					if (document) {
						return document.getSnapshot();
					}
				}
				else {
					let snapshot = libSnapshots.get(fileName);
					if (!snapshot) {
						const text = sys.readFile?.(fileName);
						if (text !== undefined) {
							snapshot = ts.ScriptSnapshot.fromString(text);
						}
						libSnapshots.set(fileName, snapshot);
					}
					return snapshot;
				}
				return undefined;
			},
			getLocalizedDiagnosticMessages: context.tsLocalized ? () => context.tsLocalized : undefined,
			getLanguageId: uri => context.documents.get(uri)?.languageId ?? resolveCommonLanguageId(uri),
		};
		const languagePlugins = await getLanguagePlugins(serviceEnv, {
			typescript: {
				configFileName: undefined,
				host,
				sys,
			},
		});

		return {
			serviceEnv,
			getLanguageService,
			getLanguageServiceDontCreate: () => languageService,
			dispose,
		};

		function getLanguageService() {
			if (!languageService) {
				const language = createLanguage(
					ts,
					sys,
					languagePlugins,
					undefined,
					host,
					{
						fileNameToFileId: serviceEnv.typescript!.fileNameToUri,
						fileIdToFileName: serviceEnv.typescript!.uriToFileName,
					},
				);
				languageService = createLanguageService(
					language,
					servicePlugins,
					serviceEnv,
				);
			}
			return languageService;
		}
		function dispose() {
			sys.dispose();
			languageService?.dispose();
		}
	}
};
