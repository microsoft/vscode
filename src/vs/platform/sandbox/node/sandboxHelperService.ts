/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SandboxManager, type NetworkHostPattern } from '@anthropic-ai/sandbox-runtime';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { IEnvironmentService, INativeEnvironmentService } from '../../environment/common/environment.js';
import { type ISandboxPermissionRequest, type ISandboxRuntimeConfig } from '../common/sandboxHelperIpc.js';
import { ISandboxHelperService } from '../common/sandboxHelperService.js';

export class SandboxHelperService extends Disposable implements ISandboxHelperService {
	declare readonly _serviceBrand: undefined;
	private readonly _onDidRequestSandboxPermission = this._register(new Emitter<ISandboxPermissionRequest>());
	readonly onDidRequestSandboxPermission = this._onDidRequestSandboxPermission.event;
	private readonly _pendingPermissionRequests = new Map<string, (allowed: boolean) => void>();
	private readonly _tempDir: string | undefined;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
	) {
		super();
		const nativeEnvironmentService = environmentService as IEnvironmentService & Partial<INativeEnvironmentService>;
		this._tempDir = nativeEnvironmentService.tmpDir?.path;
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

	async initializeSandbox(runtimeConfig: ISandboxRuntimeConfig, _command: string): Promise<void> {
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
	}

	async wrapWithSandbox(runtimeConfig: ISandboxRuntimeConfig, command: string, envDetails?: string): Promise<string> {
		await this.initializeSandbox(runtimeConfig, command);
		return SandboxManager.wrapWithSandbox(`${envDetails ? `${envDetails} ` : ''}${command}`);
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
