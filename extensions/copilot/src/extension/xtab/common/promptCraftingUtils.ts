/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { Schemas } from '../../../util/vs/base/common/network';
import { isWindows } from '../../../util/vs/base/common/platform';

export function toUniquePath(documentId: DocumentId, workspaceRootPath: string | undefined): string {
	const filePath = documentId.path;
	const workspaceRootPathWithSlash = workspaceRootPath === undefined ? undefined : (workspaceRootPath.endsWith('/') ? workspaceRootPath : workspaceRootPath + '/');
	const documentScheme = documentId.toUri().scheme;
	const isWorkspaceRelative = workspaceRootPathWithSlash !== undefined
		&& normalizeWindowsDriveLetter(filePath).startsWith(normalizeWindowsDriveLetter(workspaceRootPathWithSlash));

	const updatedFilePath = isWorkspaceRelative
		? filePath.substring(workspaceRootPathWithSlash.length)
		: filePath;

	return documentScheme === Schemas.vscodeNotebookCell ? `${updatedFilePath}#${documentId.fragment}` : updatedFilePath;
}

function normalizeWindowsDriveLetter(path: string): string {
	return isWindows && /^\/[a-zA-Z]:/.test(path) ? `/${path[1].toLowerCase()}${path.substring(2)}` : path;
}

export function countTokensForLines(page: string[], computeTokens: (s: string) => number): number {
	return page.reduce((sum, line) => sum + computeTokens(line) + 1 /* \n */, 0);
}
