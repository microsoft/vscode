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
import { ITerminalConfiguration, ITerminalExecutable, ITerminalProfile, ITerminalProfileSource } from 'vs/workbench/contrib/terminal/common/terminal';
import * as cp from 'child_process';
import { ExtHostVariableResolverService } from 'vs/workbench/api/common/extHostDebugService';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ITestTerminalConfig } from 'vs/workbench/contrib/terminal/test/node/terminalProfiles.test';
import { ILogService } from 'vs/platform/log/common/log';

export interface IStatProvider {
	stat(path: string): boolean,
	lstat(path: string): boolean
}

interface IPotentialTerminalProfile {
	profileName: string,
	paths: string[],
	args?: string[]
}

export function detectAvailableProfiles(quickLaunchOnly: boolean, logService?: ILogService, config?: ITerminalConfiguration | ITestTerminalConfig, variableResolver?: ExtHostVariableResolverService, workspaceFolder?: IWorkspaceFolder, statProvider?: IStatProvider): Promise<ITerminalProfile[]> {
	return platform.isWindows ? detectAvailableWindowsProfiles(quickLaunchOnly, logService, config?.quickLaunchWslProfiles, config?.profiles?.windows, variableResolver, workspaceFolder, statProvider) : detectAvailableUnixProfiles(quickLaunchOnly, platform.isMacintosh ? config?.profiles?.osx : config?.profiles?.linux);
}

async function detectAvailableWindowsProfiles(quickLaunchOnly: boolean, logService?: ILogService, quickLaunchWslProfiles?: boolean, configProfiles?: any, variableResolver?: ExtHostVariableResolverService, workspaceFolder?: IWorkspaceFolder, statProvider?: IStatProvider): Promise<ITerminalProfile[]> {
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
			args: ['--login']
		},
		... await getWslProfiles(`${system32Path}\\${useWSLexe ? 'wsl.exe' : 'bash.exe'}`, quickLaunchWslProfiles, logService),
		... await getPowershellProfiles()
	];

	const promises: Promise<ITerminalProfile | undefined>[] = [];
	expectedProfiles.forEach(profile => promises.push(validateProfilePaths(profile.profileName, profile.paths, statProvider, profile.args)));
	const profiles = await Promise.all(promises);

	let detectedProfiles = coalesce(profiles);

	if (!quickLaunchOnly) {
		return detectedProfiles;
	}
	let validProfiles: ITerminalProfile[] = [];

	if (detectedProfiles && configProfiles) {
		for (const [profileKey, value] of Object.entries(configProfiles)) {
			if (value !== null) {
				if ((value as ITerminalExecutable).pathOrPaths) {
					let profile;
					const customProfile = (value as ITerminalExecutable);
					if (Array.isArray(customProfile.pathOrPaths)) {
						let resolvedPaths: string[] = [];
						for (const p of customProfile.pathOrPaths) {
							const resolved = variableResolver?.resolve(workspaceFolder, p);
							if (resolved) {
								resolvedPaths.push(resolved);
							} else if (statProvider) {
								// used by tests
								resolvedPaths.push(p);
							} else {
								logService?.trace(`Could not resolve path ${p} in workspace folder ${workspaceFolder}`);
							}
						}
						profile = detectedProfiles?.find(profile => resolvedPaths.includes(profile.path));
						if (!profile) {
							logService?.trace(`Could not detect path ${JSON.stringify(resolvedPaths)}`);
						}
					} else {
						let resolved = variableResolver?.resolve(workspaceFolder, customProfile.pathOrPaths);
						if (resolved) {
							profile = detectedProfiles?.find(profile => profile.path === resolved);
						} else if (statProvider) {
							// used by tests
							resolved = customProfile.pathOrPaths;
						} else {
							logService?.trace(`Could not resolve path ${customProfile.pathOrPaths} in workspace folder ${workspaceFolder}`);
						}
						if (!profile) {
							logService?.trace(`Could not detect path ${resolved}`);
						}
					}
					if (profile) {
						if (customProfile.args) {
							validProfiles?.push({ profileName: profileKey, path: profile.path, args: customProfile.args });
						} else {
							validProfiles?.push({ profileName: profileKey, path: profile.path });
						}
					}
				} else if ((value as ITerminalProfileSource).source) {
					// source
					let sourceKey = (value as ITerminalProfileSource).source;
					const profile = detectedProfiles?.find(profile => profile.profileName === sourceKey.toString());
					if (profile) {
						validProfiles?.push({ profileName: profileKey, path: profile.path, args: profile.args });
					} else {
						logService?.trace(`No source with key ${sourceKey}`);
					}
				} else {
					logService?.trace(`Entry in terminal.profiles.windows is not of type ITerminalExecutable or Source`, profileKey, value);
				}
			}
		}
	} else {
		logService?.trace(`No detected profiles ${JSON.stringify(detectedProfiles)} or ${JSON.stringify(configProfiles)}`);
	}

	// only show the windows powershell profile if no other powershell profile exists
	if (validProfiles.find(p => p.path.endsWith('pwsh.exe'))) {
		validProfiles = validProfiles.filter(p => p.profileName !== 'Windows PowerShell');
	}

	if (quickLaunchWslProfiles) {
		validProfiles.push(...detectedProfiles.filter(p => p.path.endsWith('wsl.exe')));
	}
	return validProfiles;
}

async function getPowershellProfiles(): Promise<IPotentialTerminalProfile[]> {
	let profiles: IPotentialTerminalProfile[] = [];
	// Add all of the different kinds of PowerShells
	for await (const pwshExe of enumeratePowerShellInstallations()) {
		profiles.push({ profileName: pwshExe.displayName, paths: [pwshExe.exePath] });
	}
	return profiles;
}

async function getWslProfiles(wslPath: string, quickLaunchWslProfiles?: boolean, logService?: ILogService): Promise<IPotentialTerminalProfile[]> {
	let profiles: IPotentialTerminalProfile[] = [];
	if (quickLaunchWslProfiles) {
		const distroOutput = await new Promise<string>((resolve, reject) => {
			cp.exec('wsl.exe -l', (err, stdout) => {
				if (err) {
					return reject('Problem occurred when getting wsl distros');
				}
				resolve(stdout);
			});
		});
		if (distroOutput) {
			let regex = new RegExp(/[\r?\n]/);
			let distroNames = distroOutput.split(regex).filter(t => t.trim().length > 0 && t !== '');
			// don't need the Windows Subsystem for Linux Distributions header
			distroNames.shift();
			for (let distroName of distroNames) {
				// HACK: For some reason wsl.exe -l returns the string in an encoding where each
				// character takes up 2 bytes, it's unclear how to decode this properly so instead
				// we expect ascii and just remove all NUL chars
				distroName = distroName
					.replace(/\u0000/g, '')
					.replace(/ \(Default\)$/, '');

				// Skip empty lines
				if (distroName === '') {
					continue;
				}

				// docker-desktop and docker-desktop-data are treated as implementation details of
				// Docker Desktop for Windows and therefore not exposed
				if (distroName.startsWith('docker-desktop')) {
					continue;
				}

				// Add the profile
				profiles.push({
					profileName: `${distroName} (WSL)`,
					paths: [wslPath],
					args: [`-d`, `${distroName}`]
				});
			}
			return profiles;
		}
	}
	return [];
}

async function detectAvailableUnixProfiles(quickLaunchOnly?: boolean, configProfiles?: any): Promise<ITerminalProfile[]> {
	const contents = await fs.promises.readFile('/etc/shells', 'utf8');
	const profiles = contents.split('\n').filter(e => e.trim().indexOf('#') !== 0 && e.trim().length > 0);

	let detectedProfiles: ITerminalProfile[] = [];
	let quickLaunchProfiles: ITerminalProfile[] = [];
	for (const profile of profiles) {
		detectedProfiles.push({ profileName: basename(profile), path: profile });
		// choose only the first
		if (!quickLaunchProfiles.find(p => p.profileName === basename(profile))) {
			quickLaunchProfiles.push({ profileName: basename(profile), path: profile });
		}
	}

	if (!quickLaunchOnly) {
		return detectedProfiles;
	}

	const validProfiles: ITerminalProfile[] = [];

	for (const [profileName, value] of Object.entries(configProfiles)) {
		if ((value as ITerminalExecutable).pathOrPaths) {
			const configProfile = (value as ITerminalExecutable);
			const pathOrPaths = configProfile.pathOrPaths;
			if (Array.isArray(pathOrPaths)) {
				for (const possiblePath of pathOrPaths) {
					const profile = detectedProfiles.find(p => p.path.endsWith(possiblePath));
					if (profile) {
						validProfiles.push({ profileName, path: profile.path });
						break;
					}
				}
			} else {
				const profile = detectedProfiles.find(p => p.path.endsWith(pathOrPaths));
				if (profile) {
					validProfiles.push({ profileName, path: profile.path });
				}
			}
		}
	}
	return validProfiles;
}

async function validateProfilePaths(label: string, potentialPaths: string[], statProvider?: IStatProvider, args?: string[]): Promise<ITerminalProfile | undefined> {
	if (potentialPaths.length === 0) {
		return Promise.resolve(undefined);
	}
	const current = potentialPaths.shift()!;
	if (current! === '') {
		return validateProfilePaths(label, potentialPaths, statProvider, args);
	}
	if (statProvider) {
		if (statProvider.stat(current)) {
			if (args) {
				return {
					profileName: label,
					path: current,
					args: args
				};
			} else {
				return {
					profileName: label,
					path: current
				};
			}
		}
	} else {
		try {
			const result = await fs.promises.stat(normalize(current));
			if (result.isFile() || result.isSymbolicLink()) {
				if (args) {
					return {
						profileName: label,
						path: current,
						args: args
					};
				} else {
					return {
						profileName: label,
						path: current
					};
				}
			}
		} catch (e) {
			// Also try using lstat as some symbolic links on Windows
			// throw 'permission denied' using 'stat' but don't throw
			// using 'lstat'
			try {
				const result = await fs.promises.lstat(normalize(current));
				if (result.isFile() || result.isSymbolicLink()) {
					if (args) {
						return {
							profileName: label,
							path: current,
							args: args
						};
					} else {
						return {
							profileName: label,
							path: current
						};
					}
				}
			}
			catch (e) {
				// noop
			}
		}
	}
	return validateProfilePaths(label, potentialPaths, statProvider, args);
}
