/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { Codicon } from 'vs/base/common/codicons';
import { basename, delimiter, normalize } from 'vs/base/common/path';
import { isLinux, isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import * as pfs from 'vs/base/node/pfs';
import { enumeratePowerShellInstallations } from 'vs/base/node/powershell';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ILogService } from 'vs/platform/log/common/log';
import { ITerminalEnvironment, ITerminalExecutable, ITerminalProfile, ITerminalProfileSource, ProfileSource, TerminalIcon, TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { findExecutable, getWindowsBuildNumber } from 'vs/platform/terminal/node/terminalEnvironment';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';

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
		readFile: pfs.Promises.readFile
	};
	if (isWindows) {
		return detectAvailableWindowsProfiles(
			includeDetectedProfiles,
			fsProvider,
			shellEnv,
			logService,
			configurationService.getValue(TerminalSettingId.UseWslProfiles) !== false,
			profiles && typeof profiles === 'object' ? { ...profiles } : configurationService.getValue<{ [key: string]: IUnresolvedTerminalProfile }>(TerminalSettingId.ProfilesWindows),
			typeof defaultProfile === 'string' ? defaultProfile : configurationService.getValue<string>(TerminalSettingId.DefaultProfileWindows),
			testPwshSourcePaths,
			variableResolver
		);
	}
	return detectAvailableUnixProfiles(
		fsProvider,
		logService,
		includeDetectedProfiles,
		profiles && typeof profiles === 'object' ? { ...profiles } : configurationService.getValue<{ [key: string]: IUnresolvedTerminalProfile }>(isLinux ? TerminalSettingId.ProfilesLinux : TerminalSettingId.ProfilesMacOs),
		typeof defaultProfile === 'string' ? defaultProfile : configurationService.getValue<string>(isLinux ? TerminalSettingId.DefaultProfileLinux : TerminalSettingId.DefaultProfileMacOs),
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

	let useWSLexe = false;

	if (getWindowsBuildNumber() >= 16299) {
		useWSLexe = true;
	}

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
			isAutoDetected: true
		});
		detectedProfiles.set('Cygwin', {
			path: [
				`${process.env['HOMEDRIVE']}\\cygwin64\\bin\\bash.exe`,
				`${process.env['HOMEDRIVE']}\\cygwin\\bin\\bash.exe`
			],
			args: ['--login'],
			isAutoDetected: true
		});
		detectedProfiles.set('Command Prompt', {
			path: `${system32Path}\\cmd.exe`,
			icon: Codicon.terminalCmd,
			isAutoDetected: true
		});
	}

	applyConfigProfilesToMap(configProfiles, detectedProfiles);

	const resultProfiles: ITerminalProfile[] = await transformToTerminalProfiles(detectedProfiles.entries(), defaultProfileName, fsProvider, shellEnv, logService, variableResolver);

	if (includeDetectedProfiles || useWslProfiles) {
		try {
			const result = await getWslProfiles(`${system32Path}\\${useWSLexe ? 'wsl' : 'bash'}.exe`, defaultProfileName);
			for (const wslProfile of result) {
				if (!configProfiles || !(wslProfile.profileName in configProfiles)) {
					resultProfiles.push(wslProfile);
				}
			}
		} catch (e) {
			if (logIfWslNotInstalled) {
				logService?.info('WSL is not installed, so could not detect WSL profiles');
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
	const resultProfiles: ITerminalProfile[] = [];
	for (const [profileName, profile] of entries) {
		if (profile === null) { continue; }
		let originalPaths: string[];
		let args: string[] | string | undefined;
		let icon: ThemeIcon | URI | { light: URI; dark: URI } | undefined = undefined;
		if ('source' in profile) {
			const source = profileSources?.get(profile.source);
			if (!source) {
				continue;
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

		const paths = (await variableResolver?.(originalPaths)) || originalPaths.slice();
		const validatedProfile = await validateProfilePaths(profileName, defaultProfileName, paths, fsProvider, shellEnv, args, profile.env, profile.overrideName, profile.isAutoDetected, logService);
		if (validatedProfile) {
			validatedProfile.isAutoDetected = profile.isAutoDetected;
			validatedProfile.icon = icon;
			validatedProfile.color = profile.color;
			resultProfiles.push(validatedProfile);
		} else {
			logService?.debug('Terminal profile not validated', profileName, originalPaths);
		}
	}
	logService?.debug('Validated terminal profiles', resultProfiles);
	return resultProfiles;
}

function validateIcon(icon: string | TerminalIcon | undefined): TerminalIcon | undefined {
	if (typeof icon === 'string') {
		return { id: icon };
	}
	return icon;
}

async function initializeWindowsProfiles(testPwshSourcePaths?: string[]): Promise<void> {
	if (profileSources && !testPwshSourcePaths) {
		return;
	}

	profileSources = new Map();
	profileSources.set(
		'Git Bash', {
		profileName: 'Git Bash',
		paths: [
			`${process.env['ProgramW6432']}\\Git\\bin\\bash.exe`,
			`${process.env['ProgramW6432']}\\Git\\usr\\bin\\bash.exe`,
			`${process.env['ProgramFiles']}\\Git\\bin\\bash.exe`,
			`${process.env['ProgramFiles']}\\Git\\usr\\bin\\bash.exe`,
			`${process.env['ProgramFiles(X86)']}\\Git\\bin\\bash.exe`,
			`${process.env['ProgramFiles(X86)']}\\Git\\usr\\bin\\bash.exe`,
			`${process.env['LocalAppData']}\\Programs\\Git\\bin\\bash.exe`,
			`${process.env['UserProfile']}\\scoop\\apps\\git-with-openssh\\current\\bin\\bash.exe`,
			`${process.env['AllUsersProfile']}\\scoop\\apps\\git-with-openssh\\current\\bin\\bash.exe`
		],
		args: ['--login']
	});
	profileSources.set('PowerShell', {
		profileName: 'PowerShell',
		paths: testPwshSourcePaths || await getPowershellPaths(),
		icon: ThemeIcon.asThemeIcon(Codicon.terminalPowershell)
	});
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
		// wsl.exe output is encoded in utf16le (ie. A -> 0x4100)
		cp.exec('wsl.exe -l -q', { encoding: 'utf16le', timeout: 1000 }, (err, stdout) => {
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
		return ThemeIcon.asThemeIcon(Codicon.terminalUbuntu);
	} else if (distroName.includes('Debian')) {
		return ThemeIcon.asThemeIcon(Codicon.terminalDebian);
	} else {
		return ThemeIcon.asThemeIcon(Codicon.terminalLinux);
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
	if (includeDetectedProfiles) {
		const contents = (await fsProvider.readFile('/etc/shells')).toString();
		const profiles = testPaths || contents.split('\n').filter(e => e.trim().indexOf('#') !== 0 && e.trim().length > 0);
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
		if (value === null || (!('path' in value) && !('source' in value))) {
			profilesMap.delete(profileName);
		} else {
			value.icon = value.icon || profilesMap.get(profileName)?.icon;
			profilesMap.set(profileName, value);
		}
	}
}

async function validateProfilePaths(profileName: string, defaultProfileName: string | undefined, potentialPaths: string[], fsProvider: IFsProvider, shellEnv: typeof process.env, args?: string[] | string, env?: ITerminalEnvironment, overrideName?: boolean, isAutoDetected?: boolean, logService?: ILogService): Promise<ITerminalProfile | undefined> {
	if (potentialPaths.length === 0) {
		return Promise.resolve(undefined);
	}
	const path = potentialPaths.shift()!;
	if (path === '') {
		return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
	}

	const profile: ITerminalProfile = { profileName, path, args, env, overrideName, isAutoDetected, isDefault: profileName === defaultProfileName };

	// For non-absolute paths, check if it's available on $PATH
	if (basename(path) === path) {
		// The executable isn't an absolute path, try find it on the PATH
		const envPaths: string[] | undefined = shellEnv.PATH ? shellEnv.PATH.split(delimiter) : undefined;
		const executable = await findExecutable(path, undefined, envPaths, undefined, fsProvider.existsFile);
		if (!executable) {
			return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args);
		}
		profile.path = executable;
		profile.isFromPath = true;
		return profile;
	}

	const result = await fsProvider.existsFile(normalize(path));
	if (result) {
		return profile;
	}

	return validateProfilePaths(profileName, defaultProfileName, potentialPaths, fsProvider, shellEnv, args, env, overrideName, isAutoDetected);
}

export interface IFsProvider {
	existsFile(path: string): Promise<boolean>;
	readFile(path: string): Promise<Buffer>;
}

export interface IProfileVariableResolver {
	resolve(text: string[]): Promise<string[]>;
}

interface IPotentialTerminalProfile {
	profileName: string;
	paths: string[];
	args?: string[];
	icon?: ThemeIcon | URI | { light: URI; dark: URI };
}

export type IUnresolvedTerminalProfile = ITerminalExecutable | ITerminalProfileSource | null;
