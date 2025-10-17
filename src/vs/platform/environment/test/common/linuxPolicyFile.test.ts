/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { isLinux } from '../../../../base/common/platform.js';
import { env } from '../../../../base/common/process.js';
import { NativeParsedArgs } from '../../common/argv.js';
import { NativeEnvironmentService } from '../../common/environmentService.js';
import { IProductService } from '../../../product/common/productService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('Linux Policy File Support', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function createEnvironmentService(args: Partial<NativeParsedArgs> = {}): NativeEnvironmentService {
		const paths = {
			homeDir: '/home/testuser',
			tmpDir: '/tmp',
			userDataDir: '/home/testuser/.vscode-oss'
		};

		const productService: IProductService = {
			dataFolderName: '.vscode-oss'
		} as IProductService;

		return new NativeEnvironmentService(args as NativeParsedArgs, paths, productService);
	}

	test('should provide policy file path when __enable-file-policy flag is set', () => {
		const envService = createEnvironmentService({ '__enable-file-policy': true });
		const policyFile = envService.policyFile;

		assert.ok(policyFile, 'Policy file should be defined with __enable-file-policy flag');
		assert.strictEqual(policyFile.fsPath, '/home/testuser/.vscode-oss/policy.json');
	});

	(isLinux ? test : test.skip)('should provide policy file path on Linux by default (without __enable-file-policy flag)', () => {
		const envService = createEnvironmentService({}); // No __enable-file-policy flag
		const policyFile = envService.policyFile;

		assert.ok(policyFile, 'Policy file should be defined on Linux by default');
		assert.strictEqual(policyFile.fsPath, '/home/testuser/.vscode-oss/policy.json');
	});

	(!isLinux ? test : test.skip)('should NOT provide policy file path on non-Linux platforms by default (without __enable-file-policy flag)', () => {
		const envService = createEnvironmentService({}); // No __enable-file-policy flag
		const policyFile = envService.policyFile;

		assert.strictEqual(policyFile, undefined, 'Policy file should NOT be defined on non-Linux platforms without __enable-file-policy flag');
	});

	(isLinux ? test : test.skip)('should use portable path when VSCODE_PORTABLE is set on Linux', () => {
		// Save original env
		const originalPortable = env['VSCODE_PORTABLE'];

		try {
			env['VSCODE_PORTABLE'] = '/portable/vscode';

			const envService = createEnvironmentService({}); // No __enable-file-policy flag
			const policyFile = envService.policyFile;

			assert.ok(policyFile, 'Policy file should be defined on Linux in portable mode');
			assert.strictEqual(policyFile.fsPath, '/portable/vscode/policy.json');
		} finally {
			// Restore original values
			if (originalPortable !== undefined) {
				env['VSCODE_PORTABLE'] = originalPortable;
			} else {
				delete env['VSCODE_PORTABLE'];
			}
		}
	});

	test('should use portable path when VSCODE_PORTABLE is set with __enable-file-policy flag', () => {
		// Save original env
		const originalPortable = env['VSCODE_PORTABLE'];

		try {
			env['VSCODE_PORTABLE'] = '/portable/vscode';

			const envService = createEnvironmentService({ '__enable-file-policy': true });
			const policyFile = envService.policyFile;

			assert.ok(policyFile, 'Policy file should be defined in portable mode');
			assert.strictEqual(policyFile.fsPath, '/portable/vscode/policy.json');
		} finally {
			// Restore original values
			if (originalPortable !== undefined) {
				env['VSCODE_PORTABLE'] = originalPortable;
			} else {
				delete env['VSCODE_PORTABLE'];
			}
		}
	});

});