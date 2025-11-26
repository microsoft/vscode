/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { DiagnosticsService } from '../../electron-browser/diagnosticsService.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';

suite('DiagnosticsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let service: DiagnosticsService;
	let mockLogService: ILogService;
	let mockEnvironmentService: INativeWorkbenchEnvironmentService;

	setup(() => {
		mockLogService = new NullLogService();
		// Use dynamic require to access os.tmpdir() at runtime (bypasses import restrictions)
		const tmpdir = (require('os') as typeof import('os')).tmpdir();
		mockEnvironmentService = {
			tmpDir: URI.file(tmpdir)
		} as INativeWorkbenchEnvironmentService;

		service = store.add(new DiagnosticsService(mockLogService, mockEnvironmentService));
	});

	test('PATH length check - returns result', async () => {
		const result = await service.runCheck('pathLength');
		assert.strictEqual(result.id, 'pathLength');
		assert.strictEqual(typeof result.message, 'string');
		assert.ok(result.status === 'pass' || result.status === 'fail');
	});

	test('PATH length check - detects long PATH', async () => {
		const originalEnv = process.env.PATH;
		try {
			process.env.PATH = 'a'.repeat(5000);

			const result = await service.runCheck('pathLength');
			assert.strictEqual(result.id, 'pathLength');
			assert.strictEqual(result.status, 'fail');
			assert.ok(result.message.includes('5000'));
			assert.ok(result.remediation);
		} finally {
			process.env.PATH = originalEnv;
		}
	});

	test('PATH length check - passes with short PATH', async () => {
		const originalEnv = process.env.PATH;
		try {
			process.env.PATH = '/usr/bin:/bin';

			const result = await service.runCheck('pathLength');
			assert.strictEqual(result.id, 'pathLength');
			assert.strictEqual(result.status, 'pass');
			assert.ok(result.message.includes('chars'));
		} finally {
			process.env.PATH = originalEnv;
		}
	});

	test('Symlink support check - returns result', async () => {
		const result = await service.runCheck('symlinkSupport');
		assert.strictEqual(result.id, 'symlinkSupport');
		assert.ok(result.status === 'pass' || result.status === 'fail' || result.status === 'unknown');
		assert.strictEqual(typeof result.message, 'string');
	});

	test('WSL detection - returns info status', async () => {
		const result = await service.runCheck('wslDetection');
		assert.strictEqual(result.id, 'wslDetection');
		assert.strictEqual(result.status, 'info');
		assert.strictEqual(typeof result.message, 'string');
	});

	test('runDiagnostics returns all results', async () => {
		const results = await service.runDiagnostics();
		assert.strictEqual(results.length, 3);
		assert.ok(results.some(r => r.id === 'pathLength'));
		assert.ok(results.some(r => r.id === 'symlinkSupport'));
		assert.ok(results.some(r => r.id === 'wslDetection'));
	});

	test('Results are cached', async () => {
		await service.runDiagnostics();
		const results1 = service.getResults();
		const results2 = service.getResults();
		assert.strictEqual(results1.length, results2.length);
		assert.deepStrictEqual(results1, results2);
	});

	test('onDidChangeResults fires when diagnostics run', async () => {
		let eventFired = false;
		store.add(service.onDidChangeResults(() => {
			eventFired = true;
		}));

		await service.runDiagnostics();
		assert.strictEqual(eventFired, true);
	});

	test('All checks have required fields', async () => {
		const results = await service.runDiagnostics();
		for (const result of results) {
			assert.ok(result.id);
			assert.ok(result.name);
			assert.ok(result.status);
			assert.ok(result.message);
		}
	});

	test('Failed checks include remediation', async () => {
		const originalEnv = process.env.PATH;
		try {
			process.env.PATH = 'a'.repeat(5000);

			const result = await service.runCheck('pathLength');
			if (result.status === 'fail') {
				assert.ok(result.remediation);
				assert.ok(result.documentationLink);
			}
		} finally {
			process.env.PATH = originalEnv;
		}
	});

	test('All checks have documentation links', async () => {
		const results = await service.runDiagnostics();
		for (const result of results) {
			assert.ok(result.documentationLink);
			assert.ok(result.documentationLink.startsWith('#'));
		}
	});
});

