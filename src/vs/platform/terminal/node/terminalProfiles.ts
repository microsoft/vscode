/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as cp from 'child_process';
import { Codicon } from '../../../base/common/codicons.js';
import { basename, delimiter, normalize, dirname, resolve } from '../../../base/common/path.js';
import { isLinux, isWindows } from '../../../base/common/platform.js';
import { findExecutable } from '../../../base/node/processes.js';
import { hasKey, isObject, isString } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import * as pfs from '../../../base/node/pfs.js';
import { enumeratePowerShellInstallations } from '../../../base/node/powershell.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { ILogService } from '../../log/common/log.js';
import { ITerminalEnvironment, ITerminalExecutable, ITerminalProfile, ITerminalProfileSource, ITerminalUnsafePath, ProfileSource, TerminalIcon, TerminalSettingId } from '../common/terminal.js';
import { getWindowsBuildNumber } from './terminalEnvironment.js';
import { ThemeIcon } from '../../../base/common/themables.js';

const enum Constants {
	UnixShellsPath = '/etc/shells'
}

let profileSources: Map<string, IPotentialTerminalProfile> | undefined;
let logIfWslNotInstalled: boolean = true;

export function detectAvailableProfiles(
	profiles: unknown,
	defaultProfile: unknown,
	includeDetectedProfiles: boolean,
	configurationService: IConfigurationService,
	shellEnv: typeof process.env = process.env,
	fsProvider?: IFsProvider,
	logService?: ILogService,
	variableResolver?: (text: string[]) => Promise<string[]>,
	testPwshSourcePaths?: string[]
): Promise<ITerminalProfile[]> {
	fsProvider = fsProvider || {
		existsFile: pfs.SymlinkSupport.existsFile,
		readFile: fs.promises.readFile
	};
	if (isWindows) {
		return detectAvailableWindowsProfiles(
			includeDetectedProfiles,
			fsProvider,
			shellEnv,
			logService,
			configurationService.getValue(TerminalSettingId.UseWslProfiles) !== false,
			profiles && isObject(profiles) ? { ...profiles } : configurationService.getValue<{ [key: string]: IUnresolvedTerminalProfile }>(TerminalSettingId.ProfilesWindows),
			isString(defaultProfile) ? defaultProfile : configurationService.getValue<string>(TerminalSettingId.DefaultProfileWindows),
			testPwshSourcePaths,
			variableResolver
		);
	}
	return detectAvailableUnixProfiles(
		fsProvider,
		logService,
		includeDetectedProfiles,
		profiles && isObject(profiles) ? { ...profiles } : configurationService.getValue<{ [key: string]: IUnresolvedTerminalProfile }>(isLinux ? TerminalSettingId.ProfilesLinux : TerminalSettingId.ProfilesMacOs),
		isString(defaultProfile) ? defaultProfile : configurationService.getValue<string>(isLinux ? TerminalSettingId.DefaultProfileLinux : TerminalSettingId.DefaultProfileMacOs),
		testPwshSourcePaths,
		variableResolver,
		shellEnv
	);
}

async function detectAvailableWindowsProfiles(
	includeDetectedProfiles: boolean,
	fsProvider: IFsProvider,
	shellEnv: typeof process.env,
	logService?: ILogService,
	useWslProfiles?: boolean,
	configProfiles?: { [key: string]: IUnresolvedTerminalProfile },
	defaultProfileName?: string,
	testPwshSourcePaths?: string[],
	variableResolver?: (text: string[]) => Promise<string[]>
): Promise<ITerminalProfile[]> {
	// Determine the correct System32 path. We want to point to Sysnative
	// when the 32-bit version of VS Code is running on a 64-bit machine.
	// The reason for this is because PowerShell's important PSReadline
	// module doesn't work if this is not the case. See #27915.
	const is32ProcessOn64Windows = process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432');
	const system32Path = `${process.env['windir']}\\${is32ProcessOn64Windows ? 'Sysnative' : 'System32'}`;

	// WSL 2 released in the May 2020 Update, this is where the `-d` flag was added that we depend
	// upon
	const allowWslDiscovery = getWindowsBuildNumber() >= 19041;

	await initializeWindowsProfiles(testPwshSourcePaths);

	const detectedProfiles: Map<string, IUnresolvedTerminalProfile> = new Map();

	// Add auto detected profiles
	if (includeDetectedProfiles) {
		detectedProfiles.set('PowerShell', {
			source: ProfileSource.Pwsh,
			icon: Codicon.terminalPowershell,
			isAutoDetected: true
		});
		detectedProfiles.set('Windows PowerShell', {
			path: `${system32Path}\\WindowsPowerShell\\v1.0\\powershell.exe`,
			icon: Codicon.terminalPowershell,
			isAutoDetected: true
		});
		detectedProfiles.set('Git Bash', {
			source: ProfileSource.GitBash,
			icon: Codicon.terminalGitBash,
			isAutoDetected: true
		});
		detectedProfiles.set('Command Prompt', {
			path: `${system32Path}\\cmd.exe`,
			icon: Codicon.terminalCmd,
			isAutoDetected: true
		});
		detectedProfiles.set('Cygwin', {
			path: [
				{ path: `${process.env['HOMEDRIVE']}\\cygwin64\\bin\\bash.exe`, isUnsafe: true },
				{ path: `${process.env['HOMEDRIVE']}\\cygwin\\bin\\bash.exe`, isUnsafe: true }
			],
			args: ['--login'],
			isAutoDetected: true
		});
		detectedProfiles.set('bash (MSYS2)', {
			path: [
				{ path: `${process.env['HOMEDRIVE']}\\msys64\\usr\\bin\\bash.exe`, isUnsafe: true },
			],
			args: ['--login', '-i'],
			// CHERE_INVOKING retains current working directory
			env: { CHERE_INVOKING: '1' },
			icon: Codicon.terminalBash,
			isAutoDetected: true
		});
		const cmderPath = `${process.env['CMDER_ROOT'] || `${process.env['HOMEDRIVE']}\\cmder`}\\vendor\\bin\\vscode_init.cmd`;
		detectedProfiles.set('Cmder', {
			path: `${system32Path}\\cmd.exe`,
			args: ['/K', cmderPath],
			// The path is safe if it was derived from CMDER_ROOT
			requiresPath: process.env['CMDER_ROOT'] ? cmderPath : { path: cmderPath, isUnsafe: true },
			isAutoDetected: true
		});
	}

	applyConfigProfilesToMap(configProfiles, detectedProfiles);

	const resultProfiles: ITerminalProfile[] = await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);

	if (includeDetectedProfiles && useWslProfiles && allowWslDiscovery) {
		try {
			const result = await getWslProfiles(`${system32Path}\\wsl.exe`, defaultProfileName);
			for (const wslProfile of result) {
				if (!configProfiles || !Object.prototype.hasOwnProperty.call(configProfiles, wslProfile.profileName)) {
					resultProfiles.push(wslProfile);
				}
			}
		} catch (e) {
			if (logIfWslNotInstalled) {
				logService?.trace('WSL is not installed, so could not detect WSL profiles');
				logIfWslNotInstalled = false;
			}
		}
	}

	return resultProfiles;
}

async function transformToTerminalProfiles(
	entries: IterableIterator<[string, IUnresolvedTerminalProfile]>,
	defaultProfileName: string | undefined,
	fsProvider: IFsProvider,
	shellEnv: typeof process.env = process.env,
	logService?: ILogService,
	variableResolver?: (text: string[]) => Promise<string[]>,
): Promise<ITerminalProfile[]> {
	const promises: Promise<ITerminalProfile | undefined>[] = [];
	for (const [profileName, profile] of entries) {
		promises.push(getValidatedProfile(profileName, profile, defaultProfileName, fsProvider, shellEnv, logService, variableResolver));
	}
	return (await Promise.all(promises)).filter(e => !!e);
}

async function getValidatedProfile(
	profileName: string,
	profile: IUnresolvedTerminalProfile,
	defaultProfileName: string | undefined,
	fsProvider: IFsProvider,
	shellEnv: typeof process.env = process.env,
	logService?: ILogService,
	variableResolver?: (text: string[]) => Promise<string[]>
): Promise<ITerminalProfile | undefined> {
	if (profile === null) {
		return undefined;
	}
	let originalPaths: (string | ITerminalUnsafePath)[];
	let args: string[] | string | undefined;
	let icon: ThemeIcon | URI | { light: URI; dark: URI } | undefined = undefined;
	// use calculated values if path is not specified
	if (hasKey(profile, { source: true })) {
		const source = profileSources?.get(profile.source);
		if (!source) {
			return undefined;
		}
		originalPaths = source.paths;

		// if there are configured args, override the default ones
		args = profile.args || source.args;
		if (profile.icon) {
			icon = validateIcon(profile.icon);
		} else if (source.icon) {
			icon = source.icon;
		}
	} else {
		originalPaths = Array.isArray(profile.path) ? profile.path : [profile.path];
		args = isWindows ? profile.args : Array.isArray(profile.args) ? profile.args : undefined;
		icon = validateIcon(profile.icon);
	}

	let paths: (string | ITerminalUnsafePath)[];
	if (variableResolver) {
		// Convert to string[] for resolve
		const mapped = originalPaths.map(e => isString(e) ? e : e.path);

		const resolved = await variableResolver(mapped);
		// Convert resolved back to (T | string)[]
		paths = new Array(originalPaths.length);
		for (let i = 0; i < originalPaths.length; i++) {
			if (isString(originalPaths[i])) {
				paths[i] = resolved[i];
			} else {
				paths[i] = {
					path: resolved[i],
					isUnsafe: true
				};
			}
		}
	} else {
		paths = originalPaths.slice();
	}

	let requiresUnsafePath: string | undefined;
	if (profile.requiresPath) {
		// Validate requiresPath exists
		let actualRequiredPath: string;
		if (isString(profile.requiresPath)) {
			actualRequiredPath = profile.requiresPath;
		} else {
			actualRequiredPath = profile.requiresPath.path;
			if (profile.requiresPath.isUnsafe) {
				requiresUnsafePath = actualRequiredPath;
			}
		}
		const result = await fsProvider.existsFile(actualRequiredPath);
		if (!result) {
			return;
		}
	}

	const validatedProfile = await validateProfilePaths(profileName, defaultProfileName, paths, fsProvider, shellEnv, args, profile.env, profile.overrideName, profile.isAutoDetected, requiresUnsafePath);
	if (!validatedProfile) {
		logService?.debug('Terminal profile not validated', profileName, originalPaths);
		return undefined;
	}

	validatedProfile.isAutoDetected = profile.isAutoDetected;
	validatedProfile.icon = icon;
	validatedProfile.color = profile.color;
	return validatedProfile;
}

function validateIcon(icon: string | TerminalIcon | undefined): TerminalIcon | undefined {
	if (isString(icon)) {
		return { id: icon };
	}
	return icon;
}

async function initializeWindowsProfiles(testPwshSourcePaths?: string[]): Promise<void> {
	if (profileSources && !testPwshSourcePaths) {
		return;
	}

	const [gitBashPaths, pwshPaths] = await Promise.all([getGitBashPaths(), testPwshSourcePaths || getPowershellPaths()]);

	profileSources = new Map();
	profileSources.set(
		ProfileSource.GitBash, {
		profileName: 'Git Bash',
		paths: gitBashPaths,
		args: ['--login', '-i']
	});
	profileSources.set(ProfileSource.Pwsh, {
		profileName: 'PowerShell',
		paths: pwshPaths,
		icon: Codicon.terminalPowershell
	});
}

async function getGitBashPaths(): Promise<string[]> {
	const gitDirs: Set<string> = new Set();

	// Look for git.exe on the PATH and use that if found. git.exe is located at
	// `<installdir>/cmd/git.exe`. This is not an unsafe location because the git executable is
	// located on the PATH which is only controlled by the user/admin.
	const gitExePath = await findExecutable('git.exe');
	if (gitExePath) {
		const gitExeDir = dirname(gitExePath);
		gitDirs.add(resolve(gitExeDir, '../..'));
	}
	function addTruthy<T>(set: Set<T>, value: T | undefined): void {
		if (value) {
			set.add(value);
		}
	}

	// Add common git install locations
	addTruthy(gitDirs, process.env['ProgramW6432']);
	addTruthy(gitDirs, process.env['ProgramFiles']);
	addTruthy(gitDirs, process.env['ProgramFiles(X86)']);
	addTruthy(gitDirs, `${process.env['LocalAppData']}\\Program`);

	const gitBashPaths: string[] = [];
	for (const gitDir of gitDirs) {
		gitBashPaths.push(
			`${gitDir}\\Git\\bin\\bash.exe`,
			`${gitDir}\\Git\\usr\\bin\\bash.exe`,
			`${gitDir}\\usr\\bin\\bash.exe` // using Git for Windows SDK
		);
	}

	// Add special installs that don't follow the standard directory structure
	gitBashPaths.push(`${process.env['UserProfile']}\\scoop\\apps\\git\\current\\bin\\bash.exe`);
	gitBashPaths.push(`${process.env['UserProfile']}\\scoop\\apps\\git-with-openssh\\current\\bin\\bash.exe`);

	return gitBashPaths;
}

async function getPowershellPaths(): Promise<string[]> {
	const paths: string[] = [];
	// Add all of the different kinds of PowerShells
	for await (const pwshExe of enumeratePowerShellInstallations()) {
		paths.push(pwshExe.exePath);
	}
	return paths;
}

async function getWslProfiles(wslPath: string, defaultProfileName: string | undefined): Promise<ITerminalProfile[]> {
	const profiles: ITerminalProfile[] = [];
	const distroOutput = await new Promise<string>((resolve, reject) => {
		// wsl.exe output is encoded in utf16le (ie. A -> 0x4100) by default, force it in case the
		// user changed https://github.com/microsoft/vscode/issues/276253
		cp.exec('wsl.exe -l -q', { encoding: 'utf16le', env: { ...process.env, WSL_UTF8: '0' }, timeout: 1000 }, (err, stdout) => {
			if (err) {
				return reject('Problem occurred when getting wsl distros');
			}
			resolve(stdout);
		});
	});
	if (!distroOutput) {
		return [];
	}
	const regex = new RegExp(/[\r?\n]/);
	const distroNames = distroOutput.split(regex).filter(t => t.trim().length > 0 && t !== '');
	for (const distroName of distroNames) {
		// Skip empty lines
		if (distroName === '') {
			continue;
		}

		// docker-desktop and docker-desktop-data are treated as implementation details of
		// Docker Desktop for Windows and therefore not exposed
		if (distroName.startsWith('docker-desktop')) {
			continue;
		}

		// Create the profile, adding the icon depending on the distro
		const profileName = `${distroName} (WSL)`;
		const profile: ITerminalProfile = {
			profileName,
			path: wslPath,
			args: [`-d`, `${distroName}`],
			isDefault: profileName === defaultProfileName,
			icon: getWslIcon(distroName),
			isAutoDetected: false
		};
		// Add the profile
		profiles.push(profile);
	}
	return profiles;
}

function getWslIcon(distroName: string): ThemeIcon {
	if (distroName.includes('Ubuntu')) {
		return Codicon.terminalUbuntu;
	} else if (distroName.includes('Debian')) {
		return Codicon.terminalDebian;
	} else {
		return Codicon.terminalLinux;
	}
}

async function detectAvailableUnixProfiles(
	fsProvider: IFsProvider,
	logService?: ILogService,
	includeDetectedProfiles?: boolean,
	configProfiles?: { [key: string]: IUnresolvedTerminalProfile },
	defaultProfileName?: string,
	testPaths?: string[],
	variableResolver?: (text: string[]) => Promise<string[]>,
	shellEnv?: typeof process.env
): Promise<ITerminalProfile[]> {
	const detectedProfiles: Map<string, IUnresolvedTerminalProfile> = new Map();

	// Add non-quick launch profiles
	if (includeDetectedProfiles && await fsProvider.existsFile(Constants.UnixShellsPath)) {
		const contents = (await fsProvider.readFile(Constants.UnixShellsPath)).toString();
		const profiles = (
			(testPaths || contents.split('\n'))
				.map(e => {
					const index = e.indexOf('#');
					return index === -1 ? e : e.substring(0, index);
				})
				.filter(e => e.trim().length > 0)
		);
		const counts: Map<string, number> = new Map();
		for (const profile of profiles) {
			let profileName = basename(profile);
			let count = counts.get(profileName) || 0;
			count++;
			if (count > 1) {
				profileName = `${profileName} (${count})`;
			}
			counts.set(profileName, count);
			detectedProfiles.set(profileName, { path: profile, isAutoDetected: true });
		}
	}

	applyConfigProfilesToMap(configProfiles, detectedProfiles);

	return await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);
}

function applyConfigProfilesToMap(configProfiles: { [key: string]: IUnresolvedTerminalProfile } | undefined, profilesMap: Map<string, IUnresolvedTerminalProfile>) {
	if (!configProfiles) {
		return;
	}
	for (const [profileName, value] of Object.entries(configProfiles)) {
		if (value === null || !isObject(value) || (!hasKey(value, { path: true }) && !hasKey(value, { source: true }))) {
			profilesMap.delete(profileName);
		} else {
			value.icon = value.icon || profilesMap.get(profileName)?.icon;
			profilesMap.set(profileName, value);
		}
	}
}

async function validateProfilePaths(profileName: string, defaultProfileName: string | undefined, potentialPaths: (string | ITerminalUnsafePath)[], fsProvider: IFsProvider, shellEnv: typeof process.env, args?: string[] | string, env?: ITerminalEnvironment, overrideName?: boolean, isAutoDetected?: boolean, requiresUnsafePath?: string): Promise<ITerminalProfile | undefined> {
	if (potentialPaths.length === 0) {
		return Promise.resolve(undefined);
	}
	const path = potentialPaths.shift()!;
	if (path === '') {
		return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
	}
	const isUnsafePath = !isString(path) && path.isUnsafe;
	const actualPath = isString(path) ? path : path.path;

	const profile: ITerminalProfile = {
		profileName,
		path: actualPath,
		args,
		env,
		overrideName,
		isAutoDetected,
		isDefault: profileName === defaultProfileName,
		isUnsafePath,
		requiresUnsafePath
	};

	// For non-absolute paths, check if it's available on $PATH
	if (basename(actualPath) === actualPath) {
		// The executable isn't an absolute path, try find it on the PATH
		const envPaths: string[] | undefined = shellEnv.PATH ? shellEnv.PATH.split(delimiter) : undefined;
		const executable = await findExecutable(actualPath, undefined, envPaths, undefined, fsProvider.existsFile);
		if (!executable) {
			return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args);
		}
		profile.path = executable;
		profile.isFromPath = true;
		return profile;
	}

	const result = await fsProvider.existsFile(normalize(actualPath));
	if (result) {
		return profile;
	}

	return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
}

export interface IFsProvider {
	existsFile(path: string): Promise<boolean>;
	readFile(path: string): Promise<Buffer>;
}

interface IPotentialTerminalProfile {
	profileName: string;
	paths: string[];
	args?: string[];
	icon?: ThemeIcon | URI | { light: URI; dark: URI };
}

export type IUnresolvedTerminalProfile = ITerminalExecutable | ITerminalProfileSource | null;
