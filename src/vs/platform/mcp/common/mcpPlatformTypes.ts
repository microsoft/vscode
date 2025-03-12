/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IMcpConfiguration {
	inputs: unknown[];
	/** @deprecated Only for rough cross-compat with other formats */
	mcpServers?: Record<string, IMcpConfigurationServer>;
	servers: Record<string, IMcpConfigurationServer>;
}

export interface IMcpConfigurationServer {
	command: string;
	args?: readonly string[];
	env?: Record<string, string | number | null>;
}
