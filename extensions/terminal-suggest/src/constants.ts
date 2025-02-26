/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const upstreamSpecs = [
	'ls',
	'echo',
	'mkdir',
	'rm',
	'rmdir',
	'touch',
	'pwd',
	'brew',
	'cp',
	'mv',
	'cat',
	'less',
	'more',
	'head',
	'tail',
	'nano',
	'vim',
	'chmod',
	'chown',
	'uname',
	'top',
	'df',
	'du',
	'ps',
	'kill',
	'killall',
	'curl',
	'wget',
	'ssh',
	'scp',
	'apt',
	'grep',
	'find',

	'git',
	'npm',
	'yarn',
	'python',
	'python3',
	'pnpm',
	'node',
	'nvm',
	'npx',
];


export const enum SettingsIds {
	SuggestPrefix = 'terminal.integrated.suggest',
	CachedWindowsExecutableExtensions = 'terminal.integrated.suggest.windowsExecutableExtensions',
	CachedWindowsExecutableExtensionsSuffixOnly = 'windowsExecutableExtensions',
}
