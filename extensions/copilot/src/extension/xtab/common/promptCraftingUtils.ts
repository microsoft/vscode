/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { Schemas } from '../../../util/vs/base/common/network';

export function toUniquePath(documentId: DocumentId, workspaceRootPath: string | undefined): string {
	const filePath = documentId.path;
	// remove prefix from path if defined
	const workspaceRootPathWithSlash = workspaceRootPath === undefined ? undefined : (workspaceRootPath.endsWith('/') ? workspaceRootPath : workspaceRootPath + '/');

	const updatedFilePath = workspaceRootPathWithSlash !== undefined && filePath.startsWith(workspaceRootPathWithSlash)
		? filePath.substring(workspaceRootPathWithSlash.length)
		: filePath;

	return documentId.toUri().scheme === Schemas.vscodeNotebookCell ? `${updatedFilePath}#${documentId.fragment}` : updatedFilePath;
}

export function countTokensForLines(page: string[], computeTokens: (s: string) => number): number {
	return page.reduce((sum, line) => sum + computeTokens(line) + 1 /* \n */, 0);
}

