/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import code, { commonOptions, extensionManagementOptions, troubleshootingOptions } from './code';

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

const commonAuthOptions: Fig.Option[] = [
	{
		name: '--access-token',
		description: 'An access token to store for authentication',
		isRepeatable: true,
		args: {
			name: 'access_token',
			isOptional: true,
		},
	},
	{
		name: '--refresh-token',
		description: 'An access token to store for authentication',
		isRepeatable: true,
		args: {
			name: 'refresh_token',
			isOptional: true,
		},
	},
	{
		name: '--provider',
		description: 'The auth provider to use. If not provided, a prompt will be shown',
		isRepeatable: true,
		args: {
			name: 'provider',
			isOptional: true,
			suggestions: [
				'microsoft',
				'github',
			],
		},
	}
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
export const codeTunnelSubcommands = [{
	name: 'serve-web',
	description: 'Runs a local web version of Code - OSS',
	options: [
		{
			name: '--host',
			description: 'Host to listen on, defaults to \'localhost\'',
			isRepeatable: true,
			args: {
				name: 'host',
				isOptional: true,
			},
		},
		{
			name: '--socket-path',
			isRepeatable: true,
			args: {
				name: 'socket_path',
				isOptional: true,
			},
		},
		{
			name: '--port',
			description: 'Port to listen on. If 0 is passed a random free port is picked',
			isRepeatable: true,
			args: {
				name: 'port',
				isOptional: true,
			},
		},
		{
			name: '--connection-token',
			description: 'A secret that must be included with all requests',
			isRepeatable: true,
			args: {
				name: 'connection_token',
				isOptional: true,
			},
		},
		{
			name: '--connection-token-file',
			description: 'A file containing a secret that must be included with all requests',
			isRepeatable: true,
			args: {
				name: 'connection_token_file',
				isOptional: true,
			},
		},
		{
			name: '--server-base-path',
			description: 'Specifies the path under which the web UI and the code server is provided',
			isRepeatable: true,
			args: {
				name: 'server_base_path',
				isOptional: true,
			},
		},
		{
			name: '--server-data-dir',
			description: 'Specifies the directory that server data is kept in',
			isRepeatable: true,
			args: {
				name: 'server_data_dir',
				isOptional: true,
			},
		},
		{
			name: '--without-connection-token',
			description: 'Run without a connection token. Only use this if the connection is secured by other means',
		},
		{
			name: '--accept-server-license-terms',
			description: 'If set, the user accepts the server license terms and the server will be started without a user prompt',
		},
		...commonCLIOptions,
	]
},
{
	name: 'tunnel',
	description: 'Create a tunnel that\'s accessible on vscode.dev from anywhere.Run`code tunnel --help` for more usage info',
	subcommands: tunnelSubcommands,
	options: [
		{
			name: '--install-extension',
			description: 'Requests that extensions be preloaded and installed on connecting servers',
			isRepeatable: true,
			args: {
				name: 'install_extension',
				isOptional: true,
			},
		},
		{
			name: '--server-data-dir',
			description: 'Specifies the directory that server data is kept in',
			isRepeatable: true,
			args: {
				name: 'server_data_dir',
				isOptional: true,
			},
		},
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
			name: '--tunnel-name',
			description: 'Name you\'d like to assign preexisting tunnel to use to connect the tunnel Old option, new code should just use `--name`',
			hidden: true,
			isRepeatable: true,
			args: {
				name: 'tunnel_name',
				isOptional: true,
			},
		},
		{
			name: '--host-token',
			description: 'Token to authenticate and use preexisting tunnel',
			hidden: true,
			isRepeatable: true,
			args: {
				name: 'host_token',
				isOptional: true,
			},
		},
		{
			name: '--tunnel-id',
			description: 'ID of preexisting tunnel to use to connect the tunnel',
			hidden: true,
			isRepeatable: true,
			args: {
				name: 'tunnel_id',
				isOptional: true,
			},
		},
		{
			name: '--cluster',
			description: 'Cluster of preexisting tunnel to use to connect the tunnel',
			hidden: true,
			isRepeatable: true,
			args: {
				name: 'cluster',
				isOptional: true,
			},
		},
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
			name: '--parent-process-id',
			description: 'Optional parent process id. If provided, the server will be stopped when the process of the given pid no longer exists',
			hidden: true,
			isRepeatable: true,
			args: {
				name: 'parent_process_id',
				isOptional: true,
			},
		},
		{
			name: '--random-name',
			description: 'Randomly name machine for port forwarding service',
		},
		{
			name: '--no-sleep',
			description: 'Prevents the machine going to sleep while this command runs',
		},
		{
			name: '--accept-server-license-terms',
			description: 'If set, the user accepts the server license terms and the server will be started without a user prompt',
		},
		...commonCLIOptions,
	],
}];

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
