/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DocumentId } from '../../../platform/inlineEdits/common/dataTypes/documentId';
import { Result } from '../../../util/common/result';
import { Schemas } from '../../../util/vs/base/common/network';
import { isAbsolute } from '../../../util/vs/base/common/path';
import { isWindows } from '../../../util/vs/base/common/platform';
import { URI } from '../../../util/vs/base/common/uri';

/** Keeps document paths reversible and free of whitespace in NES's unquoted path fields. */
export function toUniquePath(documentId: DocumentId, workspaceRootPath: string | undefined): string {
	const filePath = documentId.path;
	const workspaceRootPathWithSlash = workspaceRootPath === undefined ? undefined : (workspaceRootPath.endsWith('/') ? workspaceRootPath : workspaceRootPath + '/');
	const documentScheme = documentId.toUri().scheme;
	const isWorkspaceRelative = workspaceRootPathWithSlash !== undefined
		&& normalizeWindowsDriveLetter(filePath).startsWith(normalizeWindowsDriveLetter(workspaceRootPathWithSlash));

	const updatedFilePath = isWorkspaceRelative
		? filePath.substring(workspaceRootPathWithSlash.length)
		: filePath;
	const encodedPath = updatedFilePath.split('/').map(segment => encodeURIComponent(segment)).join('/');

	return documentScheme === Schemas.vscodeNotebookCell ? `${encodedPath}#${encodeURIComponent(documentId.fragment)}` : encodedPath;
}

/** Decodes a model's path token exactly once, preserving literal percent escapes and notebook cell fragments. */
export function resolveUniquePath(uniquePath: string, workspaceRoot: URI | undefined): Result<DocumentId, Error> {
	const fragmentIndex = uniquePath.indexOf('#');
	let filePath: string;
	let fragment: string | undefined;
	try {
		filePath = decodeURIComponent(fragmentIndex === -1 ? uniquePath : uniquePath.substring(0, fragmentIndex));
		fragment = fragmentIndex === -1 ? undefined : decodeURIComponent(uniquePath.substring(fragmentIndex + 1));
	} catch (error) {
		if (error instanceof URIError) {
			return Result.error(error);
		}
		throw error;
	}

	if (!filePath) {
		return Result.fromString('Empty NES document path.');
	}

	const uri = isAbsolute(filePath)
		? URI.file(filePath)
		: workspaceRoot ? URI.joinPath(workspaceRoot, filePath) : undefined;
	if (!uri) {
		return Result.fromString('Cannot resolve a relative NES document path without a workspace.');
	}

	return Result.ok(DocumentId.create((fragment === undefined ? uri : uri.with({ scheme: Schemas.vscodeNotebookCell, fragment })).toString()));
}

function normalizeWindowsDriveLetter(path: string): string {
	return isWindows && /^\/[a-zA-Z]:/.test(path) ? `/${path[1].toLowerCase()}${path.substring(2)}` : path;
}

export function countTokensForLines(page: string[], computeTokens: (s: string) => number): number {
	return page.reduce((sum, line) => sum + computeTokens(line) + 1 /* \n */, 0);
}
