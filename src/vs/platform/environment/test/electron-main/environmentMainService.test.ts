/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { EnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import product from 'vs/platform/product/common/product';
import { isLinux } from 'vs/base/common/platform';

suite('EnvironmentMainService', () => {

	test('can unset and restore snap env variables', () => {
		const service = new EnvironmentMainService({ '_': [] }, { '_serviceBrand': undefined, ...product });

		process.env['TEST_ARG1_VSCODE_SNAP_ORIG'] = 'original';
		process.env['TEST_ARG1'] = 'modified';
		process.env['TEST_ARG2_SNAP'] = 'test_arg2';
		process.env['TEST_ARG3_VSCODE_SNAP_ORIG'] = '';
		process.env['TEST_ARG3'] = 'test_arg3_non_empty';

		// Unset snap env variables
		service.unsetSnapExportedVariables();
		if (isLinux) {
			assert.strictEqual(process.env['TEST_ARG1'], 'original');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], undefined);
		} else {
			assert.strictEqual(process.env['TEST_ARG1'], 'modified');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], 'test_arg3_non_empty');
		}

		// Restore snap env variables
		service.restoreSnapExportedVariables();
		if (isLinux) {
			assert.strictEqual(process.env['TEST_ARG1'], 'modified');
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], 'test_arg3_non_empty');
		} else {
			assert.strictEqual(process.env['TEST_ARG1'], 'modified');
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], 'test_arg3_non_empty');
		}
	});

	test('can invoke unsetSnapExportedVariables and restoreSnapExportedVariables multiple times', () => {
		const service = new EnvironmentMainService({ '_': [] }, { '_serviceBrand': undefined, ...product });
		// Mock snap environment
		process.env['SNAP'] = '1';
		process.env['SNAP_REVISION'] = 'test_revision';

		process.env['TEST_ARG1_VSCODE_SNAP_ORIG'] = 'original';
		process.env['TEST_ARG1'] = 'modified';
		process.env['TEST_ARG2_SNAP'] = 'test_arg2';
		process.env['TEST_ARG3_VSCODE_SNAP_ORIG'] = '';
		process.env['TEST_ARG3'] = 'test_arg3_non_empty';

		// Unset snap env variables
		service.unsetSnapExportedVariables();
		service.unsetSnapExportedVariables();
		service.unsetSnapExportedVariables();
		if (isLinux) {
			assert.strictEqual(process.env['TEST_ARG1'], 'original');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], undefined);
		} else {
			assert.strictEqual(process.env['TEST_ARG1'], 'modified');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], 'test_arg3_non_empty');
		}

		// Restore snap env variables
		service.restoreSnapExportedVariables();
		service.restoreSnapExportedVariables();
		if (isLinux) {
			assert.strictEqual(process.env['TEST_ARG1'], 'modified');
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], 'test_arg3_non_empty');
		} else {
			assert.strictEqual(process.env['TEST_ARG1'], 'modified');
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], 'test_arg3_non_empty');
		}

		// Unset snap env variables
		service.unsetSnapExportedVariables();
		if (isLinux) {
			assert.strictEqual(process.env['TEST_ARG1'], 'original');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], undefined);
		} else {
			assert.strictEqual(process.env['TEST_ARG1'], 'modified');
			assert.strictEqual(process.env['TEST_ARG2'], undefined);
			assert.strictEqual(process.env['TEST_ARG1_VSCODE_SNAP_ORIG'], 'original');
			assert.strictEqual(process.env['TEST_ARG2_SNAP'], 'test_arg2');
			assert.strictEqual(process.env['TEST_ARG3_VSCODE_SNAP_ORIG'], '');
			assert.strictEqual(process.env['TEST_ARG3'], 'test_arg3_non_empty');
		}
	});
});
