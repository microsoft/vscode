/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isAbsolute } from 'node:path';
import type * as vscode from 'vscode';
import { CancellationError } from '../../../util/vs/base/common/errors';
import { URI } from '../../../util/vs/base/common/uri';

/**
 * Document handling shared by the TS6 and TS7 structural diff providers.
 */
export namespace StructuralDiffDocuments {

	/**
	 * Returns the file whose version the modified document shows, or `undefined` if the document is not
	 * a TypeScript working file or Git snapshot. A Git snapshot is resolved from its metadata rather than
	 * its possibly decorated path.
	 */
	export function getBackingFile(document: vscode.TextDocument): vscode.Uri | undefined {
		if ((document.uri.scheme !== 'file' && document.uri.scheme !== 'git')
			|| (document.languageId !== 'typescript' && document.languageId !== 'typescriptreact')) {
			return undefined;
		}
		if (document.uri.scheme === 'file') {
			return document.uri;
		}
		const params: unknown = JSON.parse(document.uri.query);
		if (typeof params !== 'object' || params === null
			|| !('path' in params) || typeof params.path !== 'string' || !isAbsolute(params.path)
			|| !('ref' in params) || typeof params.ref !== 'string') {
			throw new Error('TypeScript structural diff requires a Git URI with an absolute file path and a string ref');
		}
		return URI.file(params.path);
	}

	/**
	 * Returns a check that throws a {@link CancellationError} once the request is cancelled or either
	 * document is closed or edited, because a result would no longer match the documents.
	 */
	export function createCancellationCheck(originalDocument: vscode.TextDocument, modifiedDocument: vscode.TextDocument, token: vscode.CancellationToken): () => void {
		const originalVersion = originalDocument.version;
		const modifiedVersion = modifiedDocument.version;
		return () => {
			if (token.isCancellationRequested || originalDocument.isClosed || modifiedDocument.isClosed
				|| originalDocument.version !== originalVersion || modifiedDocument.version !== modifiedVersion) {
				throw new CancellationError();
			}
		};
	}
}
