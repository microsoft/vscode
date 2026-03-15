/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const SandboxHelperChannelName = 'SandboxHelper';

export interface ISandboxNetworkHostPattern {
	readonly host: string;
	readonly port: number | undefined;
}

export interface ISandboxNetworkConfig {
	readonly allowedDomains?: string[];
	readonly deniedDomains?: string[];
	readonly allowUnixSockets?: string[];
	readonly allowAllUnixSockets?: boolean;
	readonly allowLocalBinding?: boolean;
	readonly httpProxyPort?: number;
	readonly socksProxyPort?: number;
}

export interface ISandboxFilesystemConfig {
	readonly denyRead?: string[];
	readonly allowWrite?: string[];
	readonly denyWrite?: string[];
	readonly allowGitConfig?: boolean;
}

export interface ISandboxRuntimeConfig {
	readonly network?: ISandboxNetworkConfig;
	readonly filesystem?: ISandboxFilesystemConfig;
	readonly ignoreViolations?: Record<string, string[]>;
	readonly enableWeakerNestedSandbox?: boolean;
	readonly ripgrep?: {
		readonly command: string;
		readonly args?: string[];
	};
	readonly mandatoryDenySearchDepth?: number;
	readonly allowPty?: boolean;
}

export interface ISandboxPermissionRequest extends ISandboxNetworkHostPattern {
	readonly requestId: string;
}
