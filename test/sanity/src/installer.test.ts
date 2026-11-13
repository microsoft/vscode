/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { TestContext } from './context.js';

const commandPath = '/usr/bin/copilot';
const policyPath = '/etc/vscode/policy.json';
const policyName = 'CopilotCliCommand';
const policyExitCode = 10;
const notInstalledExitCode = 127;
const notFoundMessage = 'GitHub Copilot CLI was not found';
const policyMessage = `turned off by the ${policyName} policy`;
const noCommand = '(none)';
const foreignCommand = '#!/bin/sh\n# Installed by the VS Code installer sanity tests\n';

/**
 * Tests that the DEB and RPM packages manage `/usr/bin/copilot` according to the `CopilotCliCommand` policy and the
 * DEB `add-copilot-command` answer, and that the Copilot shim shipped in each package honors the policy.
 */
export function setup(context: TestContext) {
	context.test('installer-darwin-x64', ['darwin', 'x64', 'installer'], async () => {
		const dir = await context.downloadAndUnpack('darwin');
		if (!context.options.downloadOnly) {
			testMacOSPolicy(dir);
		}
	});

	context.test('installer-darwin-arm64', ['darwin', 'arm64', 'installer'], async () => {
		const dir = await context.downloadAndUnpack('darwin-arm64');
		if (!context.options.downloadOnly) {
			testMacOSPolicy(dir);
		}
	});

	context.test('installer-linux-deb-arm64', ['linux', 'arm64', 'deb', 'installer'], async () => {
		const packagePath = await context.downloadTarget('linux-deb-arm64');
		if (!context.options.downloadOnly) {
			await testDebPackage(packagePath);
		}
	});

	context.test('installer-linux-deb-x64', ['linux', 'x64', 'deb', 'installer'], async () => {
		const packagePath = await context.downloadTarget('linux-deb-x64');
		if (!context.options.downloadOnly) {
			await testDebPackage(packagePath);
		}
	});

	context.test('installer-linux-rpm-arm64', ['linux', 'arm64', 'rpm', 'installer'], async () => {
		const packagePath = await context.downloadTarget('linux-rpm-arm64');
		if (!context.options.downloadOnly) {
			await testRpmPackage(packagePath);
		}
	});

	context.test('installer-linux-rpm-x64', ['linux', 'x64', 'rpm', 'installer'], async () => {
		const packagePath = await context.downloadTarget('linux-rpm-x64');
		if (!context.options.downloadOnly) {
			await testRpmPackage(packagePath);
		}
	});

	function testMacOSPolicy(dir: string) {
		const entryPoint = context.getDesktopEntryPoint(dir);
		const shimPath = path.join(path.dirname(path.dirname(entryPoint)), 'Resources', 'app', 'bin', 'copilot-shim', 'copilot');
		if (!fs.existsSync(shimPath)) {
			context.error(`Copilot shim does not exist: ${shimPath}`);
		}

		const domain = getMacOSPolicyDomain();
		if (context.run('defaults', 'read', domain, policyName).status === 0) {
			context.error(`Cannot run installer tests: the ${domain} preferences already set ${policyName}`);
		}

		const env = createShimEnvironment();
		if (runShim(shimPath, env, '--vscode-shim', 'policy').status !== 0) {
			context.error(`Cannot run installer tests: a ${policyName} policy already turns off the copilot command on this machine`);
		}
		expectPolicy(shimPath, env, false);

		context.runNoErrors('defaults', 'write', domain, policyName, '-bool', 'false');
		try {
			expectPolicy(shimPath, env, true);
		} finally {
			context.runNoErrors('defaults', 'delete', domain, policyName);
		}

		expectPolicy(shimPath, env, false);
	}

	async function testDebPackage(packagePath: string) {
		const name = context.getLinuxBinaryName();
		const shimPath = getLinuxShimPath(name);
		const env = createShimEnvironment();
		const cleanup = prepareLinuxSystem();
		try {
			if (!managesCommand(name)) {
				await context.installDeb(packagePath);
				expectCommand(noCommand, 'install of an edition that does not manage the copilot command');
				expectPolicy(shimPath, env, false);
				return;
			}

			setLinuxPolicy(false);
			await context.installDeb(packagePath);
			expectCommand(noCommand, 'install with the policy turned off');
			expectPolicy(shimPath, env, true);

			setLinuxPolicy(true);
			reconfigureDeb(name);
			expectCommand(shimPath, 'reconfigure after the policy is lifted');
			expectPolicy(commandPath, env, false);

			setLinuxPolicy(false);
			context.runNoErrors('dpkg', '-i', packagePath);
			expectCommand(noCommand, 'reinstall with the policy turned off');

			setLinuxPolicy(true);
			setDebconfAnswer(name, false);
			reconfigureDeb(name);
			expectCommand(noCommand, 'reconfigure after declining the copilot command');

			setDebconfAnswer(name, true);
			reconfigureDeb(name);
			expectCommand(shimPath, 'reconfigure after accepting the copilot command');

			fs.rmSync(commandPath);
			fs.writeFileSync(commandPath, foreignCommand, { mode: 0o755 });
			setLinuxPolicy(false);
			reconfigureDeb(name);
			expectForeignCommand('reconfigure with the policy turned off');

			setLinuxPolicy(true);
			reconfigureDeb(name);
			expectForeignCommand('reconfigure with the policy allowed');

			fs.rmSync(commandPath);
			reconfigureDeb(name);
			expectCommand(shimPath, 'reconfigure after the other copilot command is removed');

			await context.uninstallDeb();
			expectCommand(noCommand, 'uninstall');

			context.runNoErrors('dpkg', '--purge', name);
			const debconf = context.runNoErrors('debconf-show', name);
			if (debconf.stdout.includes('add-copilot-command')) {
				context.error(`Purging ${name} left the add-copilot-command debconf question behind`);
			}
		} finally {
			await context.uninstallDeb();
			context.run('dpkg', '--purge', name);
			cleanup();
		}
	}

	async function testRpmPackage(packagePath: string) {
		const name = context.getLinuxBinaryName();
		const shimPath = getLinuxShimPath(name);
		const env = createShimEnvironment();
		const cleanup = prepareLinuxSystem();
		try {
			if (!managesCommand(name)) {
				context.installRpm(packagePath);
				expectCommand(noCommand, 'install of an edition that does not manage the copilot command');
				expectPolicy(shimPath, env, false);
				return;
			}

			setLinuxPolicy(false);
			context.installRpm(packagePath);
			expectCommand(noCommand, 'install with the policy turned off');
			expectPolicy(shimPath, env, true);

			setLinuxPolicy(true);
			reinstallRpm(packagePath);
			expectCommand(shimPath, 'reinstall after the policy is lifted');
			expectPolicy(commandPath, env, false);

			setLinuxPolicy(false);
			reinstallRpm(packagePath);
			expectCommand(noCommand, 'reinstall with the policy turned off');

			setLinuxPolicy(true);
			fs.writeFileSync(commandPath, foreignCommand, { mode: 0o755 });
			reinstallRpm(packagePath);
			expectForeignCommand('reinstall with the policy allowed');

			fs.rmSync(commandPath);
			reinstallRpm(packagePath);
			expectCommand(shimPath, 'reinstall after the other copilot command is removed');

			await context.uninstallRpm();
			expectCommand(noCommand, 'uninstall');
		} finally {
			await context.uninstallRpm();
			cleanup();
		}
	}

	function getMacOSPolicyDomain(): string {
		switch (context.options.quality) {
			case 'stable':
				return 'com.microsoft.VSCode';
			case 'insider':
				return 'com.microsoft.VSCodeInsiders';
			case 'exploration':
				return 'com.microsoft.VSCodeExploration';
		}
	}

	function getLinuxShimPath(name: string): string {
		return path.join('/usr/share', name, 'bin', 'copilot-shim', 'copilot');
	}

	/**
	 * Only the stable and Insiders packages create `/usr/bin/copilot`.
	 */
	function managesCommand(name: string): boolean {
		return name === 'code' || name === 'code-insiders';
	}

	/**
	 * Checks that the tests won't overwrite a copilot command or policy on this machine,
	 * and returns a function that removes what the tests created.
	 */
	function prepareLinuxSystem(): () => void {
		if (!context.isRootUser) {
			context.error('Linux installer tests change /etc and /usr/bin, so they must run as root');
		}

		if (getCommandState() !== noCommand) {
			context.error(`Cannot run installer tests: ${commandPath} already exists`);
		}

		if (fs.existsSync(policyPath)) {
			context.error(`Cannot run installer tests: ${policyPath} already exists`);
		}

		const policyDir = path.dirname(policyPath);
		const policyDirExisted = fs.existsSync(policyDir);
		return () => {
			fs.rmSync(commandPath, { force: true });
			fs.rmSync(policyDirExisted ? policyPath : policyDir, { recursive: true, force: true });
		};
	}

	function setLinuxPolicy(allowed: boolean) {
		if (allowed) {
			context.log(`Removing ${policyPath}`);
			fs.rmSync(policyPath, { force: true });
		} else {
			context.log(`Turning off the copilot command in ${policyPath}`);
			fs.mkdirSync(path.dirname(policyPath), { recursive: true });
			fs.writeFileSync(policyPath, JSON.stringify({ [policyName]: false }));
		}
	}

	function setDebconfAnswer(name: string, value: boolean) {
		context.runNoErrors('sh', '-c', `echo "${name} ${name}/add-copilot-command boolean ${value}" | debconf-set-selections`);
	}

	function reconfigureDeb(name: string) {
		context.runNoErrors('dpkg-reconfigure', '-fnoninteractive', name);
	}

	/**
	 * Reinstalls the same package version, which runs `%post` again but not the `%postun` that removes the link.
	 */
	function reinstallRpm(packagePath: string) {
		context.runNoErrors('rpm', '-U', '--replacepkgs', packagePath);
	}

	function getCommandState(): string {
		let stat: fs.Stats;
		try {
			stat = fs.lstatSync(commandPath);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				return noCommand;
			}
			throw error;
		}
		return stat.isSymbolicLink() ? fs.readlinkSync(commandPath) : '(file)';
	}

	function expectCommand(expected: string, step: string) {
		const actual = getCommandState();
		if (actual !== expected) {
			context.error(`After ${step}, expected ${commandPath} to be ${expected}, but it is ${actual}`);
		}
		context.log(`After ${step}, ${commandPath} is ${actual} as expected`);
	}

	function expectForeignCommand(step: string) {
		expectCommand('(file)', step);
		if (fs.readFileSync(commandPath, 'utf-8') !== foreignCommand) {
			context.error(`After ${step}, the contents of ${commandPath} changed`);
		}
	}

	/**
	 * Returns an environment where the shim can't find a GitHub Copilot CLI: only system directories are on PATH,
	 * and PREFIX points the official install location at an empty directory.
	 */
	function createShimEnvironment(): NodeJS.ProcessEnv {
		return { PATH: '/usr/bin:/bin', HOME: os.homedir(), PREFIX: context.createTempDir() };
	}

	function runShim(shimPath: string, env: NodeJS.ProcessEnv, ...args: string[]) {
		context.log(`Running command: ${shimPath} ${args.join(' ')}`);
		// Supplying input gives the shim a pipe rather than a terminal, so it can't offer to install the CLI.
		return spawnSync(shimPath, args, { encoding: 'utf-8', env, input: '' });
	}

	function expectShimExit(shimPath: string, env: NodeJS.ProcessEnv, args: string[], expectedCode: number, expectedMessage?: string) {
		const result = runShim(shimPath, env, ...args);
		if (result.error !== undefined) {
			context.error(`Failed to run ${shimPath}: ${result.error.message}`);
		}

		const output = `${result.stdout}${result.stderr}`;
		if (result.status !== expectedCode || (expectedMessage !== undefined && !output.includes(expectedMessage))) {
			const expectation = expectedMessage === undefined ? `exit with code ${expectedCode}` : `exit with code ${expectedCode} and print "${expectedMessage}"`;
			context.error(`Expected ${shimPath} ${args.join(' ')} to ${expectation}, but it exited with code ${result.status}: ${output}`);
		}
	}

	function expectPolicy(shimPath: string, env: NodeJS.ProcessEnv, disabled: boolean) {
		if (disabled) {
			expectShimExit(shimPath, env, ['--vscode-shim', 'policy'], policyExitCode);
			expectShimExit(shimPath, env, ['--version'], policyExitCode, policyMessage);
		} else {
			expectShimExit(shimPath, env, ['--vscode-shim', 'policy'], 0);
			expectShimExit(shimPath, env, ['--version'], notInstalledExitCode, notFoundMessage);
		}
	}
}
