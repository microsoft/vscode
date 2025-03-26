/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import code, { codeTunnelSubcommands, commonOptions, extensionManagementOptions, troubleshootingOptions, globalTunnelOptions, codeTunnelOptions, tunnelHelpOptions } from './code';

export const extTunnelSubcommand = {
	name: 'ext',
	description: 'Manage editor extensions',
	subcommands: [
		{
			name: 'list',
			description: 'List installed extensions',
			options: [...globalTunnelOptions, ...tunnelHelpOptions,
			{
				name: '--category',
				description: 'Filters installed extensions by provided category, when using --list-extensions',
				isRepeatable: true,
				args: {
					name: 'category',
					isOptional: true,
				},
			},
			{
				name: '--show-versions',
				description: 'Show versions of installed extensions, when using --list-extensions',
			},
			]
		},
		{
			name: 'install',
			description: 'Install an extension',
			options: [...globalTunnelOptions, ...tunnelHelpOptions,
			{
				name: '--pre-release',
				description: 'Installs the pre-release version of the extension',
			},
			{
				name: '--donot-include-pack-and-dependencies',
				description: `Don't include installing pack and dependencies of the extension`,
			},
			{
				name: '--force',
				description: `Update to the latest version of the extension if it's already installed`,
			},
			],
			args: {
				name: 'ext-id | id',
				isVariadic: true,
				isOptional: true,
			},
		},
		{
			name: 'uninstall',
			description: 'Uninstall an extension',
			options: [...globalTunnelOptions, ...tunnelHelpOptions],
			args: {
				name: 'ext-id | id',
				isVariadic: true,
				isOptional: true,
			},
		},
		{
			name: 'update',
			description: 'Update the installed extensions',
			options: [...globalTunnelOptions, ...tunnelHelpOptions]
		},
	],
	...globalTunnelOptions,
	...codeTunnelOptions
};

const codeTunnelCompletionSpec: Fig.Spec = {
	...code,
	name: 'code-tunnel',
	description: 'Create a tunnel that\'s accessible on vscode.dev from anywhere.',
	subcommands: [
		...codeTunnelSubcommands,
		extTunnelSubcommand
	],
	options: [
		...commonOptions,
		...extensionManagementOptions('code-tunnel'),
		...troubleshootingOptions('code-tunnel'),
		...globalTunnelOptions,
		...codeTunnelOptions
	]
};

export default codeTunnelCompletionSpec;
