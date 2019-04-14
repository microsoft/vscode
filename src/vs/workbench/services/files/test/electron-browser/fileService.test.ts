/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import * as fs from 'fs';
import * as path from 'vs/base/common/path';
import * as os from 'os';
import * as assert from 'assert';
import { LegacyFileService } from 'vs/workbench/services/files/node/fileService';
import { FileOperationResult, FileOperationError } from 'vs/platform/files/common/files';
import { URI as uri } from 'vs/base/common/uri';
import * as uuid from 'vs/base/common/uuid';
import * as pfs from 'vs/base/node/pfs';
import * as encodingLib from 'vs/base/node/encoding';
import { TestEnvironmentService, TestContextService, TestTextResourceConfigurationService } from 'vs/workbench/test/workbenchTestServices';
import { getRandomTestPath } from 'vs/base/test/node/testUtils';
import { Workspace, toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { IEncodingOverride } from 'vs/workbench/services/files/node/encoding';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { FileService2 } from 'vs/workbench/services/files2/common/fileService2';
import { NullLogService } from 'vs/platform/log/common/log';
import { Schemas } from 'vs/base/common/network';
import { DiskFileSystemProvider } from 'vs/workbench/services/files2/node/diskFileSystemProvider';

suite('LegacyFileService', () => {
	let service: LegacyFileService;
	const parentDir = getRandomTestPath(os.tmpdir(), 'vsctests', 'fileservice');
	let testDir: string;

	setup(function () {
		const id = uuid.generateUuid();
		testDir = path.join(parentDir, id);
		const sourceDir = getPathFromAmdModule(require, './fixtures/service');

		const fileService = new FileService2(new NullLogService());
		fileService.registerProvider(Schemas.file, new DiskFileSystemProvider(new NullLogService()));

		return pfs.copy(sourceDir, testDir).then(() => {
			service = new LegacyFileService(
				fileService,
				new TestContextService(new Workspace(testDir, toWorkspaceFolders([{ path: testDir }]))),
				TestEnvironmentService,
				new TestTextResourceConfigurationService(),
			);
		});
	});

	teardown(() => {
		service.dispose();
		return pfs.rimraf(parentDir, pfs.RimRafMode.MOVE);
	});

	test('resolveContent - FILE_IS_BINARY', function () {
		const resource = uri.file(path.join(testDir, 'binary.txt'));

		return service.resolveContent(resource, { acceptTextOnly: true }).then(undefined, (e: FileOperationError) => {
			assert.equal(e.fileOperationResult, FileOperationResult.FILE_IS_BINARY);

			return service.resolveContent(uri.file(path.join(testDir, 'small.txt')), { acceptTextOnly: true }).then(r => {
				assert.equal(r.name, 'small.txt');
			});
		});
	});

	test('resolveContent - encoding picked up', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));
		const encoding = 'windows1252';

		return service.resolveContent(resource, { encoding: encoding }).then(c => {
			assert.equal(c.encoding, encoding);
		});
	});

	test('resolveContent - user overrides BOM', function () {
		const resource = uri.file(path.join(testDir, 'some_utf16le.css'));

		return service.resolveContent(resource, { encoding: 'windows1252' }).then(c => {
			assert.equal(c.encoding, 'windows1252');
		});
	});

	test('resolveContent - BOM removed', function () {
		const resource = uri.file(path.join(testDir, 'some_utf8_bom.txt'));

		return service.resolveContent(resource).then(c => {
			assert.equal(encodingLib.detectEncodingByBOMFromBuffer(Buffer.from(c.value), 512), null);
		});
	});

	test('resolveContent - invalid encoding', function () {
		const resource = uri.file(path.join(testDir, 'index.html'));

		return service.resolveContent(resource, { encoding: 'superduper' }).then(c => {
			assert.equal(c.encoding, 'utf8');
		});
	});

	test('resolveContent - options - encoding override (parent)', function () {

		// setup
		const _id = uuid.generateUuid();
		const _testDir = path.join(parentDir, _id);
		const _sourceDir = getPathFromAmdModule(require, './fixtures/service');

		return pfs.copy(_sourceDir, _testDir).then(() => {
			const encodingOverride: IEncodingOverride[] = [];
			encodingOverride.push({
				parent: uri.file(path.join(testDir, 'deep')),
				encoding: 'utf16le'
			});

			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration('files', { encoding: 'windows1252' });

			const textResourceConfigurationService = new TestTextResourceConfigurationService(configurationService);

			const fileService = new FileService2(new NullLogService());
			fileService.registerProvider(Schemas.file, new DiskFileSystemProvider(new NullLogService()));

			const _service = new LegacyFileService(
				fileService,
				new TestContextService(new Workspace(_testDir, toWorkspaceFolders([{ path: _testDir }]))),
				TestEnvironmentService,
				textResourceConfigurationService,
				{ encodingOverride });

			return _service.resolveContent(uri.file(path.join(testDir, 'index.html'))).then(c => {
				assert.equal(c.encoding, 'windows1252');

				return _service.resolveContent(uri.file(path.join(testDir, 'deep', 'conway.js'))).then(c => {
					assert.equal(c.encoding, 'utf16le');

					// teardown
					_service.dispose();
				});
			});
		});
	});

	test('resolveContent - options - encoding override (extension)', function () {

		// setup
		const _id = uuid.generateUuid();
		const _testDir = path.join(parentDir, _id);
		const _sourceDir = getPathFromAmdModule(require, './fixtures/service');

		return pfs.copy(_sourceDir, _testDir).then(() => {
			const encodingOverride: IEncodingOverride[] = [];
			encodingOverride.push({
				extension: 'js',
				encoding: 'utf16le'
			});

			const configurationService = new TestConfigurationService();
			configurationService.setUserConfiguration('files', { encoding: 'windows1252' });

			const textResourceConfigurationService = new TestTextResourceConfigurationService(configurationService);

			const fileService = new FileService2(new NullLogService());
			fileService.registerProvider(Schemas.file, new DiskFileSystemProvider(new NullLogService()));

			const _service = new LegacyFileService(
				fileService,
				new TestContextService(new Workspace(_testDir, toWorkspaceFolders([{ path: _testDir }]))),
				TestEnvironmentService,
				textResourceConfigurationService,
				{ encodingOverride });

			return _service.resolveContent(uri.file(path.join(testDir, 'index.html'))).then(c => {
				assert.equal(c.encoding, 'windows1252');

				return _service.resolveContent(uri.file(path.join(testDir, 'deep', 'conway.js'))).then(c => {
					assert.equal(c.encoding, 'utf16le');

					// teardown
					_service.dispose();
				});
			});
		});
	});
});
