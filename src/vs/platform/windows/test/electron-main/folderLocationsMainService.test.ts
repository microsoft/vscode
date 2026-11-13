/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { Schemas } from '../../../../base/common/network.js';
import { extUriBiasedIgnorePathCase } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { createFileSystemProviderError, FileSystemProviderErrorCode, IStat } from '../../../files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { FolderLocationsMainService } from '../../electron-main/folderLocationsMainService.js';

class PermissionDeniedFileSystemProvider extends InMemoryFileSystemProvider {
	override async stat(resource: URI): Promise<IStat> {
		throw createFileSystemProviderError('denied', FileSystemProviderErrorCode.NoPermissions);
	}
}

suite('FolderLocationsMainService', () => {

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	async function create(options?: { initial?: Record<string, unknown>; provider?: InMemoryFileSystemProvider }) {
		const items = new Map<string, unknown>();
		if (options?.initial) {
			items.set('folderLocations', options.initial);
		}
		const state = {
			getItem: <T>(key: string) => items.get(key) as T | undefined,
			setItem: (key: string, data: object | string | number | boolean | undefined | null) => { items.set(key, data); }
		};

		const warnings: string[] = [];
		const logService = { warn: (message: string) => { warnings.push(message); } } as unknown as ILogService;
		const fileService = ds.add(new FileService(new NullLogService()));
		const provider = ds.add(options?.provider ?? new InMemoryFileSystemProvider());
		ds.add(fileService.registerProvider(Schemas.file, provider));
		await provider.mkdir(URI.file('/work'));
		await provider.mkdir(URI.file('/work/repo.wt'));
		await provider.mkdir(URI.file('/work/repo.wt/feature'));
		await provider.writeFile(URI.file('/work/repo.wt/file'), VSBuffer.fromString('').buffer, { create: true, overwrite: true, unlock: false, atomic: false });

		return { service: new FolderLocationsMainService(state as never, fileService, logService), items, warnings };
	}

	const workspace = URI.file('/work/repo');
	const location = { uri: 'file:///work/repo.wt/feature', label: 'feature', providerId: 'p' };

	test('a remembered location is returned for a fresh open of its workspace only', async () => {
		const { service } = await create();
		service.updateFolderLocation(workspace, location);

		assert.deepStrictEqual([service.getFolderLocation(workspace), service.getFolderLocation(URI.file('/work/repo.wt/feature')), service.getFolderLocation(URI.file('/work/other'))], [location, undefined, undefined]);
	});

	test('returning to the workspace clears the memory', async () => {
		const { service } = await create();
		service.updateFolderLocation(workspace, location);
		service.updateFolderLocation(workspace, undefined);

		assert.strictEqual(service.getFolderLocation(workspace), undefined);
	});

	test('case variants of the workspace share one entry on case-insensitive paths', async () => {
		const { service, items } = await create();
		const variant = URI.file('/Work/Repo');
		const sameEntry = extUriBiasedIgnorePathCase.getComparisonKey(workspace) === extUriBiasedIgnorePathCase.getComparisonKey(variant);
		service.updateFolderLocation(workspace, location);
		const restored = service.getFolderLocation(variant);
		service.updateFolderLocation(variant, undefined);

		assert.deepStrictEqual([restored, service.getFolderLocation(workspace), Object.keys(items.get('folderLocations') as object).length], sameEntry ? [location, undefined, 0] : [undefined, location, 1]);
	});

	test('malformed entries are ignored', async () => {
		const { service } = await create({ initial: { [extUriBiasedIgnorePathCase.getComparisonKey(workspace)]: { uri: 1 } } });

		assert.strictEqual(service.getFolderLocation(workspace), undefined);
	});

	test('a malformed remembered uri is ignored', async () => {
		const { service } = await create({ initial: { [extUriBiasedIgnorePathCase.getComparisonKey(workspace)]: { ...location, uri: 'file:////work/alt' } } });

		assert.strictEqual(service.getFolderLocation(workspace), undefined);
	});

	test('the oldest entries age out', async () => {
		const { service } = await create();
		for (let i = 0; i < 105; i++) {
			service.updateFolderLocation(URI.file(`/work/repo${i}`), location);
		}

		assert.deepStrictEqual([service.getFolderLocation(URI.file('/work/repo0')), service.getFolderLocation(URI.file('/work/repo104'))], [undefined, location]);
	});

	suite('validateFolderLocation', () => {

		async function validate(options: Parameters<typeof create>[0], candidate: typeof location | undefined) {
			const { service, warnings } = await create(options);
			service.updateFolderLocation(workspace, location);
			return { result: await service.validateFolderLocation(workspace, candidate), remembered: service.getFolderLocation(workspace), warnings: warnings.length };
		}

		test('an existing directory is kept and remembered', async () => {
			assert.deepStrictEqual(await validate(undefined, location), { result: { folderLocation: location }, remembered: location, warnings: 0 });
		});

		test('a missing location opens at the workspace, is reported and forgotten', async () => {
			assert.deepStrictEqual(await validate(undefined, { ...location, uri: 'file:///work/repo.wt/gone' }), { result: { folderLocationMissing: { label: 'feature' } }, remembered: undefined, warnings: 0 });
		});

		test('a file is a missing location', async () => {
			assert.deepStrictEqual(await validate(undefined, { ...location, uri: 'file:///work/repo.wt/file' }), { result: { folderLocationMissing: { label: 'feature' } }, remembered: undefined, warnings: 0 });
		});

		test('a remote location is not started at and is forgotten', async () => {
			assert.deepStrictEqual(await validate(undefined, { ...location, uri: 'vscode-remote://host/work/repo.wt/feature' }), { result: { folderLocationMissing: { label: 'feature' } }, remembered: undefined, warnings: 0 });
		});

		test('a malformed location is a missing location', async () => {
			assert.deepStrictEqual(await validate(undefined, { ...location, uri: 'file:////work/alt' }), { result: { folderLocationMissing: { label: 'feature' } }, remembered: undefined, warnings: 0 });
		});

		test('without a candidate nothing is validated or forgotten', async () => {
			assert.deepStrictEqual(await validate(undefined, undefined), { result: {}, remembered: location, warnings: 0 });
		});

		test('a location that cannot be determined is kept, remembered and logged', async () => {
			assert.deepStrictEqual(await validate({ provider: new PermissionDeniedFileSystemProvider() }, location), { result: { folderLocation: location }, remembered: location, warnings: 1 });
		});

		test('open, reload and restore resolve the same remembered location, until it is gone', async () => {
			const { service } = await create();
			service.updateFolderLocation(workspace, location);
			const resolve = () => service.validateFolderLocation(workspace, service.getFolderLocation(workspace));

			const starts = [await resolve(), await resolve()];
			service.updateFolderLocation(workspace, { ...location, uri: 'file:///work/repo.wt/gone' });
			const afterDeletion = [await resolve(), await resolve()];

			assert.deepStrictEqual({ starts, afterDeletion }, {
				starts: [{ folderLocation: location }, { folderLocation: location }],
				afterDeletion: [{ folderLocationMissing: { label: 'feature' } }, {}]
			});
		});
	});
});
