/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import * as resources from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { IFileStat } from '../../../../../platform/files/common/files.js';
import { SimpleFileDialog } from '../../browser/simpleFileDialog.js';

suite('SimpleFileDialog', () => {

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

		const dialog = Object.assign(Object.create(SimpleFileDialog.prototype), {
			fileService: {
				resolve: (resource: URI) => resources.isEqual(resource, slowFolder) ? slowResolve : Promise.resolve(folderStat(resource))
			},
			filePickBox: {
				value: '',
				valueSelection: undefined,
				items: [],
				itemActivation: undefined,
				busy: false,
				inputHasFocus: () => false
			},
			onBusyChangeEmitter: { fire() { } },
			separator: '/',
			currentFolder: URI.file('/'),
			isWindows: false,
			autoCompletePathSegment: '',
			userEnteredPathSegment: '',
			updatingPromise: undefined,
			scopedAuthority: undefined,
			createItems: async () => []
		});

		const slowUpdate = dialog.updateItems(slowFolder, true).catch(() => undefined);
		await dialog.updateItems(fastFolder, true);

		assert.strictEqual(dialog.currentFolder.toString(), resources.addTrailingPathSeparator(fastFolder).toString());
		assert.strictEqual(dialog.filePickBox.value, '/fast/');

		resolveSlow(folderStat(slowFolder));
		await timeout(0);
		await slowUpdate;

		assert.strictEqual(dialog.currentFolder.toString(), resources.addTrailingPathSeparator(fastFolder).toString());
		assert.strictEqual(dialog.filePickBox.value, '/fast/');
	});
});
