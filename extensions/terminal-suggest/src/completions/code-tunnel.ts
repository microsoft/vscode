/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import code, { codeTunnelSubcommands, commonOptions, extensionManagementOptions, troubleshootingOptions, globalTunnelOptions, tunnelHelpOptions } from './code';

export const codeTunnelOptions = [
	{
		name: '--extensions-dir',
		description: 'Set the root path for extensions',
		isRepeatable: true,
		args: {
			name: 'extensions_dir',
			isOptional: true,
		},
	},
	{
		name: '--user-data-dir',
		description: 'Specifies the directory that user data is kept in. Can be used to open multiple distinct instances of the editor',
		isRepeatable: true,
		args: {
			name: 'user_data_dir',
			isOptional: true,
		},
	},
	{
		name: '--use-version',
		description: 'Sets the editor version to use for this command. The preferred version can be persisted with `code version use <version>`. Can be \'stable\', \'insiders\', a version number, or an absolute path to an existing install',
		isRepeatable: true,
		args: {
			name: 'use_version',
			isOptional: true,
		},
	},
];

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
