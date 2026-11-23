/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as vscode from 'vscode';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileType } from '../../../../platform/files/common/files.js';
import { MainThreadFileSystemShape } from '../../common/extHost.protocol.js';
import { ExtHostConsumerFileSystem } from '../../common/extHostFileSystemConsumer.js';
import { ExtHostFileSystemInfo } from '../../common/extHostFileSystemInfo.js';
import { SingleProxyRPCProtocol } from './testRPCProtocol.js';

suite('ExtHostConsumerFileSystem', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const uri = URI.parse('test:/file');
	const provider = new class extends mock<vscode.FileSystemProvider>() {
		override stat(): vscode.FileStat {
			return { type: FileType.File, ctime: 0, mtime: 0, size: 0 };
		}
		override readFile(): Uint8Array {
			return new Uint8Array();
		}
	};

	function createFileSystem(ensureActivation: (scheme: string) => Promise<void>): ExtHostConsumerFileSystem {
		return new ExtHostConsumerFileSystem(SingleProxyRPCProtocol(new class extends mock<MainThreadFileSystemShape>() {
			override $ensureActivation(scheme: string): Promise<void> {
				return ensureActivation(scheme);
			}
		}), new ExtHostFileSystemInfo());
	}

	test('activates a scheme of an extension host provider only once', async () => {
		const activations: string[] = [];
		const fileSystem = createFileSystem(async scheme => {
			activations.push(scheme);
		});
		store.add(fileSystem.addFileSystemProvider('test', provider));

		await Promise.all([fileSystem.value.stat(uri), fileSystem.value.stat(uri)]);
		await fileSystem.value.readFile(uri);

		assert.deepStrictEqual(activations, ['test']);
	});

	test('retries a failed activation', async () => {
		const activations: string[] = [];
		const fileSystem = createFileSystem(async scheme => {
			activations.push(scheme);
			if (activations.length === 1) {
				throw new Error('activation failed');
			}
		});
		store.add(fileSystem.addFileSystemProvider('test', provider));

		await assert.rejects(async () => fileSystem.value.stat(uri));
		await fileSystem.value.stat(uri);
		await fileSystem.value.stat(uri);

		assert.deepStrictEqual(activations, ['test', 'test']);
	});

	test('activates again for a new provider registration', async () => {
		const activations: string[] = [];
		const fileSystem = createFileSystem(async scheme => {
			activations.push(scheme);
		});

		const registration = store.add(fileSystem.addFileSystemProvider('test', provider));
		await fileSystem.value.stat(uri);
		registration.dispose();
		store.add(fileSystem.addFileSystemProvider('test', provider));
		await fileSystem.value.stat(uri);
		await fileSystem.value.stat(uri);

		assert.deepStrictEqual(activations, ['test', 'test']);
	});
});
