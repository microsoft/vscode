/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ClientCapabilities, ServiceEnvironment, TextDocument } from '@volar/language-server';
import { fileNameToUri, uriToFileName } from '@volar/language-server/lib/uri';
import { createFs } from '@volar/language-server/node';
import * as ts from 'typescript';
import { htmlLanguagePlugin } from '../modes/languagePlugin';
import { createProject } from '../modes/project';
import { getServicePlugins } from '../modes/servicePlugins';

const fs = createFs({});
const serviceEnv: ServiceEnvironment = {
	workspaceFolder: '',
	fs: fs,
	typescript: {
		fileNameToUri: fileNameToUri,
		uriToFileName: uriToFileName,
	},
};
const project = createProject(
	serviceEnv,
	getServicePlugins(),
	() => [htmlLanguagePlugin],
	() => currentDucment,
	() => currentDocumentSnapshot,
);

let currentDucment: TextDocument;
let currentDocumentSnapshot: ts.IScriptSnapshot;

export async function getTestService({
	uri = 'test://test/test.html',
	languageId = 'html',
	content,
	workspaceFolder = uri.substr(0, uri.lastIndexOf('/')),
	clientCapabilities,
}: {
	uri?: string;
	languageId?: string;
	content: string;
	workspaceFolder?: string;
	clientCapabilities?: ClientCapabilities;
}) {
	currentDucment = TextDocument.create(uri, languageId, (currentDucment?.version ?? 0) + 1, content);
	currentDocumentSnapshot = ts.ScriptSnapshot.fromString(content);
	serviceEnv.workspaceFolder = workspaceFolder;
	serviceEnv.clientCapabilities = clientCapabilities;
	return {
		document: currentDucment,
		languageService: (await project).getLanguageService(),
	};
}
