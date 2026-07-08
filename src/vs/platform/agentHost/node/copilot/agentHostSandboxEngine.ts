/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { FileAccess } from '../../../../base/common/network.js';
import { dirname } from '../../../../base/common/path.js';
import { OS, OperatingSystem } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { createHash } from 'crypto';
import { IEnvironmentService, INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { IProductService } from '../../../product/common/productService.js';
import { ISandboxHelperService, type ISandboxDependencyStatus, type IWindowsMxcPolicyContainment, type IWindowsMxcSandboxPolicy } from '../../../sandbox/common/sandboxHelperService.js';
import { ITerminalSandboxEngineHost, ITerminalSandboxRuntimeInfo, TerminalSandboxEngine } from '../../../sandbox/common/terminalSandboxEngine.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { AgentHostSandboxConfigKey, sandboxConfigSchema, sandboxSettingIdToAgentHostKey } from '../../common/sandboxConfigSchema.js';

/** Subdirectory under the user home + product data folder where the engine creates its temp dir. */
const SANDBOX_TEMP_DIR_NAME = 'tmp';

/**
 * Host adapter that bridges agent-host environment data into the shared
 * {@link TerminalSandboxEngine}. One instance per session, wired up via
 * {@link createAgentHostSandboxEngine}.
 */
class AgentHostTerminalSandboxHost implements ITerminalSandboxEngineHost {
	readonly onDidChangeRoots = Event.None;
	readonly onDidChangeSandboxSettings: Event<void>;
	private readonly _sandboxHelper: ISandboxHelperService;

	constructor(
		private readonly _sessionId: string,
		private readonly _workingDirectory: URI | undefined,
		private readonly _environmentService: INativeEnvironmentService,
		private readonly _productService: IProductService,
		private readonly _agentConfigurationService: IAgentConfigurationService,
		sandboxHelper: ISandboxHelperService,
	) {
		this._sandboxHelper = sandboxHelper;
		this.onDidChangeSandboxSettings = this._agentConfigurationService.onDidRootConfigChange;
	}

	async getOS(): Promise<OperatingSystem> {
		return OS;
	}

	async getRuntimeInfo(): Promise<ITerminalSandboxRuntimeInfo> {
		const appRoot = dirname(FileAccess.asFileUri('').path);
		const runAsNode = !!process.versions['electron'];
		// In a packaged build the native binaries (ripgrep-universal, mxc-sdk) are
		// unpacked from the archive into `node_modules.asar.unpacked`; in dev they
		// remain in plain `node_modules`.
		const nativeModulesDir = this._environmentService.isBuilt ? 'node_modules.asar.unpacked' : 'node_modules';
		return { appRoot, execPath: process.execPath, runAsNode, nativeModulesDir };
	}

	async getUserHome(): Promise<URI | undefined> {
		return this._environmentService.userHome;
	}

	async getSandboxTempDir(): Promise<URI | undefined> {
		const userHome = this._environmentService.userHome;
		if (!userHome) {
			return undefined;
		}
		const sandboxRoot = URI.joinPath(userHome, this._productService.dataFolderName, SANDBOX_TEMP_DIR_NAME);
		// Keep the per-session leaf short and bounded: the sandbox runtime
		// creates its network-bridge UNIX sockets (e.g. `claude-socks-<id>.sock`,
		// ~35 bytes) directly under this directory, and the full socket path must
		// stay within the AF_UNIX 108-byte limit. The raw session id is a URI
		// segment (often a UUID), so hash it to a short hex string instead. A
		// 64-bit SHA-256 prefix (16 hex chars) keeps the leaf short and
		// collisions infeasible.
		const digest = createHash('sha256').update(this._sessionId).digest('hex');
		const sessionLeaf = `agenthost_${digest.substring(0, 16)}`;
		return URI.joinPath(sandboxRoot, sessionLeaf);
	}

	async getWorkspaceStorageReadRoot(): Promise<URI | undefined> {
		// The agent host has no workspace-storage equivalent today.
		return undefined;
	}

	getWriteRoots(): readonly URI[] {
		return this._workingDirectory ? [this._workingDirectory] : [];
	}

	async checkSandboxDependencies(): Promise<ISandboxDependencyStatus | undefined> {
		return this._sandboxHelper.checkSandboxDependencies();
	}

	async getWindowsMxcFilesystemPolicy() {
		return this._sandboxHelper.getWindowsMxcFilesystemPolicy();
	}

	async getWindowsMxcEnvironment() {
		return this._sandboxHelper.getWindowsMxcEnvironment();
	}

	async buildWindowsMxcSandboxPayload(commandLine: string, policy: IWindowsMxcSandboxPolicy, workingDirectory?: string, containerName?: string, containment?: IWindowsMxcPolicyContainment) {
		return this._sandboxHelper.buildWindowsMxcSandboxPayload(commandLine, policy, workingDirectory, containerName, containment);
	}

	getSandboxSetting<T>(settingId: string): T | undefined {
		// The agent host stores sandbox settings nested under a single
		// top-level `sandbox` object with prefix-free sub-keys (e.g.
		// `sandbox.enabled` rather than `chat.agent.sandbox.enabled`). Map
		// from the engine's modern setting ID into that sub-key namespace;
		// unknown IDs (which include all deprecated keys — handled host-side
		// by the workbench client) resolve to undefined.
		const innerKey = sandboxSettingIdToAgentHostKey[settingId];
		if (innerKey === undefined) {
			return undefined;
		}
		const sandbox = this._agentConfigurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox);
		return sandbox?.[innerKey] as T | undefined;
	}
}

/**
 * Construct a per-session {@link TerminalSandboxEngine} for the agent host.
 * The returned engine is registered with the caller's instantiation service
 * but the caller is responsible for disposing it (typically by registering it
 * alongside the per-session {@link ShellManager}).
 */
export function createAgentHostSandboxEngine(
	instantiationService: IInstantiationService,
	environmentService: IEnvironmentService,
	productService: IProductService,
	agentConfigurationService: IAgentConfigurationService,
	sandboxHelper: ISandboxHelperService,
	sessionId: string,
	workingDirectory: URI | undefined,
): TerminalSandboxEngine {
	const host = new AgentHostTerminalSandboxHost(sessionId, workingDirectory, environmentService as INativeEnvironmentService, productService, agentConfigurationService, sandboxHelper);
	return instantiationService.createInstance(TerminalSandboxEngine, host);
}

