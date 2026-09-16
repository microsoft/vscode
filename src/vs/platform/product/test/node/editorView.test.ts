/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FileAccess, nodeModulesAsarPath, nodeModulesPath } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { isEditorViewInstalled } from '../../node/editorView.js';

suite('Optional editor-view detection', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const built of [false, true]) {
		test(`checks the renderer's application path (built=${built})`, () => {
			const paths: string[] = [];
			const installed = isEditorViewInstalled(built, store.add(new NullLogService()), path => {
				paths.push(path);
				return { isFile: () => true };
			});
			assert.deepStrictEqual({ installed, paths }, {
				installed: true,
				paths: [FileAccess.asFileUri(`${built ? nodeModulesAsarPath : nodeModulesPath}/@vscode/editor-view/dist/index.js`).fsPath]
			});
		});
	}

	test('a directory is not an installed entry point', () => {
		assert.strictEqual(isEditorViewInstalled(false, store.add(new NullLogService()), () => ({ isFile: () => false })), false);
	});

	for (const code of ['ENOENT', 'ENOTDIR', 'EACCES']) {
		test(`handles ${code} without breaking desktop startup`, () => {
			const debug: string[] = [];
			const errors: string[] = [];
			class TestLogService extends NullLogService {
				override debug(message: string): void { debug.push(message); }
				override error(message: string): void { errors.push(message); }
			}
			const installed = isEditorViewInstalled(false, store.add(new TestLogService()), () => {
				throw Object.assign(new Error(code), { code });
			});
			assert.deepStrictEqual({ installed, debug: debug.length, errors: errors.length }, {
				installed: false,
				debug: code === 'EACCES' ? 0 : 1,
				errors: code === 'EACCES' ? 1 : 0
			});
		});
	}
});
