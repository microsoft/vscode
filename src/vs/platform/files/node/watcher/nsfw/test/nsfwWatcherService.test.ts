/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { isWindows } from 'vs/base/common/platform';
import { NsfwWatcherService } from 'vs/platform/files/node/watcher/nsfw/nsfwWatcherService';
import { IWatchRequest } from 'vs/platform/files/node/watcher/watcher';

suite('NSFW Watcher Service', () => {

	class TestNsfwWatcherService extends NsfwWatcherService {

		testNormalizePaths(paths: string[]): string[] {

			// Work with strings as paths to simplify testing
			const requests: IWatchRequest[] = paths.map(path => {
				return { path, excludes: [] };
			});

			return this.normalizeRequests(requests).map(request => request.path);
		}
	}

	test('should not impacts roots that do not overlap', () => {
		const service = new TestNsfwWatcherService();
		if (isWindows) {
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a']), ['C:\\a']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\b']), ['C:\\a', 'C:\\b']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\b', 'C:\\c\\d\\e']), ['C:\\a', 'C:\\b', 'C:\\c\\d\\e']);
		} else {
			assert.deepStrictEqual(service.testNormalizePaths(['/a']), ['/a']);
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/b']), ['/a', '/b']);
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/b', '/c/d/e']), ['/a', '/b', '/c/d/e']);
		}
	});

	test('should remove sub-folders of other roots', () => {
		const service = new TestNsfwWatcherService();
		if (isWindows) {
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\a\\b']), ['C:\\a']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\b\\a', 'C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
			assert.deepStrictEqual(service.testNormalizePaths(['C:\\a', 'C:\\a\\b', 'C:\\a\\c\\d']), ['C:\\a']);
		} else {
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/a/b']), ['/a']);
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/b', '/a/b']), ['/a', '/b']);
			assert.deepStrictEqual(service.testNormalizePaths(['/b/a', '/a', '/b', '/a/b']), ['/a', '/b']);
			assert.deepStrictEqual(service.testNormalizePaths(['/a', '/a/b', '/a/c/d']), ['/a']);
		}
	});
});
