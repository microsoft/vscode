/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import code, { codeTunnelSubcommands, commonOptions, extensionManagementOptions, troubleshootingOptions, globalTunnelOptions } from './code';

const codeTunnelCompletionSpec: Fig.Spec = {
	...code,
	name: 'code-tunnel',
	description: 'Create a tunnel that\'s accessible on vscode.dev from anywhere.',
	subcommands: [
		...codeTunnelSubcommands,
		{
			name: 'ext',
			description: 'Manage editor extensions',
			subcommands: [
				{
					name: 'list',
					description: 'List installed extensions',
				},
				{
					name: 'install',
					description: 'Install an extension',
				},
				{
					name: 'uninstall',
					description: 'Uninstall an extension',
				},
				{
					name: 'update',
					description: 'Update the installed extensions',
				},
			],
			...globalTunnelOptions
		}
	],
	options: [
		...commonOptions,
		...extensionManagementOptions('code-tunnel'),
		...troubleshootingOptions('code-tunnel'),
		...globalTunnelOptions
	]
};

export default codeTunnelCompletionSpec;
