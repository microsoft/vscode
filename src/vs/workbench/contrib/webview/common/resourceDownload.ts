/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promiseWithResolvers } from '../../../../base/common/async.js';
import { VSBufferReadableStream } from '../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { dirname, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';

/** Streams into a temporary sibling before atomically replacing the destination. */
export async function saveWebviewResource(read: (token: CancellationToken) => Promise<VSBufferReadableStream>, target: URI, fileService: IFileService, logService: ILogService, token: CancellationToken): Promise<void> {
	const temporaryResource = joinPath(dirname(target), `.vscode-download-${generateUuid()}.tmp`);
	const disposables = new DisposableStore();
	const cts = disposables.add(new CancellationTokenSource(token));
	let content: VSBufferReadableStream | undefined;
	let streamDone = Promise.resolve();
	let writeStarted = false;
	try {
		if (cts.token.isCancellationRequested) {
			throw new CancellationError();
		}

		const stream = content = await read(cts.token);
		disposables.add(toDisposable(() => stream.destroy()));
		const finished = promiseWithResolvers<void>();
		streamDone = finished.promise;
		stream.on('end', () => finished.resolve());
		stream.on('error', () => finished.resolve());
		if (cts.token.isCancellationRequested) {
			throw new CancellationError();
		}

		writeStarted = true;
		await fileService.writeFile(temporaryResource, content);
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}

		await fileService.move(temporaryResource, target, true, { atomic: true });
	} catch (error) {
		if (writeStarted) {
			try {
				await fileService.del(temporaryResource);
			} catch (cleanupError) {
				if (!(cleanupError instanceof FileOperationError && cleanupError.fileOperationResult === FileOperationResult.FILE_NOT_FOUND)) {
					logService.error('Unable to remove temporary webview download', cleanupError);
				}
			}
		}
		throw token.isCancellationRequested ? new CancellationError() : error;
	} finally {
		cts.cancel();
		try {
			// Let terminal stream events release the file service's read resources before destroying the stream.
			content?.resume();
			await streamDone;
		} finally {
			disposables.dispose();
		}
	}
}
