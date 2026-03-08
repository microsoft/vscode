/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { SupplyChainGuard } from '../src/security/SupplyChainGuard';

suite('SupplyChainGuard', () => {
	let guard: SupplyChainGuard;

	setup(() => {
		guard = new SupplyChainGuard();
	});

	suite('forbidden patterns', () => {
		test('detects eval()', async () => {
			const findings = await guard.scanCode('const result = eval("2 + 2");', 'javascript');
			assert.strictEqual(findings.length, 1);
			assert.strictEqual(findings[0].rule, 'no-eval');
			assert.strictEqual(findings[0].severity, 'error');
		});

		test('detects new Function()', async () => {
			const findings = await guard.scanCode('const fn = new Function("return 1");', 'javascript');
			assert.strictEqual(findings.length, 1);
			assert.strictEqual(findings[0].rule, 'no-function-constructor');
		});

		test('detects innerHTML assignment', async () => {
			const findings = await guard.scanCode('element.innerHTML = userInput;', 'javascript');
			assert.strictEqual(findings.length, 1);
			assert.strictEqual(findings[0].rule, 'no-inner-html');
		});

		test('detects SQL string concatenation', async () => {
			const code = 'db.query("SELECT * FROM users WHERE id = " + "' + "'" + 'userId");';
			const findings = await guard.scanCode(code, 'javascript');
			assert.ok(findings.length >= 1);
		});

		test('returns empty for clean code', async () => {
			const findings = await guard.scanCode('const x = 1;\nconst y = x + 2;', 'javascript');
			assert.strictEqual(findings.length, 0);
		});

		test('detects multiple findings on different lines', async () => {
			const code = [
				'const a = eval("1");',
				'const b = 2;',
				'element.innerHTML = x;',
			].join('\n');
			const findings = await guard.scanCode(code, 'javascript');
			assert.strictEqual(findings.length, 2);
			assert.strictEqual(findings[0].line, 1);
			assert.strictEqual(findings[1].line, 3);
		});
	});

	suite('extension allowlist', () => {
		test('isExtensionAllowed returns false when not in allowlist', () => {
			assert.strictEqual(guard.isExtensionAllowed('unknown.extension'), false);
		});

		test('isExtensionAllowed returns true when in allowlist', () => {
			guard.loadConfig({
				extensionAllowlist: [
					{ id: 'ms-python.python', publisher: 'ms-python', reason: 'Python support' },
				],
				mcpServerTrustList: [],
			});
			assert.strictEqual(guard.isExtensionAllowed('ms-python.python'), true);
		});
	});

	suite('MCP server trust', () => {
		test('untrusted server returns false and logs connection', () => {
			const trusted = guard.validateMcpConnection('unknown-server');
			assert.strictEqual(trusted, false);
			assert.strictEqual(guard.getMcpConnectionLog().length, 1);
			assert.strictEqual(guard.getMcpConnectionLog()[0].trusted, false);
		});

		test('trusted server returns true', () => {
			guard.loadConfig({
				extensionAllowlist: [],
				mcpServerTrustList: [
					{ name: 'code-graph', url: 'http://localhost:3000', trusted: true, reason: 'Local graph server' },
				],
			});
			const trusted = guard.validateMcpConnection('code-graph');
			assert.strictEqual(trusted, true);
		});

		test('connection log accumulates entries', () => {
			guard.validateMcpConnection('server-a');
			guard.validateMcpConnection('server-b');
			assert.strictEqual(guard.getMcpConnectionLog().length, 2);
		});
	});
});
