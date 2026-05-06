/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IAuthenticationService } from '../../../../../platform/authentication/common/authentication';
import { IConfigurationService } from '../../../../../platform/configuration/common/configurationService';
import { IEnvService } from '../../../../../platform/env/common/envService';
import { IVSCodeExtensionContext } from '../../../../../platform/extContext/common/extensionContext';
import { LogServiceImpl } from '../../../../../platform/log/common/logService';
import { mock } from '../../../../../util/common/test/simpleMock';
import { IInstantiationService } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotCLISDK } from '../copilotCli';

type CopilotSdkModule = typeof import('@github/copilot/sdk');

class TestExtensionContext extends mock<IVSCodeExtensionContext>() {
	public override readonly workspaceState = {
		get: () => ({}),
		update: async () => { },
		keys: () => []
	};

	constructor(public override readonly extensionPath: string) {
		super();
	}
}

class TestEnvService extends mock<IEnvService>() {
	constructor(public override readonly appRoot: string) {
		super();
	}
}

class TestAuthenticationService extends mock<IAuthenticationService>() { }
class TestConfigurationService extends mock<IConfigurationService>() { }
class TestInstantiationService extends mock<IInstantiationService>() { }

class TestCopilotCLISDK extends CopilotCLISDK {
	protected override async ensureShims(): Promise<void> {
		return;
	}

	public runEnsureShims(): Promise<void> {
		return super.ensureShims();
	}

	public override async getPackage(): Promise<CopilotSdkModule> {
		throw new Error('SDK import is disabled in shim tests');
	}
}

describe('Copilot CLI shims', () => {
	let testDir: string;
	const logService = new LogServiceImpl([]);

	beforeEach(async () => {
		testDir = await mkdtemp(join(tmpdir(), 'copilot-cli-shims-'));
	});

	afterEach(async () => {
		await rm(testDir, { recursive: true, force: true });
	});

	function createSdk(extensionPath: string, vscodeAppRoot: string): TestCopilotCLISDK {
		return new TestCopilotCLISDK(
			new TestExtensionContext(extensionPath),
			new TestEnvService(vscodeAppRoot),
			logService,
			new TestInstantiationService(),
			new TestAuthenticationService(),
			new TestConfigurationService()
		);
	}

	it('creates runtime ripgrep and node-pty shims for separate extension installs before SDK import', async () => {
		const extensionPath = join(testDir, 'extension');
		const vscodeAppRoot = join(testDir, 'app');
		// Marketplace/VSIX installs live outside VS Code's app tree. In that route the SDK
		// cannot rely on the built-in extension packaging marker, so runtime setup copies
		// both native dependencies from VS Code's appRoot into the extension's SDK layout.
		const ripgrepSourceDir = join(vscodeAppRoot, 'node_modules', '@vscode', 'ripgrep', 'bin');
		const nodePtySourceDir = join(vscodeAppRoot, 'node_modules', 'node-pty', 'prebuilds', process.platform + '-' + process.arch);
		await mkdir(ripgrepSourceDir, { recursive: true });
		await mkdir(nodePtySourceDir, { recursive: true });
		await writeFile(join(ripgrepSourceDir, 'rg'), 'ripgrep');
		await writeFile(join(nodePtySourceDir, 'pty.node'), 'native-binary');
		await writeFile(join(nodePtySourceDir, 'spawn-helper'), 'spawn-helper');

		await createSdk(extensionPath, vscodeAppRoot).runEnsureShims();

		await expect(readFile(join(extensionPath, 'node_modules', '@github', 'copilot', 'shims.txt'), 'utf8')).resolves.toBe('Shims created successfully');
		const sdkRipgrepDir = join(extensionPath, 'node_modules', '@github', 'copilot', 'sdk', 'ripgrep', 'bin', process.platform + '-' + process.arch);
		await expect(readFile(join(sdkRipgrepDir, 'rg'), 'utf8')).resolves.toBe('ripgrep');
		const sdkNodePtyDir = join(extensionPath, 'node_modules', '@github', 'copilot', 'sdk', 'prebuilds', process.platform + '-' + process.arch);
		await expect(readFile(join(sdkNodePtyDir, 'pty.node'), 'utf8')).resolves.toBe('native-binary');
		await expect(readFile(join(sdkNodePtyDir, 'spawn-helper'), 'utf8')).resolves.toBe('spawn-helper');
	});

	it('skips runtime node-pty shimming for bundled installs when shims.txt already exists', async () => {
		const extensionPath = join(testDir, 'extension');
		const vscodeAppRoot = join(testDir, 'app');
		const placeholder = join(extensionPath, 'node_modules', '@github', 'copilot', 'shims.txt');
		// Built-in packaging materializes only the ripgrep shim and writes this marker.
		// Runtime ensureShims then returns before copying node-pty; the bundled/core route
		// resolves node-pty from VS Code's own app tree instead of an SDK prebuild copy.
		await mkdir(join(extensionPath, 'node_modules', '@github', 'copilot'), { recursive: true });
		await writeFile(placeholder, 'already created');

		await createSdk(extensionPath, vscodeAppRoot).runEnsureShims();

		await expect(readFile(placeholder, 'utf8')).resolves.toBe('already created');
		await expect(stat(join(extensionPath, 'node_modules', '@github', 'copilot', 'sdk'))).rejects.toMatchObject({ code: 'ENOENT' });
	});
});
