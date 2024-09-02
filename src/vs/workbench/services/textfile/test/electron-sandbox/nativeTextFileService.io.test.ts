/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NullLogService } from '../../../../../platform/log/common/log.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { Schemas } from '../../../../../base/common/network.js';
import { ITextFileService } from '../../common/textfiles.js';
import { TextFileEditorModelManager } from '../../common/textFileEditorModelManager.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { IFileService, IStat } from '../../../../../platform/files/common/files.js';
import { URI } from '../../../../../base/common/uri.js';
import { join } from '../../../../../base/common/path.js';
import { UTF16le, detectEncodingByBOMFromBuffer, UTF8_with_bom, UTF16be, toCanonicalName } from '../../common/encoding.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import files from '../common/fixtures/files.js';
import createSuite from '../common/textFileService.io.test.js';
import { IWorkingCopyFileService, WorkingCopyFileService } from '../../../workingCopy/common/workingCopyFileService.js';
import { WorkingCopyService } from '../../../workingCopy/common/workingCopyService.js';
import { UriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentityService.js';
import { TestInMemoryFileSystemProvider } from '../../../../test/browser/workbenchTestServices.js';
import { TestNativeTextFileServiceWithEncodingOverrides, workbenchInstantiationService } from '../../../../test/electron-sandbox/workbenchTestServices.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

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
