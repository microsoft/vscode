/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { filepaths } from '../helpers/filepaths';
import { tunnelSubcommands } from './code-tunnel';

export const commonOptions: Fig.Option[] = [
	{
		name: '-',
		description: `Read from stdin (e.g. 'ps aux | grep code | code -')`,
	},
	{
		name: ['-d', '--diff'],
		description: 'Compare two files with each other',
		args: [
			{
				name: 'file',
				template: 'filepaths',
			},
			{
				name: 'file',
				template: 'filepaths',
			},
		],
	},
	{
		name: ['-m', '--merge'],
		description:
			'Perform a three-way merge by providing paths for two modified versions of a file, the common origin of both modified versions and the output file to save merge results',
		args: [
			{
				name: 'path1',
				template: 'filepaths',
			},
			{
				name: 'path2',
				template: 'filepaths',
			},
			{
				name: 'base',
				template: 'filepaths',
			},
			{
				name: 'result',
				template: 'filepaths',
			},
		],
	},
	{
		name: ['-a', '--add'],
		description: 'Add folder(s) to the last active window',
		args: {
			name: 'folder',
			template: 'folders',
			isVariadic: true,
		},
	},
	{
		name: ['-g', '--goto'],
		description:
			'Open a file at the path on the specified line and character position',
		args: {
			name: 'file:line[:character]',
			template: 'filepaths',
		},
	},
	{
		name: ['-n', '--new-window'],
		description: 'Force to open a new window',
	},
	{
		name: ['-r', '--reuse-window'],
		description: 'Force to open a file or folder in an already opened window',
	},
	{
		name: ['-w', '--wait'],
		description: 'Wait for the files to be closed before returning',
	},
	{
		name: '--locale',
		description: 'The locale to use (e.g. en-US or zh-TW)',
		args: {
			name: 'locale',
			suggestions: [
				// Supported locales: https://code.visualstudio.com/docs/getstarted/locales#_available-locales
				// allow-any-unicode-next-line
				{ name: 'en', icon: '🇺🇸', description: 'English (US)' },
				// allow-any-unicode-next-line
				{ name: 'zh-CN', icon: '🇨🇳', description: 'Simplified Chinese' },
				// allow-any-unicode-next-line
				{ name: 'zh-TW', icon: '🇹🇼', description: 'Traditional Chinese' },
				// allow-any-unicode-next-line
				{ name: 'fr', icon: '🇫🇷', description: 'French' },
				// allow-any-unicode-next-line
				{ name: 'de', icon: '🇩🇪', description: 'German' },
				// allow-any-unicode-next-line
				{ name: 'it', icon: '🇮🇹', description: 'Italian' },
				// allow-any-unicode-next-line
				{ name: 'es', icon: '🇪🇸', description: 'Spanish' },
				// allow-any-unicode-next-line
				{ name: 'ja', icon: '🇯🇵', description: 'Japanese' },
				// allow-any-unicode-next-line
				{ name: 'ko', icon: '🇰🇷', description: 'Korean' },
				// allow-any-unicode-next-line
				{ name: 'ru', icon: '🇷🇺', description: 'Russian' },
				// allow-any-unicode-next-line
				{ name: 'bg', icon: '🇧🇬', description: 'Bulgarian' },
				// allow-any-unicode-next-line
				{ name: 'hu', icon: '🇭🇺', description: 'Hungarian' },
				// allow-any-unicode-next-line
				{ name: 'pt-br', icon: '🇧🇷', description: 'Portuguese (Brazil)' },
				// allow-any-unicode-next-line
				{ name: 'tr', icon: '🇹🇷', description: 'Turkish' },
			],
		},
	},
	{
		name: '--user-data-dir',
		description:
			'Specifies the directory that user data is kept in. Can be used to open multiple distinct instances of Code',
		args: {
			name: 'dir',
			template: 'folders',
		},
	},
	{
		name: '--profile',
		description:
			'Opens the provided folder or workspace with the given profile and associates the profile with the workspace. If the profile does not exist, a new empty one is created. A folder or workspace must be provided for the profile to take effect',
		args: {
			name: 'settingsProfileName',
		},
	},
	{
		name: ['-h', '--help'],
		description: 'Print usage',
	},
	{
		name: '--locate-shell-integration-path',
		description:
			'Print the path to the shell integration script for the provided shell',
		args: {
			isOptional: false,
			name: 'shell',
			description: 'The shell to locate the integration script for',
			suggestions: [
				'bash',
				'fish',
				'pwsh',
				'zsh',
			]
		}
	}
];

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


export const extensionManagementOptions = (cliName: string): Fig.Option[] => [
	{
		name: '--extensions-dir',
		description: 'Set the root path for extensions',
		args: {
			name: 'dir',
			template: 'folders',
		},
	},
	{
		name: '--list-extensions',
		description: 'List the installed extensions',
	},
	{
		name: '--show-versions',
		description:
			'Show versions of installed extensions, when using --list-extensions',
	},
	{
		name: '--category',
		description:
			'Filters installed extensions by provided category, when using --list-extensions',
		args: {
			name: 'category',
			suggestions: [
				'azure',
				'data science',
				'debuggers',
				'extension packs',
				'education',
				'formatters',
				'keymaps',
				'language packs',
				'linters',
				'machine learning',
				'notebooks',
				'programming languages',
				'scm providers',
				'snippets',
				'testing',
				'themes',
				'visualization',
				'other',
			],
		},
	},
	{
		name: '--install-extension',
		description:
			`Installs or updates an extension. The argument is either an extension id or a path to a VSIX. The identifier of an extension is '\${ publisher }.\${ name }'. Use '--force' argument to update to latest version. To install a specific version provide '@\${version}'. For example: 'vscode.csharp@1.2.3'`,
		args: {
			name: 'extension-id[@version] | path-to-vsix',
			generators: [
				createCodeGenerators(cliName),
				filepaths({
					extensions: ['vsix'],
				}),
			],
		},
	},
	{
		name: '--pre-release',
		description:
			'Installs the pre-release version of the extension, when using --install-extension',
	},
	{
		name: '--uninstall-extension',
		description: 'Uninstalls an extension',
		args: {
			name: 'extension-id',
			generators: createCodeGenerators(cliName)
		},
	},
	{
		name: '--enable-proposed-api',
		description:
			'Enables proposed API features for extensions. Can receive one or more extension IDs to enable individually',
	},
];

export const troubleshootingOptions = (cliName: string): Fig.Option[] => [
	{
		name: ['-v', '--version'],
		description: 'Print version',
	},
	{
		name: '--verbose',
		description: 'Print verbose output (implies --wait)',
	},
	{
		name: '--log',
		description: `Log level to use. Default is 'info' when unspecified`,
		args: {
			name: 'level',
			default: 'info',
			suggestions: [
				'critical',
				'error',
				'warn',
				'info',
				'debug',
				'trace',
				'off',
			],
		},
	},
	{
		name: ['-s', '--status'],
		description: 'Print process usage and diagnostics information',
	},
	{
		name: '--prof-startup',
		description: 'Run CPU profiler during startup',
	},
	{
		name: '--disable-extensions',
		description: 'Disable all installed extensions',
	},
	{
		name: '--disable-extension',
		description: 'Disable an extension',
		args: {
			name: 'extension-id',
			generators: createCodeGenerators(cliName)
		},
	},
	{
		name: '--sync',
		description: 'Turn sync on or off',
		args: {
			name: 'sync',
			description: 'Whether to enable sync',
			suggestions: ['on', 'off'],
		},
	},
	{
		name: '--inspect-extensions',
		description:
			'Allow debugging and profiling of extensions. Check the developer tools for the connection URI',
		args: {
			name: 'port',
		},
	},
	{
		name: '--inspect-brk-extensions',
		description:
			'Allow debugging and profiling of extensions with the extension host being paused after start. Check the developer tools for the connection URI',
		args: {
			name: 'port',
		},
	},
	{
		name: '--disable-gpu',
		description: 'Disable GPU hardware acceleration',
	},
	{
		name: '--max-memory',
		description: 'Max memory size for a window (in Mbytes)',
		args: {
			name: 'memory',
			description: 'Memory in megabytes',
		},
	},
	{
		name: '--telemetry',
		description: 'Shows all telemetry events which VS code collects',
	},
];

export const buildSubcommandWithCommonOptions = (command: any) => ({
	...command,
	options: [...(command.options || []), ...commonCLIOptions]
});

const extSubcommands = [
	{
		name: 'list',
		description: 'List installed extensions',
		options: [
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
			...commonCLIOptions,
		],
	},
	{
		name: 'install',
		description: 'Install an extension',
		options: [
			{
				name: '--pre-release',
				description: 'Installs the pre-release version of the extension',
			},
			{
				name: '--donot-include-pack-and-dependencies',
				description: 'Don\'t include installing pack and dependencies of the extension',
			},
			{
				name: '--force',
				description: 'Update to the latest version of the extension if it\'s already installed',
			},
			...commonCLIOptions,
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
		options: [...commonCLIOptions],
		args: {
			name: 'ext-id',
			isVariadic: true,
			isOptional: true,
		},
	},
	{
		name: 'update',
		description: 'Update the installed extensions',
		options: [...commonCLIOptions],
	},
	buildSubcommandWithCommonOptions({
		name: 'help',
		description: 'Print this message or the help of the given subcommand(s)',
		subcommands: [
			{ name: 'list', description: 'List installed extensions' },
			{ name: 'install', description: 'Install an extension' },
			{ name: 'uninstall', description: 'Uninstall an extension' },
			{ name: 'update', description: 'Update the installed extensions' },
			{ name: 'help', description: 'Print this message or the help of the given subcommand(s)' },
		],
	}),
];


const codeSubcommands = [
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
	},
	{
		name: 'ext',
		description: 'Manage editor extensions',
		subcommands: extSubcommands,
		options: [
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
				description: 'Sets the editor version to use for this command. The preferred version can be persisted with `code version use<version>`. Can be \'stable\', \'insiders\', a version number, or an absolute path to an existing install',
				isRepeatable: true,
				args: {
					name: 'use_version',
					isOptional: true,
				},
			},
			...commonCLIOptions,
		],
	},
	{
		name: 'version',
		description: 'Changes the version of the editor you\'re using',
		subcommands: [
			{
				name: 'use',
				description: 'Switches the version of the editor in use',
				options: [
					{
						name: '--install-dir',
						description: 'The directory where the version can be found',
						isRepeatable: true,
						args: {
							name: 'install_dir',
							isOptional: true,
						},
					},
					...commonCLIOptions,
				],
				args: {
					name: 'name',
				},
			},
			{
				name: 'show',
				description: 'Shows the currently configured editor version',
				options: [...commonCLIOptions],
			},
			buildSubcommandWithCommonOptions({
				name: 'help',
				description: 'Print this message or the help of the given subcommand(s)',
				subcommands: [
					{ name: 'use', description: 'Switches the version of the editor in use' },
					{ name: 'show', description: 'Shows the currently configured editor version' },
					{ name: 'help', description: 'Print this message or the help of the given subcommand(s)' },
				],
			}),
		],
		options: [...commonCLIOptions],
	},
	{
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
		],
	},
	{
		name: 'command-shell',
		description: 'Runs the control server on process stdin/stdout',
		hidden: true,
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
				name: '--on-port',
				description: 'Listen on a host/port instead of stdin/stdout',
				isRepeatable: true,
				args: {
					name: 'on_port',
					isVariadic: true,
					isOptional: true,
				},
			},
			{
				name: '--on-host',
				description: 'Listen on a host/port instead of stdin/stdout',
				isRepeatable: true,
				args: {
					name: 'on_host',
					isOptional: true,
				},
			},
			{
				name: '--require-token',
				description: 'Require the given token string to be given in the handshake',
				isRepeatable: true,
				args: {
					name: 'require_token',
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
				name: '--on-socket',
				description: 'Listen on a socket instead of stdin/stdout',
			},
			...commonCLIOptions,
		],
	},
	{
		name: 'update',
		description: 'Updates the CLI',
		options: [
			{
				name: '--check',
				description: 'Only check for updates, without actually updating the CLI',
			},
			...commonCLIOptions,
		],
	},
	buildSubcommandWithCommonOptions({
		name: 'help',
		description: 'Print this message or the help of the given subcommand(s)',
		subcommands: [
			{
				name: 'tunnel',
				description: 'Create a tunnel that\'s accessible on vscode.dev from anywhere. Run `code tunnel --help` for more usage info',
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
			{
				name: 'ext',
				description: 'Manage editor extensions',
				subcommands: [
					{ name: 'list', description: 'List installed extensions' },
					{ name: 'install', description: 'Install an extension' },
					{ name: 'uninstall', description: 'Uninstall an extension' },
					{ name: 'update', description: 'Update the installed extensions' },
				],
			},
			{ name: 'status', description: 'Print process usage and diagnostics information' },
			{
				name: 'version',
				description: 'Changes the version of the editor you\'re using',
				subcommands: [
					{ name: 'use', description: 'Switches the version of the editor in use' },
					{ name: 'show', description: 'Shows the currently configured editor version' },
				],
			},
			{ name: 'serve-web', description: 'Runs a local web version of Code - OSS' },
			{ name: 'command-shell', description: 'Runs the control server on process stdin/stdout', hidden: true },
			{ name: 'update', description: 'Updates the CLI' },
			{ name: 'help', description: 'Print this message or the help of the given subcommand(s)' },
		],
	}),
];

export function createCodeGenerators(cliName: string): Fig.Generator {
	return {
		script: [cliName, '--list-extensions', '--show-versions'],
		postProcess: parseInstalledExtensions
	};
}

export function parseInstalledExtensions(out: string): Fig.Suggestion[] | undefined {
	const extensions = out.split('\n').filter(Boolean).map((line) => {
		const [id, version] = line.split('@');
		return {
			name: id,
			type: 'option' as Fig.SuggestionType,
			description: `Version: ${version}`
		};
	});
	return extensions;
}




const codeCompletionSpec: Fig.Spec = {
	name: 'code',
	description: 'Visual Studio Code',
	args: {
		template: ['filepaths', 'folders'],
		isVariadic: true,
	},
	options: [
		...commonCLIOptions,
		...extensionManagementOptions('code'),
		...troubleshootingOptions('code'),
	],
	subcommands: codeSubcommands,
};

export default codeCompletionSpec;

