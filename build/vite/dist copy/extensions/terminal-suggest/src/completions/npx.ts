/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const completionSpec: Fig.Spec = {
	name: 'npx',
	description: 'Execute binaries from npm packages',
	args: {
		name: 'command',
		isCommand: true,
		generators: {
			script: [
				'bash',
				'-c',
				'until [[ -d node_modules/ ]] || [[ $PWD = \'/\' ]]; do cd ..; done; ls -1 node_modules/.bin/',
			],
			postProcess: function (out) {
				return out
					.split('\n')
					.map((name) => ({
						name,
						icon: 'fig://icon?type=command',
						loadSpec: name,
					}));
			},
		},
		isOptional: true,
	},

	options: [
		{
			name: ['--package', '-p'],
			description: 'Package to be installed',
			args: {
				name: 'package',
			},
		},
		{
			name: '--cache',
			args: {
				name: 'path',
				template: 'filepaths',
			},
			description: 'Location of the npm cache',
		},
		{
			name: '--always-spawn',
			description: 'Always spawn a child process to execute the command',
		},
		{
			name: '-y',
			description: 'Execute npx command without prompting for confirmation',
		},
		{
			description: 'Skip installation if a package is missing',
			name: '--no-install',
		},
		{
			args: {
				name: 'path',
				template: 'filepaths',
			},
			description: 'Path to user npmrc',
			name: '--userconfig',
		},
		{
			name: ['--call', '-c'],
			args: {
				name: 'script',
			},
			description: 'Execute string as if inside `npm run-script`',
		},
		{
			name: ['--shell', '-s'],
			description: 'Shell to execute the command with, if any',
			args: {
				name: 'shell',
				suggestions: [
					{
						name: 'bash',
					},
					{
						name: 'fish',
					},
					{
						name: 'zsh',
					},
				],
			},
		},
		{
			args: {
				name: 'shell-fallback',
				suggestions: [
					{
						name: 'bash',
					},
					{
						name: 'fish',
					},
					{
						name: 'zsh',
					},
				],
			},
			name: '--shell-auto-fallback',
			description:
				'Generate shell code to use npx as the "command not found" fallback',
		},
		{
			name: '--ignore-existing',
			description:
				'Ignores existing binaries in $PATH, or in the localproject. This forces npx to do a temporary install and use the latest version',
		},
		{
			name: ['--quiet', '-q'],
			description:
				'Suppress output from npx itself. Subcommands will not be affected',
		},
		{
			name: '--npm',
			args: {
				name: 'path to binary',
				template: 'filepaths',
			},
			description: 'Npm binary to use for internal operations',
		},
		{
			args: {},
			description: 'Extra node argument when calling a node binary',
			name: ['--node-arg', '-n'],
		},
		{
			description: 'Show version number',
			name: ['--version', '-v'],
		},
		{
			description: 'Show help',
			name: ['--help', '-h'],
		},
	],
};

export default completionSpec;
