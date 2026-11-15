/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../base/common/network.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ISaveDialogOptions } from '../../../../../platform/dialogs/common/dialogs.js';
import { IFileOpenOptions, IFileService, IStat } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IProgress, IProgressCompositeOptions, IProgressDialogOptions, IProgressNotificationOptions, IProgressOptions, IProgressService, IProgressStep, IProgressWindowOptions, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileDownload } from '../../browser/fileImportExport.js';
import { ExplorerItem } from '../../common/explorerModel.js';
import { NullFilesConfigurationService } from '../../../../test/common/workbenchTestServices.js';
import { TestFileDialogService, TestPathService } from '../../../../test/browser/workbenchTestServices.js';

class TestTransferProgressService implements IProgressService {

	declare readonly _serviceBrand: undefined;

	readonly steps: IProgressStep[] = [];

	private onDidCancel: ((choice?: number) => void) | undefined;

	cancel(): void {
		this.onDidCancel?.();
	}

	withProgress(
		options: IProgressOptions | IProgressDialogOptions | IProgressWindowOptions | IProgressNotificationOptions | IProgressCompositeOptions,
		task: (progress: IProgress<IProgressStep>) => Promise<any>,
		onDidCancel?: ((choice?: number | undefined) => void) | undefined
	): Promise<any> {
		if (options.location === ProgressLocation.Window) {
			this.onDidCancel = onDidCancel;

			return task({ report: step => this.steps.push(step) });
		}

		return task({ report: () => { } });
	}
}

class TestDownloadFileDialogService extends TestFileDialogService {

	private saveDialogResults: (URI | undefined)[] = [];

	setSaveDialogResult(...results: (URI | undefined)[]): void {
		this.saveDialogResults = results;
	}

	override showSaveDialog(_options: ISaveDialogOptions): Promise<URI | undefined> {
		return Promise.resolve(this.saveDialogResults.length > 1 ? this.saveDialogResults.shift() : this.saveDialogResults[0]);
	}
}

class BlockingInMemoryFileSystemProvider extends InMemoryFileSystemProvider {

	openBarrier: DeferredPromise<void> | undefined;
	readonly onOpen = new DeferredPromise<void>();

	statBarrier: DeferredPromise<void> | undefined;
	readonly onStat = new DeferredPromise<void>();

	override async open(resource: URI, opts: IFileOpenOptions): Promise<number> {
		if (!this.onOpen.isSettled) {
			this.onOpen.complete();
		}

		await this.openBarrier?.p;

		return super.open(resource, opts);
	}

	override async stat(resource: URI): Promise<IStat> {
		if (this.statBarrier) {
			if (!this.onStat.isSettled) {
				this.onStat.complete();
			}

			await this.statBarrier.p;
		}

		return super.stat(resource);
	}
}

suite('Files - FileDownload', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const sourceScheme = 'vscodedownloadtest';

	let fileService: IFileService;
	let sourceProvider: BlockingInMemoryFileSystemProvider;
	let progressService: TestTransferProgressService;
	let dialogService: TestDownloadFileDialogService;
	let download: FileDownload;

	setup(async () => {
		fileService = disposables.add(new FileService(new NullLogService()));

		sourceProvider = disposables.add(new BlockingInMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(sourceScheme, sourceProvider));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));

		progressService = new TestTransferProgressService();
		dialogService = new TestDownloadFileDialogService(new TestPathService());
		download = new FileDownload(fileService, progressService, new NullLogService(), dialogService, disposables.add(new InMemoryStorageService()));

		await fileService.createFolder(URI.from({ scheme: sourceScheme, path: '/folder/sub' }));
		await fileService.writeFile(URI.from({ scheme: sourceScheme, path: '/folder/a.txt' }), VSBuffer.fromString('a'.repeat(100)));
		await fileService.writeFile(URI.from({ scheme: sourceScheme, path: '/folder/b.txt' }), VSBuffer.fromString('b'.repeat(200)));
		await fileService.writeFile(URI.from({ scheme: sourceScheme, path: '/folder/sub/c.txt' }), VSBuffer.fromString('c'.repeat(300)));
	});

	function createExplorerItem(resource: URI, isDirectory: boolean): ExplorerItem {
		return new ExplorerItem(resource, fileService, new TestConfigurationService(), NullFilesConfigurationService, undefined, isDirectory);
	}

	test('downloads a folder and reports overall progress', async () => {
		const destination = URI.file('/downloads/folder');
		dialogService.setSaveDialogResult(destination);

		await download.download([createExplorerItem(URI.from({ scheme: sourceScheme, path: '/folder' }), true)]);

		// All files have been copied to the destination
		const stat = await fileService.resolve(destination);
		assert.deepStrictEqual(stat.children?.map(child => child.name).sort(), ['a.txt', 'b.txt', 'sub']);
		assert.strictEqual((await fileService.readFile(joinPath(destination, 'sub/c.txt'))).value.toString(), 'c'.repeat(300));

		// Progress was reported with file counts and overall increments
		const lastStep = progressService.steps[progressService.steps.length - 1];
		assert.ok(typeof lastStep.message === 'string' && lastStep.message.startsWith('3 of 3 files'), `Unexpected last progress message: ${lastStep.message}`);
		assert.strictEqual(progressService.steps.reduce((sum, step) => sum + (step.increment ?? 0), 0), 100);
	});

	test('downloads a single file', async () => {
		const destination = URI.file('/downloads/a.txt');
		dialogService.setSaveDialogResult(destination);

		await download.download([createExplorerItem(URI.from({ scheme: sourceScheme, path: '/folder/a.txt' }), false)]);

		assert.strictEqual((await fileService.readFile(destination)).value.toString(), 'a'.repeat(100));

		const lastStep = progressService.steps[progressService.steps.length - 1];
		assert.strictEqual(lastStep.message, 'a.txt');
	});

	test('downloads multiple sources with one aggregated progress', async () => {
		const destinationA = URI.file('/downloads/a.txt');
		const destinationB = URI.file('/downloads/b.txt');
		dialogService.setSaveDialogResult(destinationA, destinationB);

		await download.download([
			createExplorerItem(URI.from({ scheme: sourceScheme, path: '/folder/a.txt' }), false),
			createExplorerItem(URI.from({ scheme: sourceScheme, path: '/folder/b.txt' }), false)
		]);

		assert.strictEqual((await fileService.readFile(destinationA)).value.toString(), 'a'.repeat(100));
		assert.strictEqual((await fileService.readFile(destinationB)).value.toString(), 'b'.repeat(200));

		// Increments accumulate to exactly 100 across the whole selection,
		// not per source
		assert.strictEqual(progressService.steps.reduce((sum, step) => sum + (step.increment ?? 0), 0), 100);
	});

	test('cancelling a download stops the copy and cleans up the destination', async () => {
		const destination = URI.file('/downloads/folder');
		dialogService.setSaveDialogResult(destination);

		sourceProvider.openBarrier = new DeferredPromise<void>();

		const downloadPromise = download.download([createExplorerItem(URI.from({ scheme: sourceScheme, path: '/folder' }), true)]);

		// Wait until the copy is underway, then cancel and unblock
		await sourceProvider.onOpen.p;
		progressService.cancel();
		sourceProvider.openBarrier.complete();

		await downloadPromise;

		assert.strictEqual(await fileService.exists(destination), false);
	});

	test('cancelling a download before any content was transferred keeps an existing destination', async () => {
		const destination = URI.file('/downloads/a.txt');
		await fileService.writeFile(destination, VSBuffer.fromString('precious'));
		dialogService.setSaveDialogResult(destination);

		sourceProvider.statBarrier = new DeferredPromise<void>();

		const downloadPromise = download.download([createExplorerItem(URI.from({ scheme: sourceScheme, path: '/folder/a.txt' }), false)]);

		// Cancel while the download is still resolving the source
		// and has not made any changes to the destination yet
		await sourceProvider.onStat.p;
		progressService.cancel();
		sourceProvider.statBarrier.complete();

		await downloadPromise;

		assert.strictEqual((await fileService.readFile(destination)).value.toString(), 'precious');
	});
});
