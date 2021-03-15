/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as platform from 'vs/base/common/platform';
import { coalesce } from 'vs/base/common/arrays';
import { normalize, basename } from 'vs/base/common/path';
import { enumeratePowerShellInstallations } from 'vs/base/node/powershell';
import { getWindowsBuildNumber } from 'vs/platform/terminal/node/terminalEnvironment';
import { ITerminalProfile } from 'vs/workbench/contrib/terminal/common/terminal';
import * as cp from 'child_process';

export interface IStatProvider {
	stat(path: string): boolean,
	lstat(path: string): boolean
}

interface IPotentialTerminalProfile {
	profileName: string,
	paths: string[],
	args?: string[]
}

export function detectAvailableProfiles(detectWslProfiles?: boolean, statProvider?: IStatProvider): Promise<ITerminalProfile[]> {
	return platform.isWindows ? detectAvailableWindowsProfiles(detectWslProfiles, statProvider) : detectAvailableUnixProfiles();
}

async function detectAvailableWindowsProfiles(detectWslProfiles?: boolean, statProvider?: IStatProvider): Promise<ITerminalProfile[]> {
	// Determine the correct System32 path. We want to point to Sysnative
	// when the 32-bit version of VS Code is running on a 64-bit machine.
	// The reason for this is because PowerShell's important PSReadline
	// module doesn't work if this is not the case. See #27915.
	const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
	const system32Path = `${process.env['windir']}\\${is32ProcessOn64Windows ? 'Sysnative' : 'System32'}`;

	let useWSLexe = false;

	if (getWindowsBuildNumber() >= 16299) {
		useWSLexe = true;
	}

	let expectedProfiles: IPotentialTerminalProfile[] = [
		{
			profileName: 'Command Prompt',
			paths: [`${system32Path}\\cmd.exe`]
		},
		{
			profileName: 'Git Bash',
			paths: [
				`${process.env['ProgramW6432']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramW6432']}\\Git\\usr\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\bin\\bash.exe`,
				`${process.env['ProgramFiles']}\\Git\\usr\\bin\\bash.exe`,
				`${process.env['LocalAppData']}\\Programs\\Git\\bin\\bash.exe`,
			],
			args: ['--login']
		},
		{
			profileName: 'Cygwin',
			paths: [
				`${process.env['HOMEDRIVE']}\\cygwin64\\bin\\bash.exe`,
				`${process.env['HOMEDRIVE']}\\cygwin\\bin\\bash.exe`
			],
			args: ['-l']
		},
		... await getWslProfiles(system32Path, useWSLexe, detectWslProfiles),
		... await getPowershellProfiles()
	];

	const promises: Promise<ITerminalProfile | undefined>[] = [];
	expectedProfiles.forEach(profile => promises.push(validateProfilePaths(profile.profileName, profile.paths, statProvider, profile.args)));
	const profiles = await Promise.all(promises);

	// todo what's the expected path of zsh? add to expected profiles
	let zsh = profiles.find(shell => shell?.path.endsWith('zsh.exe'));
	if (zsh) {
		zsh.args = ['--login'];
	}
	return coalesce(profiles);
}

async function getPowershellProfiles(): Promise<IPotentialTerminalProfile[]> {
	let profiles: IPotentialTerminalProfile[] = [];
	// Add all of the different kinds of PowerShells
	for await (const pwshExe of enumeratePowerShellInstallations()) {
		profiles.push({ profileName: pwshExe.displayName, paths: [pwshExe.exePath] });
	}
	return profiles;
}

async function getWslProfiles(path: string, useWSLexe: boolean, detectWslProfiles?: boolean): Promise<IPotentialTerminalProfile[]> {
	if (detectWslProfiles) {
		let profiles: IPotentialTerminalProfile[] = [];
		profiles.push({ profileName: `WSL Bash`, paths: [`${path}\\${useWSLexe ? 'wsl.exe' : 'bash.exe'}`] });
		const distroOutput = await new Promise<string>(r => cp.exec('wsl.exe -l', (err, stdout) => err ? console.trace('problem occurred when getting wsl distros', err) : r(stdout)));
		if (distroOutput) {
			let regex = new RegExp(/[\r\n]/);
			let distroNames = Buffer.from(distroOutput).toString('utf8').split(regex).filter(t => t.trim().length > 0 && t !== '');
			// don't need the Windows Subsystem for Linux Distributions: header
			distroNames.shift();
			distroNames.forEach(distro => {
				let s = '';
				let counter = 0;
				Array.from(distro).forEach(c => {
					if (counter % 2 === 1) {
						// every other character is junk / a rectangle
						s += c;
					}
					counter++;
				}
				);
				if (s.endsWith('(Default)')) {
					// Ubuntu (Default) -> Ubuntu
					s = s.substring(0, s.length - 9);
				}
				if (s !== '') {
					let profile = { profileName: `${s}`, paths: [`${path}\\${useWSLexe ? `wsl.exe` : `bash.exe`}`], args: [` -d ${s}`] };
					profiles.push(profile);
				}
			});
			return profiles;
		}
	}
	return [];
}

async function detectAvailableUnixProfiles(): Promise<ITerminalProfile[]> {
	const contents = await fs.promises.readFile('/etc/shells', 'utf8');
	const profiles = contents.split('\n').filter(e => e.trim().indexOf('#') !== 0 && e.trim().length > 0);
	return profiles.map(e => {
		return {
			profileName: basename(e),
			path: e
		};
	});
}

async function validateProfilePaths(label: string, potentialPaths: string[], statProvider?: IStatProvider, args?: string[]): Promise<ITerminalProfile | undefined> {
	if (potentialPaths.length === 0) {
		return Promise.resolve(undefined);
	}
	const current = potentialPaths.shift()!;
	if (current! === '') {
		return validateProfilePaths(label, potentialPaths, statProvider);
	}
	if (statProvider) {
		if (statProvider.stat(current)) {
			return {
				profileName: label,
				path: current,
				args: args
			};
		}
	} else {
		try {
			const result = await fs.promises.stat(normalize(current));
			if (result.isFile() || result.isSymbolicLink()) {
				return {
					profileName: label,
					path: current,
					args: args
				};
			}
		} catch (e) {
			// Also try using lstat as some symbolic links on Windows
			// throw 'permission denied' using 'stat' but don't throw
			// using 'lstat'
			try {
				const result = await fs.promises.lstat(normalize(current));
				if (result.isFile() || result.isSymbolicLink()) {
					return {
						profileName: label,
						path: current,
						args: args
					};
				}
			}
			catch (e) {
				// noop
			}
		}
	}
	return validateProfilePaths(label, potentialPaths, statProvider);
}

export function createStatProvider(expectedPaths: string[]): IStatProvider {
	const provider = {
		stat(path: string) {
			return expectedPaths.includes(path);
		},
		lstat(path: string) {
			return expectedPaths.includes(path);
		}
	};
	return provider;
}
