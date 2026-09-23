/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename, dirname } from '../../../../base/common/path.js';
import { OS, OperatingSystem } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { createHash } from 'crypto';
import { IEnvironmentService, INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { IProductService } from '../../../product/common/productService.js';
import { ISandboxHelperService, type ISandboxDependencyStatus, type IWindowsMxcPolicyContainment, type IWindowsMxcSandboxPolicy } from '../../../sandbox/common/sandboxHelperService.js';
import { ITerminalSandboxEngineHost, ITerminalSandboxRuntimeInfo, TerminalSandboxEngine } from '../../../sandbox/common/terminalSandboxEngine.js';
import { IAgentConfigurationService } from '../agentConfigurationService.js';
import { getAppNodeModulesUri } from '../appNodeModules.js';
import { AgentHostSandboxConfigKey, sandboxConfigSchema, sandboxSettingIdToAgentHostKey } from '../../common/sandboxConfigSchema.js';
import { getSessionSandboxOverrides } from '../sessionSandbox.js';
import { resolveAgentHostSession } from '../../common/agentHostSubscriptionService.js';

/** Subdirectory under the user home + product data folder where the engine creates its temp dir. */
const SANDBOX_TEMP_DIR_NAME = 'tmp';

/**
 * Host adapter that bridges agent-host environment data into the shared
 * {@link TerminalSandboxEngine}. One instance per session, wired up via
 * {@link AgentHostSandboxEngine}.
 */
class AgentHostTerminalSandboxHost extends Disposable implements ITerminalSandboxEngineHost {
	private readonly _onDidChangeRoots = this._register(new Emitter<void>());
	readonly onDidChangeRoots = this._onDidChangeRoots.event;
	readonly onDidChangeSandboxSettings: Event<void>;
	private readonly _sandboxHelper: ISandboxHelperService;

	constructor(
		private readonly _sessionId: string,
		private _workingDirectory: URI | undefined,
		private readonly _environmentService: INativeEnvironmentService,
		private readonly _productService: IProductService,
		private readonly _agentConfigurationService: IAgentConfigurationService,
		sandboxHelper: ISandboxHelperService,
	) {
		super();
		this._sandboxHelper = sandboxHelper;
		this.onDidChangeSandboxSettings = Event.any(
			this._agentConfigurationService.onDidRootConfigChange,
			Event.map(Event.filter(this._agentConfigurationService.onDidSessionConfigChange, event => event.session === resolveAgentHostSession(URI.parse(this._sessionId)).toString()), () => undefined),
		);
	}

	setWorkingDirectory(workingDirectory: URI): void {
		this._workingDirectory = workingDirectory;
		this._onDidChangeRoots.fire();
	}

	async getOS(): Promise<OperatingSystem> {
		return OS;
	}

	async getRuntimeInfo(): Promise<ITerminalSandboxRuntimeInfo> {
		const nodeModulesUri = getAppNodeModulesUri();
		const appRoot = dirname(nodeModulesUri.fsPath);
		const runAsNode = !!process.versions['electron'];
		const nativeModulesDir = basename(nodeModulesUri.fsPath);
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
		// from the engine's setting ID into that sub-key namespace.
		const innerKey = sandboxSettingIdToAgentHostKey[settingId];
		if (innerKey === undefined) {
			return undefined;
		}
		const sandbox = {
			...this._agentConfigurationService.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox),
			...getSessionSandboxOverrides(this._agentConfigurationService, this._sessionId),
		};
		return sandbox?.[innerKey] as T | undefined;
	}
}

/** Owns the terminal sandbox engine and its mutable Agent Host adapter. */
export class AgentHostSandboxEngine extends Disposable {
	readonly engine: TerminalSandboxEngine;
	private readonly _host: AgentHostTerminalSandboxHost;

	constructor(
		sessionId: string,
		workingDirectory: URI | undefined,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IProductService productService: IProductService,
		@IAgentConfigurationService agentConfigurationService: IAgentConfigurationService,
		@ISandboxHelperService sandboxHelper: ISandboxHelperService,
	) {
		super();
		this._host = new AgentHostTerminalSandboxHost(sessionId, workingDirectory, environmentService as INativeEnvironmentService, productService, agentConfigurationService, sandboxHelper);
		this.engine = instantiationService.createInstance(TerminalSandboxEngine, this._host);
		this._register(this.engine);
		this._register(this._host);
	}

	setWorkingDirectory(workingDirectory: URI): void {
		this._host.setWorkingDirectory(workingDirectory);
	}
}
