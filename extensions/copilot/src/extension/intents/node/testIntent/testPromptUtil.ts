/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspaceService } from '../../../../platform/workspace/common/workspaceService';
import * as path from '../../../../util/vs/base/common/path';
import { URI } from '../../../../util/vs/base/common/uri';
import { ChatVariablesCollection } from '../../../prompt/common/chatVariablesCollection';
import { IDocumentContext } from '../../../prompt/node/documentContext';


interface TestGenUserQueryParams {
	workspaceService: IWorkspaceService;
	chatVariables: ChatVariablesCollection;
	userQuery: string;
	testFileToWriteTo: URI;
	testedSymbolIdentifier: string | undefined;
	context: IDocumentContext;
}

export function formatRequestAndUserQuery({ workspaceService, chatVariables, userQuery, testFileToWriteTo, testedSymbolIdentifier, context }: TestGenUserQueryParams) {

	const testTarget = testedSymbolIdentifier ? `\`${testedSymbolIdentifier}\`` : `my code`;

	const rewrittenMessage = chatVariables.substituteVariablesWithReferences(userQuery);

	const pathToTestFile = relativeToWorkspace(workspaceService, testFileToWriteTo.path);

	const requestAndUserQueryParts: string[] = [];

	requestAndUserQueryParts.push(`Please, generate tests for ${testTarget}.`);

	if (pathToTestFile !== null) {
		let locationMessage = `The tests will be placed in \`${pathToTestFile}\``;
		locationMessage += (pathToTestFile.includes('/')
			? '.'
			: ` located in the same directory as \`${relativeToWorkspace(workspaceService, context.document.uri.path)}\`.`
		);
		requestAndUserQueryParts.push(locationMessage);
		requestAndUserQueryParts.push('Generate tests accordingly.');
	}

	requestAndUserQueryParts.push(rewrittenMessage);

	const requestAndUserQuery = requestAndUserQueryParts.filter(s => s !== '').join(' ').trim();

	return requestAndUserQuery;
}

/**
 * @return undefined if no workspace contains given path
 */
export function relativeToWorkspace(workspaceService: IWorkspaceService, absPath: string): string | null {

	const workspaceOfTestFile = workspaceService.getWorkspaceFolders().find(folder => absPath.startsWith(folder.path));

	if (workspaceOfTestFile === undefined) {
		return null;
	}

	const relPath = path.relative(workspaceOfTestFile.path, absPath);

	// Convert the path separator to be platform-independent
	const relPathPosix = relPath.split(path.sep).join('/');

	return relPathPosix;
}
