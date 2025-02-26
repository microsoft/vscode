/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { CustomEditorLabelService } from '../../common/customEditorLabelService.js';
import { ITestInstantiationService, TestServiceAccessor, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('Custom Editor Label Service', () => {

	const disposables = new DisposableStore();

	setup(() => { });

	teardown(async () => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	async function createCustomLabelService(instantiationService: ITestInstantiationService = workbenchInstantiationService(undefined, disposables)): Promise<[CustomEditorLabelService, TestConfigurationService, TestServiceAccessor]> {
		const configService = new TestConfigurationService();
		await configService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_ENABLED, true);
		instantiationService.stub(IConfigurationService, configService);

		const customLabelService = disposables.add(instantiationService.createInstance(CustomEditorLabelService));
		return [customLabelService, configService, instantiationService.createInstance(TestServiceAccessor)];
	}

	async function updatePattern(configService: TestConfigurationService, value: any): Promise<void> {
		await configService.setUserConfiguration(CustomEditorLabelService.SETTING_ID_PATTERNS, value);
		configService.onDidChangeConfigurationEmitter.fire({
			affectsConfiguration: (key: string) => key === CustomEditorLabelService.SETTING_ID_PATTERNS,
			source: ConfigurationTarget.USER,
			affectedKeys: new Set(CustomEditorLabelService.SETTING_ID_PATTERNS),
			change: {
				keys: [],
				overrides: []
			}
		});
	}

	test('Custom Labels: filename.extname', async () => {
		const [customLabelService, configService] = await createCustomLabelService();

		await updatePattern(configService, {
			'**': '${filename}.${extname}'
		});

		const filenames = [
			'file.txt',
			'file.txt1.tx2',
			'.file.txt',
		];

		for (const filename of filenames) {
			const label = customLabelService.getName(URI.file(filename));
			assert.strictEqual(label, filename);
		}

		let label = customLabelService.getName(URI.file('file'));
		assert.strictEqual(label, 'file.${extname}');

		label = customLabelService.getName(URI.file('.file'));
		assert.strictEqual(label, '.file.${extname}');
	});

	test('Custom Labels: filename', async () => {
		const [customLabelService, configService] = await createCustomLabelService();

		await updatePattern(configService, {
			'**': '${filename}',
		});

		assert.strictEqual(customLabelService.getName(URI.file('file')), 'file');
		assert.strictEqual(customLabelService.getName(URI.file('file.txt')), 'file');
		assert.strictEqual(customLabelService.getName(URI.file('file.txt1.txt2')), 'file');
		assert.strictEqual(customLabelService.getName(URI.file('folder/file.txt1.txt2')), 'file');

		assert.strictEqual(customLabelService.getName(URI.file('.file')), '.file');
		assert.strictEqual(customLabelService.getName(URI.file('.file.txt')), '.file');
		assert.strictEqual(customLabelService.getName(URI.file('.file.txt1.txt2')), '.file');
		assert.strictEqual(customLabelService.getName(URI.file('folder/.file.txt1.txt2')), '.file');
	});

	test('Custom Labels: extname(N)', async () => {
		const [customLabelService, configService] = await createCustomLabelService();

		await updatePattern(configService, {
			'**/ext/**': '${extname}',
			'**/ext0/**': '${extname(0)}',
			'**/ext1/**': '${extname(1)}',
			'**/ext2/**': '${extname(2)}',
			'**/extMinus1/**': '${extname(-1)}',
			'**/extMinus2/**': '${extname(-2)}',
		});

		interface IExt {
			extname?: string;
			ext0?: string;
			ext1?: string;
			ext2?: string;
			extMinus1?: string;
			extMinus2?: string;
		}

		function assertExtname(filename: string, ext: IExt): void {
			assert.strictEqual(customLabelService.getName(URI.file(`test/ext/${filename}`)), ext.extname ?? '${extname}', filename);
			assert.strictEqual(customLabelService.getName(URI.file(`test/ext0/${filename}`)), ext.ext0 ?? '${extname(0)}', filename);
			assert.strictEqual(customLabelService.getName(URI.file(`test/ext1/${filename}`)), ext.ext1 ?? '${extname(1)}', filename);
			assert.strictEqual(customLabelService.getName(URI.file(`test/ext2/${filename}`)), ext.ext2 ?? '${extname(2)}', filename);
			assert.strictEqual(customLabelService.getName(URI.file(`test/extMinus1/${filename}`)), ext.extMinus1 ?? '${extname(-1)}', filename);
			assert.strictEqual(customLabelService.getName(URI.file(`test/extMinus2/${filename}`)), ext.extMinus2 ?? '${extname(-2)}', filename);
		}

		assertExtname('file.txt', {
			extname: 'txt',
			ext0: 'txt',
			extMinus1: 'txt',
		});

		assertExtname('file.txt1.txt2', {
			extname: 'txt1.txt2',
			ext0: 'txt2',
			ext1: 'txt1',
			extMinus1: 'txt1',
			extMinus2: 'txt2',
		});

		assertExtname('.file.txt1.txt2', {
			extname: 'txt1.txt2',
			ext0: 'txt2',
			ext1: 'txt1',
			extMinus1: 'txt1',
			extMinus2: 'txt2',
		});

		assertExtname('.file.txt1.txt2.txt3.txt4', {
			extname: 'txt1.txt2.txt3.txt4',
			ext0: 'txt4',
			ext1: 'txt3',
			ext2: 'txt2',
			extMinus1: 'txt1',
			extMinus2: 'txt2',
		});

		assertExtname('file', {});
		assertExtname('.file', {});
	});

	test('Custom Labels: dirname(N)', async () => {
		const [customLabelService, configService] = await createCustomLabelService();

		await updatePattern(configService, {
			'**': '${dirname},${dirname(0)},${dirname(1)},${dirname(2)},${dirname(-1)},${dirname(-2)}',
		});

		interface IDir {
			dirname?: string;
			dir0?: string;
			dir1?: string;
			dir2?: string;
			dirMinus1?: string;
			dirMinus2?: string;
		}

		function assertDirname(path: string, dir: IDir): void {
			assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[0], dir.dirname ?? '${dirname}', path);
			assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[1], dir.dir0 ?? '${dirname(0)}', path);
			assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[2], dir.dir1 ?? '${dirname(1)}', path);
			assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[3], dir.dir2 ?? '${dirname(2)}', path);
			assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[4], dir.dirMinus1 ?? '${dirname(-1)}', path);
			assert.strictEqual(customLabelService.getName(URI.file(path))?.split(',')[5], dir.dirMinus2 ?? '${dirname(-2)}', path);
		}

		assertDirname('folder/file.txt', {
			dirname: 'folder',
			dir0: 'folder',
			dirMinus1: 'folder',
		});

		assertDirname('root/folder/file.txt', {
			dirname: 'folder',
			dir0: 'folder',
			dir1: 'root',
			dirMinus1: 'root',
			dirMinus2: 'folder',
		});

		assertDirname('root/.folder/file.txt', {
			dirname: '.folder',
			dir0: '.folder',
			dir1: 'root',
			dirMinus1: 'root',
			dirMinus2: '.folder',
		});

		assertDirname('root/parent/folder/file.txt', {
			dirname: 'folder',
			dir0: 'folder',
			dir1: 'parent',
			dir2: 'root',
			dirMinus1: 'root',
			dirMinus2: 'parent',
		});

		assertDirname('file.txt', {});
	});

	test('Custom Labels: no pattern match', async () => {
		const [customLabelService, configService] = await createCustomLabelService();

		await updatePattern(configService, {
			'**/folder/**': 'folder',
			'file': 'file',
		});

		assert.strictEqual(customLabelService.getName(URI.file('file')), undefined);
		assert.strictEqual(customLabelService.getName(URI.file('file.txt')), undefined);
		assert.strictEqual(customLabelService.getName(URI.file('file.txt1.txt2')), undefined);
		assert.strictEqual(customLabelService.getName(URI.file('folder1/file.txt1.txt2')), undefined);

		assert.strictEqual(customLabelService.getName(URI.file('.file')), undefined);
		assert.strictEqual(customLabelService.getName(URI.file('.file.txt')), undefined);
		assert.strictEqual(customLabelService.getName(URI.file('.file.txt1.txt2')), undefined);
		assert.strictEqual(customLabelService.getName(URI.file('folder1/file.txt1.txt2')), undefined);
	});
});
