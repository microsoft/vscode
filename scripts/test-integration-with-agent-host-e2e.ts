/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const childProcess: typeof import('child_process') = require('child_process');
const path: typeof import('path') = require('path');
const { spawn } = childProcess;
const { join, resolve } = path;

const repoRoot = resolve(__dirname, '..');
const integrationScript = join(repoRoot, 'scripts', process.platform === 'win32' ? 'test-integration.bat' : 'test-integration.sh');
const agentHostE2EScript = join(repoRoot, 'scripts', 'test-agent-host-e2e.ts');
const windowsTestWrapper = join(repoRoot, 'scripts', 'test-agent-host-e2e-child.ps1');

interface ITestProcess {
	readonly label: string;
	readonly command: string;
	readonly args: readonly string[];
	readonly environment: NodeJS.ProcessEnv;
}

async function main(): Promise<void> {
	const environment = {
		...process.env,
		VSCODE_SKIP_PRELAUNCH: '1',
	};
	const integrationEnvironment = {
		...environment,
		VSCODE_SKIP_AGENT_HOST_E2E: '1',
	};
	const integrationProcess = process.platform === 'win32'
		? {
			label: 'Integration tests',
			command: join(process.env.SYSTEMROOT ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
			args: [
				'-NoLogo',
				'-NoProfile',
				'-NonInteractive',
				'-ExecutionPolicy', 'Bypass',
				'-File', windowsTestWrapper,
				integrationScript,
				...process.argv.slice(2),
			],
			environment: integrationEnvironment,
		}
		: {
			label: 'Integration tests',
			command: integrationScript,
			args: process.argv.slice(2),
			environment: integrationEnvironment,
		};
	const agentHostE2EProcess = {
		label: 'Agent Host E2E tests',
		command: process.execPath,
		args: [agentHostE2EScript, '--tfs', 'Agent Host E2E'],
		environment,
	};

	const results = await Promise.all([
		runTestProcess(integrationProcess),
		runTestProcess(agentHostE2EProcess),
	]);
	const failures = results.filter(result => result.exitCode !== 0);
	if (failures.length > 0) {
		for (const failure of failures) {
			console.error(`${failure.label} failed with ${failure.reason}.`);
		}
		process.exitCode = 1;
	}
}

function runTestProcess(testProcess: ITestProcess): Promise<{ label: string; exitCode: number; reason: string }> {
	console.log(`Starting ${testProcess.label}...`);
	return new Promise(resolveResult => {
		const child = spawn(testProcess.command, testProcess.args, {
			cwd: repoRoot,
			env: testProcess.environment,
			stdio: 'inherit',
		});
		child.on('error', error => {
			resolveResult({
				label: testProcess.label,
				exitCode: 1,
				reason: error.message,
			});
		});
		child.on('close', (code, signal) => {
			const exitCode = code ?? 1;
			const reason = signal ? `signal ${signal}` : `exit code ${exitCode}`;
			console.log(`${testProcess.label} completed with ${reason}.`);
			resolveResult({ label: testProcess.label, exitCode, reason });
		});
	});
}

main().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
