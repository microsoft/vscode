/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Schemas } from '../../../base/common/network.js';
import { isWeb } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { upcastPartial } from '../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { IFileDialogService } from '../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../platform/files/common/files.js';
import { ISharedWebContentExtractorService } from '../../../platform/webContentExtractor/common/webContentExtractor.js';
import { downloadFile } from '../../browser/download.js';

suite('downloadFile', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const desktopTest = isWeb ? test.skip : test;
	const directory = URI.file('/downloads');
	const target = URI.file('/downloads/saved.png');
	const bytes = new Uint8Array([1, 2, 3]);

	function createServices() {
		const defaultFilePath = sinon.stub().resolves(directory);
		const showSaveDialog = sinon.stub().resolves(target);
		const readFile = sinon.stub().resolves({ value: VSBuffer.wrap(bytes) });
		const writeFile = sinon.stub().resolves();
		const readImage = sinon.stub().resolves(VSBuffer.wrap(bytes));
		return {
			defaultFilePath, showSaveDialog, readFile, writeFile, readImage,
			fileService: upcastPartial<IFileService>({ readFile, writeFile }),
			fileDialogService: upcastPartial<IFileDialogService>({ defaultFilePath, showSaveDialog }),
			webContentExtractorService: upcastPartial<ISharedWebContentExtractorService>({ readImage }),
		};
	}

	for (const [kind, source] of [
		['local resource', URI.file('/images/image.png')],
		['remote resource', URI.parse('vscode-agent-host://remote/opaque/image?version=1')],
		['buffer', VSBuffer.wrap(bytes)],
		['byte array view', new Uint8Array([0, ...bytes, 0]).subarray(1, 4)],
	] as const) {
		desktopTest(`downloads original bytes from a ${kind}`, async () => {
			const services = createServices();

			await downloadFile(source, 'image.png', services.fileService, services.fileDialogService, services.webContentExtractorService);

			assert.deepStrictEqual({
				defaultPathArguments: services.defaultFilePath.args,
				dialogs: services.showSaveDialog.args,
				reads: services.readFile.args,
				webReads: services.readImage.args,
				writes: services.writeFile.args,
			}, {
				defaultPathArguments: [[Schemas.file]],
				dialogs: [{ defaultUri: URI.file('/downloads/image.png'), availableFileSystems: [Schemas.file], title: 'Download' }].map(options => [options]),
				reads: URI.isUri(source) ? [[source]] : [],
				webReads: [],
				writes: [[target, VSBuffer.wrap(bytes)]],
			});
		});
	}

	desktopTest('cancelling does not read or write image data', async () => {
		const services = createServices();
		services.showSaveDialog.resolves(undefined);

		await downloadFile(URI.file('/image.png'), 'image.png', services.fileService, services.fileDialogService, services.webContentExtractorService);

		assert.deepStrictEqual({ reads: services.readFile.args, writes: services.writeFile.args }, { reads: [], writes: [] });
	});

	desktopTest('uses only the suggested filename, not its directory', async () => {
		const services = createServices();

		await downloadFile(bytes, '../image.png', services.fileService, services.fileDialogService, services.webContentExtractorService);

		assert.deepStrictEqual(services.showSaveDialog.firstCall.args[0].defaultUri, URI.file('/downloads/image.png'));
	});

	for (const operation of ['defaultFilePath', 'showSaveDialog', 'readFile', 'writeFile'] as const) {
		desktopTest(`propagates ${operation} failures to the caller`, async () => {
			const services = createServices();
			const error = new Error(`${operation} failed`);
			services[operation].rejects(error);

			await assert.rejects(downloadFile(URI.file('/image.png'), 'image.png', services.fileService, services.fileDialogService, services.webContentExtractorService), error);
		});
	}

	for (const scheme of [Schemas.http, Schemas.https]) {
		desktopTest(`downloads ${scheme} images without a file system provider`, async () => {
			const services = createServices();
			const source = URI.parse(`${scheme}://example.com/image.png`);
			services.readFile.rejects(new Error('ENOPRO'));

			await downloadFile(source, 'image.png', services.fileService, services.fileDialogService, services.webContentExtractorService);

			assert.deepStrictEqual({
				reads: services.readFile.args,
				webReads: services.readImage.args,
				writes: services.writeFile.args,
			}, {
				reads: [],
				webReads: [[source, CancellationToken.None]],
				writes: [[target, VSBuffer.wrap(bytes)]],
			});
		});
	}

	desktopTest('cancelling a URL download does not fetch or write the image', async () => {
		const services = createServices();
		services.showSaveDialog.resolves(undefined);

		await downloadFile(URI.parse('https://example.com/image.png'), 'image.png', services.fileService, services.fileDialogService, services.webContentExtractorService);

		assert.deepStrictEqual({ reads: services.readImage.args, writes: services.writeFile.args }, { reads: [], writes: [] });
	});

	for (const failed of [false, true]) {
		desktopTest(`reports unreadable URL images without writing a file (rejected: ${failed})`, async () => {
			const services = createServices();
			const error = new Error('Request failed');
			if (failed) {
				services.readImage.rejects(error);
			} else {
				services.readImage.resolves(undefined);
			}

			await assert.rejects(
				downloadFile(URI.parse('https://example.com/image.png'), 'image.png', services.fileService, services.fileDialogService, services.webContentExtractorService),
				failed ? error : /Unable to read image data from the URL/,
			);
			assert.deepStrictEqual(services.writeFile.args, []);
		});
	}
});
