/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import code, { codeTunnelSubcommands, commonOptions, extensionManagementOptions, troubleshootingOptions, globalTunnelOptions, extTunnelSubcommand, codeTunnelOptions } from './code';

const codeTunnelCompletionSpec: Fig.Spec = {
	...code,
	name: 'code-tunnel',
	subcommands: [
		...codeTunnelSubcommands,
		extTunnelSubcommand
	],
	options: [
		...commonOptions,
		...extensionManagementOptions('code-tunnel'),
		...troubleshootingOptions('code-tunnel'),
		...globalTunnelOptions,
		...codeTunnelOptions,
	]
};

export default codeTunnelCompletionSpec;
