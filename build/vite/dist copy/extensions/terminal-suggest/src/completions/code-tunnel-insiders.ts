/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { commonOptions, extensionManagementOptions, troubleshootingOptions, globalTunnelOptions, codeTunnelSubcommands, extTunnelSubcommand, codeTunnelOptions } from './code';
import codeTunnelCompletionSpec from './code-tunnel';

const codeTunnelInsidersCompletionSpec: Fig.Spec = {
	...codeTunnelCompletionSpec,
	name: 'code-tunnel-insiders',
	description: 'Visual Studio Code Insiders',
	subcommands: [...codeTunnelSubcommands, extTunnelSubcommand],
	options: [
		...commonOptions,
		...extensionManagementOptions('code-tunnel-insiders'),
		...troubleshootingOptions('code-tunnel-insiders'),
		...globalTunnelOptions,
		...codeTunnelOptions,
	]
};

export default codeTunnelInsidersCompletionSpec;
