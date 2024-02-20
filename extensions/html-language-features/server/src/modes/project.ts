import { ServerProject } from '@volar/language-server';
import { ServerContext, ServerOptions } from '@volar/language-server/lib/server';
import { LanguageService, ServiceEnvironment, ServicePlugin, createLanguageService } from '@volar/language-service';
import type { SnapshotDocument } from '@volar/snapshot-document';
import { createLanguage, createSys } from '@volar/typescript';
import { createProjectHost } from './projectHost';

export async function createProject(
	context: ServerContext,
	serviceEnv: ServiceEnvironment,
	getLanguagePlugins: ServerOptions['getLanguagePlugins'],
	servicePlugins: ServicePlugin[],
	getCurrentTextDocument: () => SnapshotDocument,
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;

	const ts = context.ts!;
	const sys = createSys(ts, serviceEnv, '');
	const host = createProjectHost(
		serviceEnv.typescript!,
		fileName => sys.readFile(fileName),
		getCurrentTextDocument,
		() => getCurrentTextDocument().getSnapshot(),
		context.tsLocalized,
	)
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
