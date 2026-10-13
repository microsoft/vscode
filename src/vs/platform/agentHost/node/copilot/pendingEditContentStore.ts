/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../../base/common/lifecycle.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { PENDING_EDIT_CONTENT_SCHEME } from '../../common/pendingEditContentUri.js';

export { buildPendingEditContentUri, PENDING_EDIT_CONTENT_SCHEME } from '../../common/pendingEditContentUri.js';

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
