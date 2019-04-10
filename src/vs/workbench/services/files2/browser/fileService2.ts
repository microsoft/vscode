/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileService2 } from 'vs/workbench/services/files2/common/fileService2';
import { URI } from 'vs/base/common/uri';
import { IResolveContentOptions, IStreamContent, IStringStream, IContent, IFileSystemProvider, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { basename } from 'vs/base/common/resources';
import { VSBuffer } from 'vs/base/common/buffer';
import { localize } from 'vs/nls';

// TODO@ben temporary for testing only
export class FileService3 extends FileService2 {

	async resolveContent(resource: URI, options?: IResolveContentOptions): Promise<IContent> {
		return this.resolveStreamContent(resource, options).then(streamContent => {
			return new Promise<IContent>((resolve, reject) => {

				const result: IContent = {
					resource: streamContent.resource,
					name: streamContent.name,
					mtime: streamContent.mtime,
					etag: streamContent.etag,
					encoding: streamContent.encoding,
					isReadonly: streamContent.isReadonly,
					size: streamContent.size,
					value: ''
				};

				streamContent.value.on('data', chunk => result.value += chunk);
				streamContent.value.on('error', err => reject(err));
				streamContent.value.on('end', () => resolve(result));

				return result;
			});
		});
	}

	async resolveStreamContent(resource: URI, options?: IResolveContentOptions): Promise<IStreamContent> {
		const provider = await this.withProvider(resource);
		if (provider && provider.readFile) {
			const listeners: { [type: string]: any[]; } = Object.create(null);
			const stringStream: IStringStream = {
				on(event: string, callback: any): void {
					listeners[event] = listeners[event] || [];
					listeners[event].push(callback);
				}
			};
			const stat = await this.resolve(resource, { resolveMetadata: true });

			const r: IStreamContent = {
				mtime: stat.mtime,
				size: stat.size,
				etag: stat.etag,
				value: stringStream,
				resource: resource,
				encoding: 'utf8',
				name: basename(resource)
			};

			provider.readFile(resource).then((contents) => {
				const str = VSBuffer.wrap(contents).toString();
				listeners['data'].forEach((listener) => listener(str));
				listeners['end'].forEach((listener) => listener());
			});

			return r;
		}

		return super.resolveStreamContent(resource, options);
	}

	protected throwIfFileSystemIsReadonly(provider: IFileSystemProvider): IFileSystemProvider {
		// we really do not want to allow for changes currently
		throw new FileOperationError(localize('err.readonly', "Resource can not be modified."), FileOperationResult.FILE_PERMISSION_DENIED);
	}
}