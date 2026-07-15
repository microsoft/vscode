/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as resources from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService, IFileStat } from '../../../../../platform/files/common/files.js';
import { ItemActivation } from '../../../../../platform/quickinput/common/quickInput.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { SimpleFileDialog } from '../../browser/simpleFileDialog.js';

suite('SimpleFileDialog', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not let a canceled slow folder update overwrite a newer folder', async () => {
		const slowFolder = URI.file('/slow');
		const fastFolder = URI.file('/fast');

		let resolveSlow!: (stat: IFileStat) => void;
		const slowResolve = new Promise<IFileStat>(resolve => resolveSlow = resolve);

		function folderStat(resource: URI): IFileStat {
			return {
				resource,
				name: resources.basename(resource),
				isFile: false,
				isDirectory: true,
				isSymbolicLink: false,
				mtime: 0,
				ctime: 0,
				etag: '',
				size: 0,
				readonly: false,
				locked: false,
				children: []
			};
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IFileService, 'resolve', (resource: URI) => resources.isEqual(resource, slowFolder) ? slowResolve : Promise.resolve(folderStat(resource)));

		const dialog = disposables.add(instantiationService.createInstance(SimpleFileDialog)) as unknown as {
			updateItems(newFolder: URI, force?: boolean, trailing?: string): Promise<boolean>;
			currentFolder: URI;
			filePickBox: {
				value: string;
				valueSelection: undefined;
				items: readonly unknown[];
				itemActivation: ItemActivation | undefined;
				busy: boolean;
				inputHasFocus(): boolean;
			};
			createItems(): Promise<readonly unknown[]>;
		};
		dialog.filePickBox = {
			value: '',
			valueSelection: undefined,
			items: [],
			itemActivation: undefined,
			busy: false,
			inputHasFocus: () => false
		};
		dialog.currentFolder = URI.file('/');
		dialog.createItems = async () => [];

		const slowUpdate = dialog.updateItems(slowFolder, true).catch(() => undefined);
		await dialog.updateItems(fastFolder, true);

		assert.strictEqual(dialog.currentFolder.toString(), resources.addTrailingPathSeparator(fastFolder).toString());
		assert.strictEqual(dialog.filePickBox.value, '/fast/');

		resolveSlow(folderStat(slowFolder));
		await slowUpdate;

		assert.strictEqual(dialog.currentFolder.toString(), resources.addTrailingPathSeparator(fastFolder).toString());
		assert.strictEqual(dialog.filePickBox.value, '/fast/');
	});
});
