/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const upstreamSpecs = [
	'basename',
	'cat',
	'chmod',
	'chown',
	'clear',
	'cp',
	'curl',
	'cut',
	'date',
	'dd',
	'df',
	'diff',
	'dig',
	'dirname',
	'du',
	'echo',
	'env',
	'export',
	'fdisk',
	'find',
	'fmt',
	'fold',
	'grep',
	'head',
	'htop',
	'id',
	'jq',
	'kill',
	'killall',
	'less',
	'ln',
	'ls',
	'lsblk',
	'lsof',
	'mkdir',
	'more',
	'mount',
	'mv',
	'nl',
	'od',
	'paste',
	'ping',
	'pkill',
	'ps',
	'pwd',
	'readlink',
	'rm',
	'rmdir',
	'rsync',
	'scp',
	'sed',
	'seq',
	'shred',
	'sort',
	'source',
	'split',
	'stat',
	'su',
	'sudo',
	'tac',
	'tail',
	'tar',
	'tee',
	'time',
	'top',
	'touch',
	'tr',
	'traceroute',
	'tree',
	'truncate',
	'uname',
	'uniq',
	'unzip',
	'wc',
	'wget',
	'where',
	'whereis',
	'which',
	'who',
	'xargs',
	'xxd',
	'zip',

	// OS package management
	'apt',
	'brew',

	// Editors
	'nano',
	'vim',

	// Shells
	'ssh',

	// Android
	'adb',

	// Docker
	'docker',
	'docker-compose',

	// Dotnet
	'dotnet',

	// Go
	'go',

	// JavaScript / TypeScript
	'node',
	'npm',
	'nvm',
	'pnpm',
	'yarn',
	'yo',

	// Python
	'python',
	'python3',
	'ruff',

	// Ruby
	'bundle',
	'ruby',
];


export const enum SettingsIds {
	SuggestPrefix = 'terminal.integrated.suggest',
	CachedWindowsExecutableExtensions = 'terminal.integrated.suggest.windowsExecutableExtensions',
	CachedWindowsExecutableExtensionsSuffixOnly = 'windowsExecutableExtensions',
}
