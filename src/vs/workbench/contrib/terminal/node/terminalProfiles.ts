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
import { ITerminalConfiguration, ITerminalExecutable, ITerminalProfile, ITerminalProfileObject, ITerminalProfileSource } from 'vs/workbench/contrib/terminal/common/terminal';
import * as cp from 'child_process';
import { ExtHostVariableResolverService } from 'vs/workbench/api/common/extHostDebugService';
import { IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { ILogService } from 'vs/platform/log/common/log';

export function detectAvailableProfiles(quickLaunchOnly: boolean, logService?: ILogService, config?: ITerminalConfiguration, variableResolver?: ExtHostVariableResolverService, workspaceFolder?: IWorkspaceFolder, statProvider?: IStatProvider, testPaths?: string[]): Promise<ITerminalProfile[]> {
	return platform.isWindows ? detectAvailableWindowsProfiles(quickLaunchOnly, logService, config?.showQuickLaunchWslProfiles, config?.profiles.windows, variableResolver, workspaceFolder, statProvider) : detectAvailableUnixProfiles(logService, quickLaunchOnly, platform.isMacintosh ? config?.profiles.osx : config?.profiles.linux, testPaths);
}

async function detectAvailableWindowsProfiles(quickLaunchOnly: boolean, logService?: ILogService, showQuickLaunchWslProfiles?: boolean, configProfiles?: { [key: string]: ITerminalProfileObject }, variableResolver?: ExtHostVariableResolverService, workspaceFolder?: IWorkspaceFolder, statProvider?: IStatProvider): Promise<ITerminalProfile[]> {
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

	const expectedProfiles: IPotentialTerminalProfile[] = [
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
				`${process.env['LocalAppData']}\\Programs\\Git\\bin\\bash.exe`
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
		... await getWslProfiles(`${system32Path}\\${useWSLexe ? 'wsl.exe' : 'bash.exe'}`, showQuickLaunchWslProfiles),
		... await getPowershellProfiles()
	];

	const promises: Promise<ITerminalProfile | undefined>[] = [];
	expectedProfiles.forEach(profile => promises.push(validateProfilePaths(profile.profileName, profile.paths, statProvider, profile.args)));
	const profiles = await Promise.all(promises);

	const detectedProfiles = coalesce(profiles);

	let quickLaunchProfiles: ITerminalProfile[] = [];

	if (detectedProfiles && configProfiles) {
		for (const [profileName, value] of Object.entries(configProfiles)) {
			if (value !== null) {
				if ((value as ITerminalExecutable).path) {
					let profile;
					const customProfile = (value as ITerminalExecutable);
					const pathOrPaths = customProfile.path;
					if (Array.isArray(pathOrPaths)) {
						const resolvedPaths: string[] = [];
						for (const p of pathOrPaths) {
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
						profile = detectedProfiles.find(profile => resolvedPaths.includes(profile.path));
						if (!profile) {
							logService?.trace(`Could not detect path ${JSON.stringify(resolvedPaths)}`);
						}
					} else {
						let resolved = variableResolver?.resolve(workspaceFolder, pathOrPaths);
						if (resolved) {
							profile = detectedProfiles.find(profile => profile.path === resolved);
						} else if (statProvider) {
							// used by tests
							resolved = pathOrPaths;
						} else {
							logService?.trace(`Could not resolve path ${pathOrPaths} in workspace folder ${workspaceFolder}`);
						}
						if (!profile) {
							logService?.trace(`Could not detect path ${resolved}`);
						}
					}
					if (profile) {
						let profileFromConfig;
						let isCustomProfile;
						if (customProfile.args) {
							isCustomProfile = profile.profileName !== profileName || profile.args !== customProfile.args;
							profileFromConfig = { profileName: profileName, path: profile.path, args: customProfile.args };
						} else {
							isCustomProfile = profile.profileName !== profileName;
							profileFromConfig = { profileName: profileName, path: profile.path };
						}

						if (profileFromConfig) {
							quickLaunchProfiles.push(profileFromConfig);
							// add custom profile to detected profiles
							if (isCustomProfile) {
								detectedProfiles.push(profileFromConfig);
							}
						}
					}
				} else if ((value as ITerminalProfileSource).source) {
					// source
					const sourceKey = (value as ITerminalProfileSource).source;
					const profile = detectedProfiles.find(profile => profile.profileName === sourceKey.toString());
					if (profile) {
						let profileFromConfig;
						if (profile.args) {
							profileFromConfig = { profileName, path: profile.path, args: profile.args };
						} else {
							profileFromConfig = { profileName, path: profile.path };
						}
						const isCustomProfile = profile.profileName !== profileName;
						if (profileFromConfig) {
							quickLaunchProfiles.push(profileFromConfig);
							// add custom profile to detected profiles
							if (isCustomProfile) {
								detectedProfiles.push(profileFromConfig);
							}
						}
					} else {
						logService?.trace(`No source with key ${sourceKey}`);
					}
				} else {
					logService?.trace(`Entry in terminal.profiles.windows is not of type ITerminalExecutable or Source`, profileName, value);
				}
			}
		}
	} else {
		logService?.trace(`No detected profiles ${JSON.stringify(detectedProfiles)} or ${JSON.stringify(configProfiles)}`);
	}

	// only show the windows powershell profile if no other powershell profile exists
	if (quickLaunchProfiles.find(p => p.path.endsWith('pwsh.exe'))) {
		quickLaunchProfiles = quickLaunchProfiles.filter(p => p.profileName !== 'Windows PowerShell');
	}

	if (showQuickLaunchWslProfiles) {
		quickLaunchProfiles.push(...detectedProfiles.filter(p => p.path.endsWith('wsl.exe')));
	}
	return quickLaunchOnly ? quickLaunchProfiles : detectedProfiles;
}

async function getPowershellProfiles(): Promise<IPotentialTerminalProfile[]> {
	const profiles: IPotentialTerminalProfile[] = [];
	// Add all of the different kinds of PowerShells
	for await (const pwshExe of enumeratePowerShellInstallations()) {
		profiles.push({ profileName: pwshExe.displayName, paths: [pwshExe.exePath] });
	}
	return profiles;
}

async function getWslProfiles(wslPath: string, showQuickLaunchWslProfiles?: boolean): Promise<IPotentialTerminalProfile[]> {
	const profiles: IPotentialTerminalProfile[] = [];
	if (showQuickLaunchWslProfiles) {
		const distroOutput = await new Promise<string>((resolve, reject) => {
			// wsl.exe output is encoded in utf16le (ie. A -> 0x4100)
			cp.exec('wsl.exe -l', { encoding: 'utf16le' }, (err, stdout) => {
				if (err) {
					return reject('Problem occurred when getting wsl distros');
				}
				resolve(stdout);
			});
		});
		if (distroOutput) {
			const regex = new RegExp(/[\r?\n]/);
			const distroNames = distroOutput.split(regex).filter(t => t.trim().length > 0 && t !== '');
			// don't need the Windows Subsystem for Linux Distributions header
			distroNames.shift();
			for (let distroName of distroNames) {
				// Remove default from distro name
				distroName = distroName.replace(/ \(Default\)$/, '');

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

async function detectAvailableUnixProfiles(logService?: ILogService, quickLaunchOnly?: boolean, configProfiles?: any, testPaths?: string[]): Promise<ITerminalProfile[]> {
	const contents = await fs.promises.readFile('/etc/shells', 'utf8');
	const profiles = testPaths || contents.split('\n').filter(e => e.trim().indexOf('#') !== 0 && e.trim().length > 0);

	let detectedProfiles: ITerminalProfile[] = [];
	const quickLaunchProfiles: ITerminalProfile[] = [];
	for (const profile of profiles) {
		detectedProfiles.push({ profileName: basename(profile), path: profile });
	}

	for (const [profileName, value] of Object.entries(configProfiles)) {
		if ((value as ITerminalExecutable).path) {
			const configProfile = (value as ITerminalExecutable);
			const pathOrPaths = configProfile.path;
			const args = configProfile.args;
			if (Array.isArray(pathOrPaths)) {
				for (const possiblePath of pathOrPaths) {
					const profile = detectedProfiles.find(p => basename(p.path) === possiblePath);
					// choose only the first
					if (profile && !quickLaunchProfiles.find(p => basename(p.path) === possiblePath)) {
						const isCustomProfile = !detectedProfiles.find(p => basename(p.path) === possiblePath && p.path && p.args === args);
						let profileFromConfig;
						if (args) {
							profileFromConfig = { profileName, path: profile.path, args };
						} else {
							profileFromConfig = { profileName, path: profile.path };
						}
						quickLaunchProfiles.push(profileFromConfig);
						// add custom profile to detected profiles
						if (isCustomProfile) {
							detectedProfiles.push(profileFromConfig);
						}
						break;
					} else if (!profile) {
						logService?.trace(`Could not resolve path ${pathOrPaths} with name ${profileName} and args ${JSON.stringify(args)}`);
					}
				}
			} else {
				const profile = detectedProfiles.find(p => basename(p.path) === pathOrPaths);
				// choose only the first
				if (profile && !quickLaunchProfiles.find(p => basename(p.path) === profile.path)) {
					const isCustomProfile = !detectedProfiles.find(p => basename(p.path) === profile.path && p.args === args && p.profileName === profileName);
					let profileFromConfig;
					if (args) {
						profileFromConfig = { profileName, path: profile.path, args };
					} else {
						profileFromConfig = { profileName, path: profile.path };
					}
					quickLaunchProfiles.push(profileFromConfig);
					// add custom profile to detected profiles
					if (isCustomProfile) {
						detectedProfiles.push(profileFromConfig);
					}
				} else if (!profile) {
					logService?.trace(`Could not resolve path ${pathOrPaths} with name ${profileName} and args ${JSON.stringify(args)}`);
				}
			}
		} else {
			logService?.trace(`Entry in terminal.profiles.linux or osx is not of type ITerminalExecutable`, profileName, value);
		}
	}

	// include any custom profiles
	detectedProfiles.push(...quickLaunchProfiles.filter(p => !detectedProfiles.find(profile => profile.profileName === p.profileName && profile.path === p.path && profile.args === p.args)));

	return quickLaunchOnly ? quickLaunchProfiles : detectedProfiles;
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

export interface IStatProvider {
	stat(path: string): boolean,
	lstat(path: string): boolean
}

interface IPotentialTerminalProfile {
	profileName: string,
	paths: string[],
	args?: string[]
}
