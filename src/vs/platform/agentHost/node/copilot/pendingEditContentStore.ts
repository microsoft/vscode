/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';

/**
 * URI scheme for transient file content backing tool-call write-permission
 * previews. Files under this scheme live in an in-memory provider registered
 * on the agent host's file service; content can be read/written through the
 * file service just like any other resource.
 */
export const PENDING_EDIT_CONTENT_SCHEME = 'pending-edit-content';

/**
 * Builds a `pending-edit-content:` URI identifying the proposed "after"
 * content for a write permission request. The authority is a hex-encoded
 * session URI so multiple concurrent sessions don't collide.
 */
export function buildPendingEditContentUri(sessionUri: string, toolCallId: string, filePath: string): URI {
	return URI.from({
		scheme: PENDING_EDIT_CONTENT_SCHEME,
		authority: encodeHex(VSBuffer.fromString(sessionUri)).toString(),
		path: `/${encodeURIComponent(toolCallId)}/${encodeHex(VSBuffer.fromString(filePath))}`,
	});
}

/**
 * Registers a fresh {@link InMemoryFileSystemProvider} for the
 * `pending-edit-content:` scheme on the given file service. Callers use the
 * returned disposable to unregister the provider.
 */
export function registerPendingEditContentProvider(fileService: IFileService): IDisposable {
	const provider = new InMemoryFileSystemProvider();
	const registration = fileService.registerProvider(PENDING_EDIT_CONTENT_SCHEME, provider);
	return {
		dispose() {
			registration.dispose();
			provider.dispose();
		},
	};
}

