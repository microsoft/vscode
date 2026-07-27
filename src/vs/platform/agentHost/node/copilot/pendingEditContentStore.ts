/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { encodeHex, VSBuffer } from '../../../../base/common/buffer.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { ILogService } from '../../../log/common/log.js';

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
 * Owns the transient proposed file contents associated with pending write
 * permissions for one Copilot session.
 */
export class PendingEditContentStore implements IDisposable {

	private readonly _uris = new Map<string, URI>();

	constructor(
		private readonly _sessionUri: string,
		private readonly _sessionId: string,
		private readonly _fileService: IFileService,
		private readonly _logService: ILogService,
	) { }

	async write(toolCallId: string, filePath: string, content: string): Promise<URI | undefined> {
		const uri = buildPendingEditContentUri(this._sessionUri, toolCallId, filePath);
		try {
			await this._fileService.writeFile(uri, VSBuffer.fromString(content));
		} catch (err) {
			this._logService.warn(`[Copilot:${this._sessionId}] Failed to write pending edit content for ${filePath}`, err);
			return undefined;
		}
		this._uris.set(toolCallId, uri);
		return uri;
	}

	delete(toolCallId: string): void {
		this._delete(toolCallId, 'pending edit content');
	}

	deleteOrphaned(toolCallId: string): void {
		this._delete(toolCallId, 'orphaned pending edit content');
	}

	private _delete(toolCallId: string, description: string): void {
		const uri = this._uris.get(toolCallId);
		if (!uri) {
			return;
		}
		this._uris.delete(toolCallId);
		this._fileService.del(uri).catch(err => {
			this._logService.warn(`[Copilot:${this._sessionId}] Failed to delete ${description}: ${uri.toString()}`, err);
		});
	}

	dispose(): void {
		for (const toolCallId of this._uris.keys()) {
			this.delete(toolCallId);
		}
	}
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
