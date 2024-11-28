/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const commonOptions: Fig.Option[] = [
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
			// TODO: Support :line[:character] completion?
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
];

const extensionManagementOptions: Fig.Option[] = [
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
			// TODO: Create extension ID generator
			name: 'extension-id[@version] | path-to-vsix',
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
			// TODO: Create extension ID generator
			name: 'extension-id',
		},
	},
	{
		name: '--enable-proposed-api',
		description:
			'Enables proposed API features for extensions. Can receive one or more extension IDs to enable individually',
	},
];

const troubleshootingOptions: Fig.Option[] = [
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
			// TODO: Create extension ID generator
			name: 'extension-id',
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

const codeCompletionSpec: Fig.Spec = {
	name: 'code',
	description: 'Visual Studio Code',
	args: {
		template: ['filepaths', 'folders'],
		isVariadic: true,
	},
	options: [
		...commonOptions,
		...extensionManagementOptions,
		...troubleshootingOptions,
	],
};

export default codeCompletionSpec;
