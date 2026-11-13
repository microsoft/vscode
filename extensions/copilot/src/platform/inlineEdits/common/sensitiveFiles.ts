/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { posix } from '../../../util/vs/base/common/path';
import { DocumentId } from './dataTypes/documentId';

const sensitiveFileNames = new Set([
	'.env',
	'mcp.json',
	'.npmrc',
	'.pypirc',
	'.netrc',
	'_netrc',
	'.git-credentials',
	'.pgpass',
	'id_rsa',
	'id_dsa',
	'id_ecdsa',
	'id_ed25519',
]);

const sensitiveFileExtensions = new Set(['.pem', '.key', '.p12', '.pfx']);

/**
 * Whether the document is a file that commonly holds secrets, such as tokens, passwords or private keys.
 */
export function isSensitiveFile(docId: DocumentId): boolean {
	const name = posix.basename(docId.path).toLowerCase();
	return sensitiveFileNames.has(name) || name.startsWith('.env.') || sensitiveFileExtensions.has(posix.extname(name));
}

/**
 * Whether the content of `docId` may be sent in a request made for `activeDocId`. Files that commonly
 * hold secrets are still served, but their content is only ever sent in requests for themselves.
 */
export function canUseAsContext(docId: DocumentId, activeDocId: DocumentId): boolean {
	return docId === activeDocId || !isSensitiveFile(docId);
}
