/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { Schemas } from '../../../util/vs/base/common/network';
import { isWindows } from '../../../util/vs/base/common/platform';
import { startsWithIgnoreCase } from '../../../util/vs/base/common/strings';

export function toUniquePath(documentId: DocumentId, workspaceRootPath: string | undefined): string {
	const filePath = documentId.path;
	const workspaceRootPathWithSlash = workspaceRootPath === undefined ? undefined : (workspaceRootPath.endsWith('/') ? workspaceRootPath : workspaceRootPath + '/');
	const documentScheme = documentId.toUri().scheme;
	const ignorePathCase = isWindows && (documentScheme === Schemas.file || documentScheme === Schemas.vscodeNotebookCell);
	const isWorkspaceRelative = workspaceRootPathWithSlash !== undefined
		&& (ignorePathCase ? startsWithIgnoreCase(filePath, workspaceRootPathWithSlash) : filePath.startsWith(workspaceRootPathWithSlash));

	const updatedFilePath = isWorkspaceRelative
		? filePath.substring(workspaceRootPathWithSlash.length)
		: filePath;

	return documentScheme === Schemas.vscodeNotebookCell ? `${updatedFilePath}#${documentId.fragment}` : updatedFilePath;
}

export function countTokensForLines(page: string[], computeTokens: (s: string) => number): number {
	return page.reduce((sum, line) => sum + computeTokens(line) + 1 /* \n */, 0);
}
