/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IMcpConfiguration {
	inputs: unknown[];
	servers: Record<string, IMcpConfigurationServer>;
}

export interface IMcpConfigurationServer {
	command: string;
	args?: readonly string[];
	env?: Record<string, string | number | null>;
}
