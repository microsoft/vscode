/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { classifyCommand } from '../src/sandbox/CommandClassifier';

suite('CommandClassifier', () => {
	suite('allowed commands', () => {
		test('npm test is allowed', () => {
			assert.deepStrictEqual(classifyCommand('npm test'), {
				level: 'allowed',
				reason: 'Running tests',
				command: 'npm test',
			});
		});

		test('pytest is allowed', () => {
			const result = classifyCommand('pytest tests/');
			assert.strictEqual(result.level, 'allowed');
		});

		test('cargo test is allowed', () => {
			const result = classifyCommand('cargo test --release');
			assert.strictEqual(result.level, 'allowed');
		});

		test('eslint is allowed', () => {
			const result = classifyCommand('npx eslint src/');
			assert.strictEqual(result.level, 'allowed');
		});

		test('tsc --noEmit is allowed', () => {
			const result = classifyCommand('tsc --noEmit');
			assert.strictEqual(result.level, 'allowed');
		});

		test('npm install is allowed', () => {
			const result = classifyCommand('npm install');
			assert.strictEqual(result.level, 'allowed');
		});

		test('semgrep is allowed', () => {
			const result = classifyCommand('semgrep --config=auto src/');
			assert.strictEqual(result.level, 'allowed');
		});

		test('cat is allowed', () => {
			const result = classifyCommand('cat package.json');
			assert.strictEqual(result.level, 'allowed');
		});

		test('ls is allowed', () => {
			const result = classifyCommand('ls -la');
			assert.strictEqual(result.level, 'allowed');
		});
	});

	suite('blocked commands', () => {
		test('rm -rf / is blocked', () => {
			const result = classifyCommand('rm -rf /');
			assert.strictEqual(result.level, 'blocked');
		});

		test('DROP TABLE is blocked', () => {
			const result = classifyCommand('psql -c "DROP TABLE users"');
			assert.strictEqual(result.level, 'blocked');
		});

		test('DROP DATABASE is blocked', () => {
			const result = classifyCommand('DROP DATABASE production');
			assert.strictEqual(result.level, 'blocked');
		});

		test('git push --force is blocked', () => {
			const result = classifyCommand('git push --force origin main');
			assert.strictEqual(result.level, 'blocked');
		});

		test('git push -f is blocked', () => {
			const result = classifyCommand('git push -f origin main');
			assert.strictEqual(result.level, 'blocked');
		});

		test('sudo is blocked', () => {
			const result = classifyCommand('sudo rm -rf /tmp');
			assert.strictEqual(result.level, 'blocked');
		});

		test('modifying .env is blocked', () => {
			const result = classifyCommand('echo "SECRET=val" >> .env');
			assert.strictEqual(result.level, 'blocked');
		});
	});

	suite('confirm commands', () => {
		test('rm requires confirmation', () => {
			const result = classifyCommand('rm some-file.txt');
			assert.strictEqual(result.level, 'confirm');
		});

		test('git push requires confirmation', () => {
			const result = classifyCommand('git push origin feature');
			assert.strictEqual(result.level, 'confirm');
		});

		test('curl requires confirmation', () => {
			const result = classifyCommand('curl https://example.com');
			assert.strictEqual(result.level, 'confirm');
		});

		test('unknown commands default to confirm', () => {
			const result = classifyCommand('some-unknown-binary --flag');
			assert.strictEqual(result.level, 'confirm');
		});
	});
});
