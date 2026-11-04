/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DataTransfers } from '../../../../../base/browser/dnd.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isWeb } from '../../../../../base/common/platform.js';
import { joinPath } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/virtualScheduling/index.js';
import { ResourceFileEdit } from '../../../../../editor/browser/services/bulkEditService.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ByteSize } from '../../../../../platform/files/common/files.js';
import { IProgress, IProgressOptions, IProgressService, IProgressStep, ProgressLocation } from '../../../../../platform/progress/common/progress.js';
import { IHostService } from '../../../../services/host/browser/host.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { NullFilesConfigurationService, TestFileService } from '../../../../test/common/workbenchTestServices.js';
import { BrowserFileUpload, ExternalFileImport, FileDownload } from '../../browser/fileImportExport.js';
import { IExplorerService } from '../../browser/files.js';
import { ExplorerItem } from '../../common/explorerModel.js';
import { UndoConfirmLevel, VIEW_ID } from '../../common/files.js';

class TestFileDownload extends FileDownload {
	// Chromium always selects the web branch of download(). Exercise the native
	// implementation here and the public entry point when running under Electron.
	override doDownloadNative(source: Parameters<FileDownload['download']>[0][number], progress: IProgress<IProgressStep>, cts: CancellationTokenSource): Promise<void> {
		return super.doDownloadNative(source, progress, cts);
	}
}

suite('Files - Import and Export Progress', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const remote = URI.from({ scheme: Schemas.vscodeRemote, authority: 'test', path: '/folder' });
	const destination = URI.file('/downloads/folder');
	let instantiation: ReturnType<typeof workbenchInstantiationService>;
	let fileService: TestFileService;
	let configuration: TestConfigurationService;
	let reports: IProgressStep[];
	let locations: IProgressOptions[];
	let edits: ResourceFileEdit[];
	let editOptions: Parameters<IExplorerService['applyBulkEdit']>[1];
	let copy: () => Promise<void>;
	let saveDestination: URI | undefined;

	setup(() => {
		reports = [];
		locations = [];
		edits = [];
		copy = async () => { };
		saveDestination = destination;
		fileService = store.add(new TestFileService());
		configuration = new TestConfigurationService({ explorer: { confirmUndo: UndoConfirmLevel.Default, autoOpenDroppedFile: false } });
		instantiation = workbenchInstantiationService({ fileService: () => fileService, configurationService: () => configuration }, store);
		instantiation.stub(IProgressService, new class extends mock<IProgressService>() {
			override withProgress<R>(options: IProgressOptions, task: (progress: IProgress<IProgressStep>) => Promise<R>): Promise<R> {
				locations.push(options);
				const result = task({ report: step => reports.push(step) });
				// The files view shares the outer promise and does not consume errors.
				if (options.location === VIEW_ID) {
					result.catch(() => { });
				}
				return result;
			}
		});
		instantiation.stub(IExplorerService, new class extends mock<IExplorerService>() {
			override async applyBulkEdit(resourceEdits: ResourceFileEdit[], options: Parameters<IExplorerService['applyBulkEdit']>[1]): Promise<void> {
				edits = resourceEdits;
				editOptions = options;
				await copy();
			}
		});
		instantiation.stub(IFileDialogService, new class extends mock<IFileDialogService>() {
			override async defaultFilePath(): Promise<URI> { return URI.file('/downloads'); }
			override async defaultFolderPath(): Promise<URI> { return URI.file('/downloads'); }
			override async showSaveDialog(): Promise<URI | undefined> { return saveDestination; }
		});
		instantiation.stub(IHostService, new class extends mock<IHostService>() {
			override async focus(): Promise<void> { }
		});
	});

	function reportBytes(name: string, bytesWritten: number): void {
		assert.ok(editOptions.fileCopyProgress);
		editOptions.fileCopyProgress.report({ source: joinPath(remote, name), target: joinPath(destination, name), bytesWritten });
	}

	async function download(): Promise<void> {
		const service = instantiation.createInstance(TestFileDownload);
		const source = { resource: remote, name: 'folder', isDirectory: true };
		if (isWeb) {
			await service.doDownloadNative(source, { report: step => reports.push(step) }, store.add(new CancellationTokenSource()));
		} else {
			await service.download([source]);
			assert.deepStrictEqual(locations.map(({ location, cancellable }) => ({ location, cancellable })), [
				{ location: ProgressLocation.Notification, cancellable: false },
				{ location: VIEW_ID, cancellable: undefined }
			]);
		}
	}

	async function upload(scheme = Schemas.vscodeRemote): Promise<void> {
		const parent = new ExplorerItem(remote.with({ scheme }), fileService, configuration, NullFilesConfigurationService, undefined, true);
		const target = new ExplorerItem(joinPath(parent.resource, 'target'), fileService, configuration, NullFilesConfigurationService, parent, true);
		const dataTransfer = new DataTransfer();
		dataTransfer.setData(DataTransfers.RESOURCES, JSON.stringify([URI.file('/source/file.txt').toString()]));
		await instantiation.createInstance(ExternalFileImport).import(target, new DragEvent('drop', { dataTransfer }), mainWindow);
	}

	test('native download accumulates directory children, throttles and flushes final bytes', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		copy = async () => {
			reportBytes('first.txt', ByteSize.KB);
			reportBytes('second.txt', ByteSize.KB);
			assert.deepStrictEqual(reports, [{ message: 'folder' }]);
			await timeout(1000);
			assert.strictEqual(reports.length, 2);
			assert.match(String(reports[1].message), /second\.txt \(2\.00KB downloaded, .*\/s\)/);
			reportBytes('second.txt', ByteSize.KB);
		};
		await download();
		assert.match(String(reports[2].message), /second\.txt \(3\.00KB downloaded, 3\.00KB\/s\)/);
		assert.deepStrictEqual(edits.map(edit => ({ source: edit.oldResource?.toString(), target: edit.newResource?.toString(), options: edit.options })), [
			{ source: remote.toString(), target: destination.toString(), options: { overwrite: true, copy: true } }
		]);
		assert.strictEqual(editOptions.undoLabel, 'Download folder');
		await timeout(1500);
		assert.strictEqual(reports.length, 3);
	}));

	test('native download flushes a same-tick transfer with finite speed', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		copy = async () => reportBytes('file.txt', 1);
		await download();
		assert.deepStrictEqual(reports, [{ message: 'folder' }, { message: 'file.txt (1B downloaded, 1000B/s)' }]);
	}));

	test('native download disposes pending progress on failure', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		copy = async () => {
			reportBytes('file.txt', 1);
			throw new Error('copy failed');
		};
		await assert.rejects(download(), /copy failed/);
		await timeout(1500);
		assert.deepStrictEqual(reports, [{ message: 'folder' }]);
	}));

	test('canceling native save dialog does not copy', async () => {
		saveDestination = undefined;
		await download();
		assert.deepStrictEqual(edits, []);
	});

	test('external import reports aggregate bytes in a notification and preserves undo', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		copy = async () => {
			reportBytes('first.txt', ByteSize.KB);
			reportBytes('second.txt', ByteSize.KB);
			assert.deepStrictEqual(reports, []);
			await timeout(1000);
			reportBytes('second.txt', ByteSize.KB);
		};
		await upload();
		assert.deepStrictEqual(locations.map(({ location, cancellable }) => ({ location, cancellable })), [
			{ location: ProgressLocation.Notification, cancellable: false },
			{ location: VIEW_ID, cancellable: undefined }
		]);
		assert.strictEqual(reports.length, 2);
		assert.match(String(reports[1].message), /second\.txt \(3\.00KB copied, 3\.00KB\/s\)/);
		assert.deepStrictEqual({ undoLabel: editOptions.undoLabel, confirmBeforeUndo: editOptions.confirmBeforeUndo, options: edits[0].options }, {
			undoLabel: 'Import file.txt', confirmBeforeUndo: true, options: { overwrite: true, copy: true }
		});
		await timeout(1500);
		assert.strictEqual(reports.length, 2);
	}));

	test('external import disposes pending progress on failure', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		copy = async () => {
			reportBytes('file.txt', 1);
			throw new Error('copy failed');
		};
		await assert.rejects(upload(), /copy failed/);
		await timeout(1500);
		assert.deepStrictEqual(reports, []);
	}));

	test('local external import retains window progress', async () => {
		await upload(Schemas.file);
		assert.strictEqual(locations[0].location, ProgressLocation.Window);
	});

	test('browser upload uses notification progress', async () => {
		const target = new ExplorerItem(remote, fileService, configuration, NullFilesConfigurationService, undefined, true);
		await instantiation.createInstance(BrowserFileUpload).upload(target, new DataTransfer().files);
		assert.strictEqual(locations[0].location, ProgressLocation.Notification);
	});

	test('public browser download uses notification progress', async () => {
		if (!isWeb) {
			return;
		}
		await instantiation.createInstance(FileDownload).download([]);
		assert.deepStrictEqual({ location: locations[0].location, cancellable: locations[0].cancellable }, { location: ProgressLocation.Notification, cancellable: true });
	});
});