/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { toDeepIFileStat } from 'vs/workbench/services/files/electron-browser/remoteFileService';
import { IFileSystemProvider, IStat, IFileStat, FileType } from 'vs/platform/files/common/files';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { IProgress } from 'vs/platform/progress/common/progress';
import { extname } from 'path';

suite('RemoteFileSystem', function () {

	class StatOnlyProvider implements IFileSystemProvider {

		stat(resource: URI): TPromise<IStat, any> {
			const ext = extname(resource.path);
			return TPromise.as(!ext
				? StatOnlyProvider.createFolderStat(resource)
				: StatOnlyProvider.createFileStat(resource)
			);
		}
		readdir(resource: URI): TPromise<IStat[], any> {
			return TPromise.as([]);
		}
		// throw errors on the rest
		utimes(resource: URI, mtime: number): TPromise<IStat, any> {
			throw new Error('Method not implemented.');
		}
		read(resource: URI, progress: IProgress<Uint8Array>): TPromise<void, any> {
			throw new Error('Method not implemented.');
		}
		write(resource: URI, content: Uint8Array): TPromise<void, any> {
			throw new Error('Method not implemented.');
		}
		unlink(resource: URI): TPromise<void, any> {
			throw new Error('Method not implemented.');
		}
		rename(resource: URI, target: URI): TPromise<void, any> {
			throw new Error('Method not implemented.');
		}
		mkdir(resource: URI): TPromise<void, any> {
			throw new Error('Method not implemented.');
		}
		rmdir(resource: URI): TPromise<void, any> {
			throw new Error('Method not implemented.');
		}

		static createFileStat(resource: URI): IStat {
			return {
				resource,
				mtime: Date.now(),
				size: 42,
				type: FileType.File
			};
		}

		static createFolderStat(resource: URI, hasChildren: boolean = true): IStat {
			return {
				resource,
				mtime: Date.now(),
				size: 42,
				type: FileType.Dir
			};
		}
	};

	test('toDeepIFileStat', function () {

		const provider = new StatOnlyProvider();
		const root: IFileStat = {
			resource: URI.parse('foo:///test/root'),
			name: 'root',
			isDirectory: true,
			hasChildren: true,
			mtime: Date.now(),
			etag: ''
		};
		toDeepIFileStat(provider, root, [
			URI.parse('foo:///test/root/folder1'),
			URI.parse('foo:///test/root/folder2/folder1/child2'),
			URI.parse('foo:///test/root/folder2/child2'),
			URI.parse('foo:///test/root/folder3/child2'),
		]);
	});
});
