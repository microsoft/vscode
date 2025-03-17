/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import code, { commonOptions, commonAuthOptions, extensionManagementOptions, troubleshootingOptions } from './code';

export const commonCLIOptions: Fig.Option[] = [
	{
		name: '--cli-data-dir',
		description: 'Directory where CLI metadata should be stored',
		isRepeatable: true,
		args: {
			name: 'cli_data_dir',
			isOptional: true,
		},
	},
	{
		name: '--log-to-file',
		description: 'Log to a file in addition to stdout. Used when running as a service',
		hidden: true,
		isRepeatable: true,
		args: {
			name: 'log_to_file',
			isOptional: true,
			template: 'filepaths',
		},
	},
	{
		name: '--log',
		description: 'Log level to use',
		isRepeatable: true,
		args: {
			name: 'log',
			isOptional: true,
			suggestions: [
				'trace',
				'debug',
				'info',
				'warn',
				'error',
				'critical',
				'off',
			],
		},
	},
	{
		name: '--telemetry-level',
		description: 'Sets the initial telemetry level',
		hidden: true,
		isRepeatable: true,
		args: {
			name: 'telemetry_level',
			isOptional: true,
			suggestions: [
				'off',
				'crash',
				'error',
				'all',
			],
		},
	},
	{
		name: '--verbose',
		description: 'Print verbose output (implies --wait)',
	},
	{
		name: '--disable-telemetry',
		description: 'Disable telemetry for the current command, even if it was previously accepted as part of the license prompt or specified in \'--telemetry-level\'',
	},
	{
		name: ['-h', '--help'],
		description: 'Print help',
	},
];

const tunnelSubcommands: Fig.Subcommand[] = [
	{
		name: 'prune',
		description: 'Delete all servers which are currently not running',
		options: commonCLIOptions,
	},
	{
		name: 'kill',
		description: 'Stops any running tunnel on the system',
		options: commonCLIOptions,
	},
	{
		name: 'restart',
		description: 'Restarts any running tunnel on the system',
		options: commonCLIOptions,
	},
	{
		name: 'status',
		description: 'Gets whether there is a tunnel running on the current machine',
		options: commonCLIOptions,
	},
	{
		name: 'rename',
		description: 'Rename the name of this machine associated with port forwarding service',
		options: commonCLIOptions,
		args: {
			name: 'name',
		},
	},
	{
		name: 'status',
		description: 'Print process usage and diagnostics information',
		options: commonCLIOptions,
	},
	{
		name: 'unregister',
		description: 'Remove this machine\'s association with the port forwarding service',
		options: commonCLIOptions,
	},
	{
		name: 'user',
		subcommands: [
			{
				name: 'login',
				description: 'Log in to port forwarding service',
				options: [...commonAuthOptions, ...commonCLIOptions],
			},
			{
				name: 'logout',
				description: 'Log out of port forwarding service',
				options: commonCLIOptions,
			},
			{
				name: 'show',
				description: 'Show the account that\'s logged into port forwarding service',
				options: commonCLIOptions,
			},
			{
				name: 'help',
				description: 'Print this message or the help of the given subcommand(s)',
				subcommands: [
					{ name: 'login', description: 'Log in to port forwarding service' },
					{ name: 'logout', description: 'Log out of port forwarding service' },
					{ name: 'show', description: 'Show the account that\'s logged into port forwarding service' },
					{ name: 'help', description: 'Print this message or the help of the given subcommand(s)' },
				],
				options: commonCLIOptions,
			},
		],
		options: commonCLIOptions,
	},
	{
		name: 'service',
		description: '(Preview) Manages the tunnel when installed as a system service,',
		subcommands: [
			{
				name: 'install',
				description: 'Installs or re-installs the tunnel service on the machine',
				options: [
					{
						name: '--name',
						description: 'Sets the machine name for port forwarding service',
						isRepeatable: true,
						args: {
							name: 'name',
							isOptional: true,
						},
					},
					{
						name: '--accept-server-license-terms',
						description: 'If set, the user accepts the server license terms and the server will be started without a user prompt',
					},
					...commonCLIOptions,
				],
			},
			{
				name: 'uninstall',
				description: 'Uninstalls and stops the tunnel service',
				options: commonCLIOptions,
			},
			{
				name: 'log',
				description: 'Shows logs for the running service',
				options: commonCLIOptions,
			},
			{
				name: 'internal-run',
				description: 'Internal command for running the service',
				hidden: true,
				options: commonCLIOptions,
			},
			{
				name: 'help',
				description: 'Print this message or the help of the given subcommand(s)',
				subcommands: [
					{ name: 'install', description: 'Installs or re-installs the tunnel service on the machine' },
					{ name: 'uninstall', description: 'Uninstalls and stops the tunnel service' },
					{ name: 'log', description: 'Shows logs for the running service' },
					{ name: 'internal-run', description: 'Internal command for running the service', hidden: true },
					{ name: 'help', description: 'Print this message or the help of the given subcommand(s)' },
				],
				options: commonCLIOptions
			},
		],
		options: commonCLIOptions,
	},
	{
		name: 'forward-internal',
		description: '(Preview) Forwards local port using the dev tunnel',
		hidden: true,
		options: [...commonAuthOptions, ...commonCLIOptions],
		args: {
			name: 'ports',
			isVariadic: true,
			isOptional: true,
		},
	},
	{
		name: 'help',
		description: 'Print this message or the help of the given subcommand(s)',
		subcommands: [
			{ name: 'prune', description: 'Delete all servers which are currently not running' },
			{ name: 'kill', description: 'Stops any running tunnel on the system' },
			{ name: 'restart', description: 'Restarts any running tunnel on the system' },
			{ name: 'status', description: 'Gets whether there is a tunnel running on the current machine' },
			{ name: 'rename', description: 'Rename the name of this machine associated with port forwarding service' },
			{ name: 'unregister', description: 'Remove this machine\'s association with the port forwarding service' },
			{
				name: 'user',
				subcommands: [
					{ name: 'login', description: 'Log in to port forwarding service' },
					{ name: 'logout', description: 'Log out of port forwarding service' },
					{ name: 'show', description: 'Show the account that\'s logged into port forwarding service' },
				],
			},
			{
				name: 'service',
				description: '(Preview) Manages the tunnel when installed as a system service,',
				subcommands: [
					{ name: 'install', description: 'Installs or re-installs the tunnel service on the machine' },
					{ name: 'uninstall', description: 'Uninstalls and stops the tunnel service' },
					{ name: 'log', description: 'Shows logs for the running service' },
					{ name: 'internal-run', description: 'Internal command for running the service', hidden: true },
				],
			},
			{ name: 'forward-internal', description: '(Preview) Forwards local port using the dev tunnel', hidden: true },
			{ name: 'help', description: 'Print this message or the help of the given subcommand(s)' },
		],
	},
];

const codeTunnelCompletionSpec: Fig.Spec = {
	...code,
	name: 'code-tunnel',
	description: 'Create a tunnel that\'s accessible on vscode.dev from anywhere.',
	subcommands: tunnelSubcommands,
	options: [
		...commonOptions,
		...extensionManagementOptions('code-tunnel'),
		...troubleshootingOptions('code-tunnel'),
		{
			name: '--cli-data-dir',
			description: 'Directory where CLI metadata should be stored',
			isRepeatable: true,
			args: {
				name: 'cli_data_dir',
				isOptional: true,
			},
		},
		{
			name: '--log-to-file',
			description: 'Log to a file in addition to stdout. Used when running as a service',
			hidden: true,
			isRepeatable: true,
			args: {
				name: 'log_to_file',
				isOptional: true,
				template: 'filepaths',
			},
		},

		{
			name: '--telemetry-level',
			description: 'Sets the initial telemetry level',
			hidden: true,
			isRepeatable: true,
			args: {
				name: 'telemetry_level',
				isOptional: true,
				suggestions: [
					'off',
					'crash',
					'error',
					'all',
				],
			},
		},
	]
};

export default codeTunnelCompletionSpec;
