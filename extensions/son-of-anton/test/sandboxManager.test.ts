/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as assert from 'assert';
import { SandboxManager, defaultSandboxConfig, DockerApi } from '../src/sandbox/SandboxManager';
import { SandboxTerminal } from '../src/sandbox/SandboxTerminal';

/**
 * Stub Docker API for testing.
 */
class StubDockerApi implements DockerApi {
	createContainerCalls: unknown[] = [];
	execCalls: { containerId: string; command: string }[] = [];
	removeCalls: string[] = [];
	execResult = { exitCode: 0, stdout: 'ok', stderr: '', timedOut: false };

	async createContainer(options: unknown): Promise<string> {
		this.createContainerCalls.push(options);
		return 'container-123';
	}

	async exec(containerId: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut: boolean }> {
		this.execCalls.push({ containerId, command });
		return this.execResult;
	}

	async removeContainer(containerId: string): Promise<void> {
		this.removeCalls.push(containerId);
	}
}

/**
 * Stub terminal that captures output.
 */
class StubTerminal extends SandboxTerminal {
	lines: string[] = [];

	override writeLine(text: string): void {
		this.lines.push(text);
	}

	override showCommand(_command: string, _level: string): void {
		// noop
	}

	override showStdout(_data: string): void {
		// noop
	}

	override showStderr(_data: string): void {
		// noop
	}

	override showExitCode(_code: number, _duration: number): void {
		// noop
	}

	override showBlocked(command: string, reason: string): void {
		this.lines.push(`BLOCKED: ${command} (${reason})`);
	}
}

suite('SandboxManager', () => {
	let sandbox: SandboxManager;
	let docker: StubDockerApi;
	let terminal: StubTerminal;

	setup(() => {
		terminal = new StubTerminal();
		sandbox = new SandboxManager(defaultSandboxConfig('/tmp/workspace'), terminal);
		docker = new StubDockerApi();
		sandbox.setDockerApi(docker);
	});

	test('blocks dangerous commands', async () => {
		const result = await sandbox.execute('sudo rm -rf /');
		assert.strictEqual(result.exitCode, 1);
		assert.strictEqual(result.classification.level, 'blocked');
		assert.strictEqual(docker.execCalls.length, 0);
	});

	test('executes allowed commands in container', async () => {
		const result = await sandbox.execute('npm test');
		assert.strictEqual(result.exitCode, 0);
		assert.strictEqual(result.classification.level, 'allowed');
		assert.strictEqual(docker.execCalls.length, 1);
		assert.strictEqual(docker.execCalls[0].command, 'npm test');
	});

	test('requires confirmation for rm commands', async () => {
		let confirmCalled = false;
		sandbox.setConfirmCallback(async () => {
			confirmCalled = true;
			return true;
		});

		const result = await sandbox.execute('rm temp-file.txt');
		assert.strictEqual(confirmCalled, true);
		assert.strictEqual(result.exitCode, 0);
		assert.strictEqual(result.classification.level, 'confirm');
	});

	test('denies command when user rejects confirmation', async () => {
		sandbox.setConfirmCallback(async () => false);

		const result = await sandbox.execute('rm temp-file.txt');
		assert.strictEqual(result.exitCode, 1);
		assert.strictEqual(result.stderr, 'Command denied by user.');
		assert.strictEqual(docker.execCalls.length, 0);
	});

	test('fails when no confirm callback is set for confirm commands', async () => {
		const result = await sandbox.execute('rm temp-file.txt');
		assert.strictEqual(result.exitCode, 1);
		assert.ok(result.stderr.includes('No confirmation handler'));
	});

	test('creates container on first execution', async () => {
		await sandbox.execute('npm test');
		assert.strictEqual(docker.createContainerCalls.length, 1);

		// Second call should reuse container
		await sandbox.execute('npm test');
		assert.strictEqual(docker.createContainerCalls.length, 1);
	});

	test('destroy removes container', async () => {
		await sandbox.execute('npm test');
		await sandbox.destroy();
		assert.strictEqual(docker.removeCalls.length, 1);
		assert.strictEqual(docker.removeCalls[0], 'container-123');
	});

	test('default config has expected values', () => {
		const config = defaultSandboxConfig('/workspace');
		assert.strictEqual(config.memoryLimitMb, 2048);
		assert.strictEqual(config.cpuQuota, 2);
		assert.strictEqual(config.timeoutMs, 300_000);
		assert.strictEqual(config.image, 'son-of-anton-sandbox:latest');
	});
});
