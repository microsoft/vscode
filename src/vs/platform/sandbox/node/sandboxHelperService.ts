/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SandboxManager, type NetworkHostPattern } from '@anthropic-ai/sandbox-runtime';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { dirname, posix, win32 } from '../../../base/common/path.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogService } from '../../log/common/log.js';
import { type ISandboxPermissionRequest, type ISandboxRuntimeConfig } from '../common/sandboxHelperIpc.js';
import { ISandboxHelperService } from '../common/sandboxHelperService.js';

export class SandboxHelperService extends Disposable implements ISandboxHelperService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidRequestSandboxPermission = this._register(new Emitter<ISandboxPermissionRequest>());
	readonly onDidRequestSandboxPermission = this._onDidRequestSandboxPermission.event;
	private readonly _pendingPermissionRequests = new Map<string, (allowed: boolean) => void>();
	private readonly _rgPath: string | undefined;
	private readonly _tempDir: string | undefined;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService,
	) {
		super();
		const nativeEnvironmentService = environmentService as IEnvironmentService & Partial<INativeEnvironmentService>;
		this._rgPath = nativeEnvironmentService.appRoot
			? this._pathJoin(nativeEnvironmentService.appRoot, 'node_modules', '@vscode', 'ripgrep', 'bin', 'rg')
			: undefined;
		this._tempDir = nativeEnvironmentService.tmpDir?.path;
		logService.debug('SandboxHelperService#constructor ripgrep path configured', !!this._rgPath);
	}

	async resolveSandboxPermissionRequest(requestId: string, allowed: boolean): Promise<void> {
		const resolver = this._pendingPermissionRequests.get(requestId);
		if (!resolver) {
			throw new Error(`No pending sandbox permission request with id ${requestId}`);
		}
		this._pendingPermissionRequests.delete(requestId);
		resolver(allowed);
	}

	async resetSandbox(): Promise<void> {
		await SandboxManager.reset();
	}

	async wrapWithSandbox(runtimeConfig: ISandboxRuntimeConfig, command: string): Promise<string> {
		const normalizedRuntimeConfig = {
			network: {
				// adding at least one domain or else the sandbox doesnt do any proxy setup.
				allowedDomains: runtimeConfig.network?.allowedDomains?.length ? [...runtimeConfig.network.allowedDomains] : ['microsoft.com'],
				deniedDomains: [...(runtimeConfig.network?.deniedDomains ?? [])],
				allowUnixSockets: runtimeConfig.network?.allowUnixSockets ? [...runtimeConfig.network.allowUnixSockets] : undefined,
				allowAllUnixSockets: runtimeConfig.network?.allowAllUnixSockets,
				allowLocalBinding: runtimeConfig.network?.allowLocalBinding,
				httpProxyPort: runtimeConfig.network?.httpProxyPort,
				socksProxyPort: runtimeConfig.network?.socksProxyPort,
			},
			filesystem: {
				denyRead: [...(runtimeConfig.filesystem?.denyRead ?? [])],
				allowWrite: [
					...(runtimeConfig.filesystem?.allowWrite ?? []),
					...(this._tempDir ? [this._tempDir] : []),
				],
				denyWrite: [...(runtimeConfig.filesystem?.denyWrite ?? [])],
				allowGitConfig: runtimeConfig.filesystem?.allowGitConfig,
			},
			ignoreViolations: runtimeConfig.ignoreViolations,
			enableWeakerNestedSandbox: runtimeConfig.enableWeakerNestedSandbox,
			ripgrep: runtimeConfig.ripgrep ? {
				command: runtimeConfig.ripgrep.command,
				args: runtimeConfig.ripgrep?.args ? [...runtimeConfig.ripgrep.args] : undefined,
			} : undefined,
			mandatoryDenySearchDepth: runtimeConfig.mandatoryDenySearchDepth,
			allowPty: runtimeConfig.allowPty,
		};
		await SandboxManager.initialize(normalizedRuntimeConfig, request => this._requestSandboxPermission(request));
		return SandboxManager.wrapWithSandbox(`${this._getSandboxEnvironmentPrefix()} ${command}`);
	}

	private _getSandboxEnvironmentPrefix(): string {
		const env: string[] = ['NODE_USE_ENV_PROXY=1'];

		if (this._tempDir) {
			env.push(this._toEnvironmentAssignment('TMPDIR', this._tempDir));
		}

		const pathWithRipgrep = this._getPathWithRipgrepDir();
		if (pathWithRipgrep) {
			env.push(this._toEnvironmentAssignment('PATH', pathWithRipgrep));
		}

		return env.join(' ');
	}

	private _getPathWithRipgrepDir(): string | undefined {
		if (!this._rgPath) {
			return undefined;
		}

		const rgDir = dirname(this._rgPath);
		const currentPath = process.env['PATH'];
		const path = process.platform === 'win32' ? win32 : posix;
		return currentPath ? `${currentPath}${path.delimiter}${rgDir}` : rgDir;
	}

	private _toEnvironmentAssignment(name: string, value: string): string {
		return `${name}="${value}"`;
	}

	private _pathJoin(...segments: string[]): string {
		const path = process.platform === 'win32' ? win32 : posix;
		return path.join(...segments);
	}

	private _requestSandboxPermission(request: NetworkHostPattern): Promise<boolean> {
		const requestId = generateUuid();

		return new Promise<boolean>(resolve => {
			this._pendingPermissionRequests.set(requestId, resolve);
			this._onDidRequestSandboxPermission.fire({
				requestId,
				host: request.host,
				port: request.port,
			});
		});
	}
}
