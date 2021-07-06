/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as platform from 'vs/base/common/platform';
import { IWatcherRequest } from 'vs/platform/files/node/watcher/nsfw/watcher';

suite('NSFW Watcher Service', async () => {

	// Load `nsfwWatcherService` within the suite to prevent all tests
	// from failing to start if `nsfw` was not properly installed
	const { NsfwWatcherService } = await import('vs/platform/files/node/watcher/nsfw/nsfwWatcherService');

	class TestNsfwWatcherService extends NsfwWatcherService {

		testNormalizeRoots(roots: string[]): string[] {

			// Work with strings as paths to simplify testing
			const requests: IWatcherRequest[] = roots.map(r => {
				return { path: r, excludes: [] };
			});

			return this.normalizeRoots(requests).map(r => r.path);
		}
	}

	suite('_normalizeRoots', () => {
		test('should not impacts roots that don\'t overlap', () => {
			const service = new TestNsfwWatcherService();
			if (platform.isWindows) {
				assert.deepStrictEqual(service.testNormalizeRoots(['C:\\a']), ['C:\\a']);
				assert.deepStrictEqual(service.testNormalizeRoots(['C:\\a', 'C:\\b']), ['C:\\a', 'C:\\b']);
				assert.deepStrictEqual(service.testNormalizeRoots(['C:\\a', 'C:\\b', 'C:\\c\\d\\e']), ['C:\\a', 'C:\\b', 'C:\\c\\d\\e']);
			} else {
				assert.deepStrictEqual(service.testNormalizeRoots(['/a']), ['/a']);
				assert.deepStrictEqual(service.testNormalizeRoots(['/a', '/b']), ['/a', '/b']);
				assert.deepStrictEqual(service.testNormalizeRoots(['/a', '/b', '/c/d/e']), ['/a', '/b', '/c/d/e']);
			}
		});

		test('should remove sub-folders of other roots', () => {
			const service = new TestNsfwWatcherService();
			if (platform.isWindows) {
				assert.deepStrictEqual(service.testNormalizeRoots(['C:\\a', 'C:\\a\\b']), ['C:\\a']);
				assert.deepStrictEqual(service.testNormalizeRoots(['C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
				assert.deepStrictEqual(service.testNormalizeRoots(['C:\\b\\a', 'C:\\a', 'C:\\b', 'C:\\a\\b']), ['C:\\a', 'C:\\b']);
				assert.deepStrictEqual(service.testNormalizeRoots(['C:\\a', 'C:\\a\\b', 'C:\\a\\c\\d']), ['C:\\a']);
			} else {
				assert.deepStrictEqual(service.testNormalizeRoots(['/a', '/a/b']), ['/a']);
				assert.deepStrictEqual(service.testNormalizeRoots(['/a', '/b', '/a/b']), ['/a', '/b']);
				assert.deepStrictEqual(service.testNormalizeRoots(['/b/a', '/a', '/b', '/a/b']), ['/a', '/b']);
				assert.deepStrictEqual(service.testNormalizeRoots(['/a', '/a/b', '/a/c/d']), ['/a']);
			}
		});
	});
});
