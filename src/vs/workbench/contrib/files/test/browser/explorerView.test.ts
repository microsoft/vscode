/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite, toResource } from '../../../../../base/test/common/utils.js';
import { TestFileService } from '../../../../test/browser/workbenchTestServices.js';
import { ExplorerItem } from '../../common/explorerModel.js';
import { getContext } from '../../browser/views/explorerView.js';
import { listInvalidItemForeground } from '../../../../../platform/theme/common/colorRegistry.js';
import { CompressedNavigationController } from '../../browser/views/explorerViewer.js';
import * as dom from '../../../../../base/browser/dom.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { provideDecorations } from '../../browser/views/explorerDecorationsProvider.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullFilesConfigurationService } from '../../../../test/common/workbenchTestServices.js';

suite('Files - ExplorerView', () => {

	const $ = dom.$;

	const ds = ensureNoDisposablesAreLeakedInTestSuite();

	const fileService = new TestFileService();
	const configService = new TestConfigurationService();


	function createStat(this: any, path: string, name: string, isFolder: boolean, hasChildren: boolean, size: number, mtime: number, isSymLink = false, isUnknown = false): ExplorerItem {
		return new ExplorerItem(toResource.call(this, path), fileService, configService, NullFilesConfigurationService, undefined, isFolder, isSymLink, false, false, name, mtime, isUnknown);
	}

	test('getContext', async function () {
		const d = new Date().getTime();
		const s1 = createStat.call(this, '/', '/', true, false, 8096, d);
		const s2 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s4 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);
		const noNavigationController = { getCompressedNavigationController: (stat: ExplorerItem) => undefined };

		assert.deepStrictEqual(getContext([s1], [s2, s3, s4], true, noNavigationController), [s2, s3, s4]);
		assert.deepStrictEqual(getContext([s1], [s1, s3, s4], true, noNavigationController), [s1, s3, s4]);
		assert.deepStrictEqual(getContext([s1], [s3, s1, s4], false, noNavigationController), [s1]);
		assert.deepStrictEqual(getContext([], [s3, s1, s4], false, noNavigationController), []);
		assert.deepStrictEqual(getContext([], [s3, s1, s4], true, noNavigationController), [s3, s1, s4]);
	});

	test('decoration provider', async function () {
		const d = new Date().getTime();
		const s1 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		s1.error = new Error('A test error');
		const s2 = createStat.call(this, '/path/to', 'to', true, false, 8096, d, true);
		const s3 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);
		assert.strictEqual(provideDecorations(s3), undefined);
		assert.deepStrictEqual(provideDecorations(s2), {
			tooltip: 'Symbolic Link',
			letter: '\u2937'
		});
		assert.deepStrictEqual(provideDecorations(s1), {
			tooltip: 'Unable to resolve workspace folder (A test error)',
			letter: '!',
			color: listInvalidItemForeground
		});

		const unknown = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d, false, true);
		assert.deepStrictEqual(provideDecorations(unknown), {
			tooltip: 'Unknown File Type',
			letter: '?'
		});
	});

	test('compressed navigation controller', async function () {
		const container = $('.file');
		const label = $('.label');
		const labelName1 = $('.label-name');
		const labelName2 = $('.label-name');
		const labelName3 = $('.label-name');
		const d = new Date().getTime();
		const s1 = createStat.call(this, '/path', 'path', true, false, 8096, d);
		const s2 = createStat.call(this, '/path/to', 'to', true, false, 8096, d);
		const s3 = createStat.call(this, '/path/to/stat', 'stat', false, false, 8096, d);

		dom.append(container, label);
		dom.append(label, labelName1);
		dom.append(label, labelName2);
		dom.append(label, labelName3);
		const emitter = new Emitter<void>();

		const navigationController = new CompressedNavigationController('id', [s1, s2, s3], {
			container,
			templateDisposables: ds.add(new DisposableStore()),
			elementDisposables: ds.add(new DisposableStore()),
			contribs: [],
			label: <any>{
				container: label,
				onDidRender: emitter.event
			}
		}, 1, false);

		ds.add(navigationController);

		assert.strictEqual(navigationController.count, 3);
		assert.strictEqual(navigationController.index, 2);
		assert.strictEqual(navigationController.current, s3);
		navigationController.next();
		assert.strictEqual(navigationController.current, s3);
		navigationController.previous();
		assert.strictEqual(navigationController.current, s2);
		navigationController.previous();
		assert.strictEqual(navigationController.current, s1);
		navigationController.previous();
		assert.strictEqual(navigationController.current, s1);
		navigationController.last();
		assert.strictEqual(navigationController.current, s3);
		navigationController.first();
		assert.strictEqual(navigationController.current, s1);
		navigationController.setIndex(1);
		assert.strictEqual(navigationController.current, s2);
		navigationController.setIndex(44);
		assert.strictEqual(navigationController.current, s2);
	});
});
