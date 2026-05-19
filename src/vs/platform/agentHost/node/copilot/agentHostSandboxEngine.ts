/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { FileAccess } from '../../../../base/common/network.js';
import { dirname } from '../../../../base/common/path.js';
import { OS, OperatingSystem } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../../environment/common/environment.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { IProductService } from '../../../product/common/productService.js';
import type { ISandboxDependencyStatus, ISandboxHelperService } from '../../../sandbox/common/sandboxHelperService.js';
import { SandboxHelperService } from '../../../sandbox/node/sandboxHelper.js';
import { ITerminalSandboxEngineHost, ITerminalSandboxRuntimeInfo, TerminalSandboxEngine } from '../../../sandbox/common/terminalSandboxEngine.js';

/** Subdirectory under the user home + product data folder where the engine creates its temp dir. */
const SANDBOX_TEMP_DIR_NAME = 'tmp';

/**
 * Host adapter that bridges agent-host environment data into the shared
 * {@link TerminalSandboxEngine}. One instance per session, wired up via
 * {@link createAgentHostSandboxEngine}.
 */
class AgentHostTerminalSandboxHost implements ITerminalSandboxEngineHost {
	readonly onDidChangeRoots = Event.None;
	private readonly _sandboxHelper: ISandboxHelperService;

	constructor(
		private readonly _sessionId: string,
		private readonly _workingDirectory: URI | undefined,
		private readonly _environmentService: INativeEnvironmentService,
		private readonly _productService: IProductService,
	) {
		// `ISandboxHelperService` is not registered in the agent host DI container,
		// so construct the node implementation directly. The helper just probes for
		// bubblewrap / sandbox-exec binaries on the local machine.
		this._sandboxHelper = new SandboxHelperService();
	}

	async getOS(): Promise<OperatingSystem> {
		return OS;
	}

	async getRuntimeInfo(): Promise<ITerminalSandboxRuntimeInfo> {
		const appRoot = dirname(FileAccess.asFileUri('').path);
		const runAsNode = !!process.versions['electron'];
		return { appRoot, execPath: process.execPath, runAsNode };
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
		return URI.joinPath(sandboxRoot, `agenthost_${this._sessionId}`);
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
	sessionId: string,
	workingDirectory: URI | undefined,
): TerminalSandboxEngine {
	const host = new AgentHostTerminalSandboxHost(sessionId, workingDirectory, environmentService as INativeEnvironmentService, productService);
	return instantiationService.createInstance(TerminalSandboxEngine, host);
}
