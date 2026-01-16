/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Local type definition for sandbox runtime configuration to avoid importing external package
 * in the common layer. The actual type should match @anthropic-ai/sandbox-runtime.
 */
export interface ITerminalSandboxRuntimeConfig {
	network?: {
		allowedDomains?: string[];
		deniedDomains?: string[];
	};
	filesystem?: {
		denyRead?: string[];
		allowWrite?: string[];
		denyWrite?: string[];
	};
}

export interface ITerminalSandboxSettings extends ITerminalSandboxRuntimeConfig {
	enabled?: boolean;
}
