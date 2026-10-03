/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { FileAccess, nodeModulesAsarPath, nodeModulesPath } from '../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { isEditorViewInstalled } from '../../node/editorView.js';
import { resolveAmdNodeModulePath } from '../../../../amdX.js';
import { isElectron } from '../../../../base/common/platform.js';
import { env } from '../../../../base/common/process.js';
import { NativeEnvironmentService } from '../../../environment/node/environmentService.js';
import { OPTIONS, parseArgs } from '../../../environment/node/argv.js';
import product from '../../common/product.js';

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

		test(`explicit runtime build state selects the renderer URL (built=${built})`, () => {
			const modulesPath = built && isElectron ? nodeModulesAsarPath : nodeModulesPath;
			assert.strictEqual(
				resolveAmdNodeModulePath('@vscode/editor-view', 'dist/index.js', built),
				FileAccess.asBrowserUri(`${modulesPath}/@vscode/editor-view/dist/index.js`).toString(true)
			);
		});
	}

	for (const commit of [undefined, 'custom-build-commit']) {
		test(`commit metadata does not override runtime build state (commit=${commit})`, () => {
			const environmentService = new NativeEnvironmentService(parseArgs([], OPTIONS), { ...product, _serviceBrand: undefined, commit });
			const built = !env.VSCODE_DEV;
			const paths: string[] = [];
			const installed = isEditorViewInstalled(environmentService.isBuilt, store.add(new NullLogService()), path => {
				paths.push(path);
				return { isFile: () => true };
			});
			assert.deepStrictEqual({
				built: environmentService.isBuilt,
				installed,
				paths,
				url: resolveAmdNodeModulePath('@vscode/editor-view', 'dist/index.js', environmentService.isBuilt)
			}, {
				built,
				installed: true,
				paths: [FileAccess.asFileUri(`${built ? nodeModulesAsarPath : nodeModulesPath}/@vscode/editor-view/dist/index.js`).fsPath],
				url: FileAccess.asBrowserUri(`${built && isElectron ? nodeModulesAsarPath : nodeModulesPath}/@vscode/editor-view/dist/index.js`).toString(true)
			});
		});
	}

	test('callers without an explicit build state retain the existing resolution', () => {
		assert.strictEqual(
			resolveAmdNodeModulePath('other-package', 'index.js'),
			resolveAmdNodeModulePath('other-package', 'index.js', Boolean(product.commit))
		);
	});

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
