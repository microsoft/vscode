/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ServerProject } from '@volar/language-server';
import { ServerOptions } from '@volar/language-server/lib/server';
import { LanguageService, ServiceEnvironment, ServicePlugin, createLanguageService, TextDocument } from '@volar/language-service';
import { createLanguage, createSys } from '@volar/typescript';
import { createProjectHost } from './projectHost';
import * as ts from 'typescript';

export async function createProject(
	serviceEnv: ServiceEnvironment,
	servicePlugins: ServicePlugin[],
	getLanguagePlugins: ServerOptions['getLanguagePlugins'],
	getCurrentTextDocument: () => TextDocument,
	getCurrentSnapshot: () => ts.IScriptSnapshot,
): Promise<ServerProject> {

	let languageService: LanguageService | undefined;

	const sys = createSys(ts, serviceEnv, '');
	const host = createProjectHost(
		serviceEnv.typescript!,
		fileName => sys.readFile(fileName),
		getCurrentTextDocument,
		getCurrentSnapshot,
	);
	const languagePlugins = await getLanguagePlugins(serviceEnv, {
		typescript: {
			configFileName: undefined,
			host,
			sys,
		},
	});

	return {
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
