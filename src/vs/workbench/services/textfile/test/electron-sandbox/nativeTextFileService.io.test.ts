/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NullLogService } from 'vs/platform/log/common/log';
import { FileService } from 'vs/platform/files/common/fileService';
import { Schemas } from 'vs/base/common/network';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { TextFileEditorModelManager } from 'vs/workbench/services/textfile/common/textFileEditorModelManager';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { IFileService, IStat } from 'vs/platform/files/common/files';
import { URI } from 'vs/base/common/uri';
import { join } from 'vs/base/common/path';
import { UTF16le, detectEncodingByBOMFromBuffer, UTF8_with_bom, UTF16be, toCanonicalName } from 'vs/workbench/services/textfile/common/encoding';
import { VSBuffer } from 'vs/base/common/buffer';
import files from 'vs/workbench/services/textfile/test/common/fixtures/files';
import createSuite from 'vs/workbench/services/textfile/test/common/textFileService.io.test';
import { IWorkingCopyFileService, WorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { WorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { TestInMemoryFileSystemProvider } from 'vs/workbench/test/browser/workbenchTestServices';
import { TestNativeTextFileServiceWithEncodingOverrides, workbenchInstantiationService } from 'vs/workbench/test/electron-sandbox/workbenchTestServices';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';

suite('Files - NativeTextFileService i/o', function () {
	const disposables = new DisposableStore();

	let service: ITextFileService;
	let fileProvider: TestInMemoryFileSystemProvider;
	const testDir = 'test';

	createSuite({
		setup: async () => {
			const instantiationService = workbenchInstantiationService(undefined, disposables);

			const logService = new NullLogService();
			const fileService = disposables.add(new FileService(logService));

			fileProvider = disposables.add(new TestInMemoryFileSystemProvider());
			disposables.add(fileService.registerProvider(Schemas.file, fileProvider));

			const collection = new ServiceCollection();
			collection.set(IFileService, fileService);
			collection.set(IWorkingCopyFileService, disposables.add(new WorkingCopyFileService(fileService, disposables.add(new WorkingCopyService()), instantiationService, disposables.add(new UriIdentityService(fileService)))));

			service = disposables.add(instantiationService.createChild(collection).createInstance(TestNativeTextFileServiceWithEncodingOverrides));
			disposables.add(<TextFileEditorModelManager>service.files);

			await fileProvider.mkdir(URI.file(testDir));
			for (const fileName in files) {
				await fileProvider.writeFile(
					URI.file(join(testDir, fileName)),
					files[fileName],
					{ create: true, overwrite: false, unlock: false, atomic: false }
				);
			}

			return { service, testDir };
		},

		teardown: async () => {
			disposables.clear();
		},

		exists,
		stat,
		readFile,
		detectEncodingByBOM
	});

	async function exists(fsPath: string): Promise<boolean> {
		try {
			await fileProvider.readFile(URI.file(fsPath));
			return true;
		}
		catch (e) {
			return false;
		}
	}

	async function readFile(fsPath: string): Promise<VSBuffer>;
	async function readFile(fsPath: string, encoding: string): Promise<string>;
	async function readFile(fsPath: string, encoding?: string): Promise<VSBuffer | string> {
		const file = await fileProvider.readFile(URI.file(fsPath));

		if (!encoding) {
			return VSBuffer.wrap(file);
		}

		return new TextDecoder(toCanonicalName(encoding)).decode(file);
	}

	async function stat(fsPath: string): Promise<IStat> {
		return fileProvider.stat(URI.file(fsPath));
	}

	async function detectEncodingByBOM(fsPath: string): Promise<typeof UTF16be | typeof UTF16le | typeof UTF8_with_bom | null> {
		try {
			const buffer = await readFile(fsPath);

			return detectEncodingByBOMFromBuffer(buffer.slice(0, 3), 3);
		} catch (error) {
			return null; // ignore errors (like file not found)
		}
	}

	ensureNoDisposablesAreLeakedInTestSuite();
});
