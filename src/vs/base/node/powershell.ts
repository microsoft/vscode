/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'vs/base/common/path';
import { env } from 'vs/base/common/process';

const WindowsPowerShell64BitLabel = 'Windows PowerShell (x64)';
const WindowsPowerShell32BitLabel = 'Windows PowerShell (x86)';

// This is required, since parseInt("7-preview") will return 7.
const IntRegex: RegExp = /^\d+$/;

const PwshMsixRegex: RegExp = /^Microsoft.PowerShell_.*/;
const PwshPreviewMsixRegex: RegExp = /^Microsoft.PowerShellPreview_.*/;

// The platform details descriptor for the platform we're on
const isProcess64Bit: boolean = process.arch === 'x64';
const isOS64Bit: boolean = isProcess64Bit || env.hasOwnProperty('PROCESSOR_ARCHITEW6432');

export interface IPowerShellExeDetails {
	readonly displayName: string;
	readonly exePath: string;
}

export interface IPossiblePowerShellExe extends IPowerShellExeDetails {
	exists(): boolean;
}

class PossiblePowerShellExe implements IPossiblePowerShellExe {
	public readonly exePath: string;
	public readonly displayName: string;

	private knownToExist: boolean | undefined;

	constructor(
		pathToExe: string,
		installationName: string,
		{ knownToExist = false }: { knownToExist?: boolean } = {}) {

		this.exePath = pathToExe;
		this.displayName = installationName;
		this.knownToExist = knownToExist || undefined;
	}

	public exists(): boolean {
		if (this.knownToExist === undefined) {
			this.knownToExist = fs.existsSync(this.exePath);
		}
		return this.knownToExist;
	}
}

function getProgramFilesPath(
	{ useAlternateBitness = false }: { useAlternateBitness?: boolean } = {}): string | null {

	if (!useAlternateBitness) {
		// Just use the native system bitness
		return env.ProgramFiles!;
	}

	// We might be a 64-bit process looking for 32-bit program files
	if (isProcess64Bit) {
		return env['ProgramFiles(x86)']!;
	}

	// We might be a 32-bit process looking for 64-bit program files
	if (isOS64Bit) {
		return env.ProgramW6432!;
	}

	// We're a 32-bit process on 32-bit Windows, there is no other Program Files dir
	return null;
}

function getSystem32Path({ useAlternateBitness = false }: { useAlternateBitness?: boolean } = {}): string {
	const windir: string = env.windir!;

	if (!useAlternateBitness) {
		// Just use the native system bitness
		return path.join(windir, 'System32');
	}

	// We might be a 64-bit process looking for 32-bit system32
	if (isProcess64Bit) {
		return path.join(windir, 'SysWOW64');
	}

	// We might be a 32-bit process looking for 64-bit system32
	if (isOS64Bit) {
		return path.join(windir, 'Sysnative');
	}

	// We're on a 32-bit Windows, so no alternate bitness
	return path.join(windir, 'System32');
}

function findPSCoreWindowsInstallation(
	{ useAlternateBitness = false, findPreview = false }:
		{ useAlternateBitness?: boolean; findPreview?: boolean } = {}): IPossiblePowerShellExe | null {

	const programFilesPath = getProgramFilesPath({ useAlternateBitness });
	if (!programFilesPath) {
		return null;
	}

	const powerShellInstallBaseDir = path.join(programFilesPath, 'PowerShell');

	// Ensure the base directory exists
	if (!(fs.existsSync(powerShellInstallBaseDir) && fs.lstatSync(powerShellInstallBaseDir).isDirectory())) {
		return null;
	}

	let highestSeenVersion: number = -1;
	let pwshExePath: string | null = null;
	for (const item of fs.readdirSync(powerShellInstallBaseDir)) {

		let currentVersion: number = -1;
		if (findPreview) {
			// We are looking for something like "7-preview"

			// Preview dirs all have dashes in them
			const dashIndex = item.indexOf('-');
			if (dashIndex < 0) {
				continue;
			}

			// Verify that the part before the dash is an integer
			// and that the part after the dash is "preview"
			const intPart: string = item.substring(0, dashIndex);
			if (!IntRegex.test(intPart) || item.substring(dashIndex + 1) !== 'preview') {
				continue;
			}

			currentVersion = parseInt(intPart, 10);
		} else {
			// Search for a directory like "6" or "7"
			if (!IntRegex.test(item)) {
				continue;
			}

			currentVersion = parseInt(item, 10);
		}

		// Ensure we haven't already seen a higher version
		if (currentVersion <= highestSeenVersion) {
			continue;
		}

		// Now look for the file
		const exePath = path.join(powerShellInstallBaseDir, item, 'pwsh.exe');
		if (!fs.existsSync(exePath)) {
			continue;
		}

		pwshExePath = exePath;
		highestSeenVersion = currentVersion;
	}

	if (!pwshExePath) {
		return null;
	}

	const bitness: string = programFilesPath.includes('x86') ? '(x86)' : '(x64)';
	const preview: string = findPreview ? ' Preview' : '';

	return new PossiblePowerShellExe(pwshExePath, `PowerShell${preview} ${bitness}`);
}

function findPSCoreMsix({ findPreview }: { findPreview?: boolean } = {}): IPossiblePowerShellExe | null {
	// We can't proceed if there's no LOCALAPPDATA path
	if (!env.LOCALAPPDATA) {
		return null;
	}

	// Find the base directory for MSIX application exe shortcuts
	const msixAppDir = path.join(env.LOCALAPPDATA, 'Microsoft', 'WindowsApps');

	if (!fs.existsSync(msixAppDir)) {
		return null;
	}

	// Define whether we're looking for the preview or the stable
	const { pwshMsixDirRegex, pwshMsixName } = findPreview
		? { pwshMsixDirRegex: PwshPreviewMsixRegex, pwshMsixName: 'PowerShell Preview (Store)' }
		: { pwshMsixDirRegex: PwshMsixRegex, pwshMsixName: 'PowerShell (Store)' };

	// We should find only one such application, so return on the first one
	for (const subdir of fs.readdirSync(msixAppDir)) {
		if (pwshMsixDirRegex.test(subdir)) {
			const pwshMsixPath = path.join(msixAppDir, subdir, 'pwsh.exe');
			return new PossiblePowerShellExe(pwshMsixPath, pwshMsixName, { knownToExist: true });
		}
	}

	// If we find nothing, return null
	return null;
}

function findPSCoreDotnetGlobalTool(): IPossiblePowerShellExe {
	const dotnetGlobalToolExePath: string = path.join(os.homedir(), '.dotnet', 'tools', 'pwsh.exe');

	return new PossiblePowerShellExe(dotnetGlobalToolExePath, '.NET Core PowerShell Global Tool');
}

function findWinPS({ useAlternateBitness = false }: { useAlternateBitness?: boolean } = {}): IPossiblePowerShellExe | null {

	// 32-bit OSes only have one WinPS on them
	if (!isOS64Bit && useAlternateBitness) {
		return null;
	}

	const systemFolderPath = getSystem32Path({ useAlternateBitness });

	const winPSPath = path.join(systemFolderPath, 'WindowsPowerShell', 'v1.0', 'powershell.exe');

	let displayName: string;
	if (isProcess64Bit) {
		displayName = useAlternateBitness
			? WindowsPowerShell32BitLabel
			: WindowsPowerShell64BitLabel;
	} else if (isOS64Bit) {
		displayName = useAlternateBitness
			? WindowsPowerShell64BitLabel
			: WindowsPowerShell32BitLabel;
	} else {
		displayName = WindowsPowerShell32BitLabel;
	}

	return new PossiblePowerShellExe(winPSPath, displayName, { knownToExist: true });
}

/**
 * Iterates through all the possible well-known PowerShell installations on a machine.
 * Returned values may not exist, but come with an .exists property
 * which will check whether the executable exists.
 */
function* enumerateDefaultPowerShellInstallations(): Iterable<IPossiblePowerShellExe> {
	// Find PSCore stable first
	let pwshExe = findPSCoreWindowsInstallation();
	if (pwshExe) {
		yield pwshExe;
	}

	// Windows may have a 32-bit pwsh.exe
	pwshExe = findPSCoreWindowsInstallation({ useAlternateBitness: true });
	if (pwshExe) {
		yield pwshExe;
	}

	// Also look for the MSIX/UWP installation
	pwshExe = findPSCoreMsix();
	if (pwshExe) {
		yield pwshExe;
	}

	// Look for the .NET global tool
	// Some older versions of PowerShell have a bug in this where startup will fail,
	// but this is fixed in newer versions
	pwshExe = findPSCoreDotnetGlobalTool();
	if (pwshExe) {
		yield pwshExe;
	}

	// Look for PSCore preview
	pwshExe = findPSCoreWindowsInstallation({ findPreview: true });
	if (pwshExe) {
		yield pwshExe;
	}

	// Find a preview MSIX
	pwshExe = findPSCoreMsix({ findPreview: true });
	if (pwshExe) {
		yield pwshExe;
	}

	// Look for pwsh-preview with the opposite bitness
	pwshExe = findPSCoreWindowsInstallation({ useAlternateBitness: true, findPreview: true });
	if (pwshExe) {
		yield pwshExe;
	}

	// Finally, get Windows PowerShell

	// Get the natural Windows PowerShell for the process bitness
	pwshExe = findWinPS();
	if (pwshExe) {
		yield pwshExe;
	}

	// Get the alternate bitness Windows PowerShell
	pwshExe = findWinPS({ useAlternateBitness: true });
	if (pwshExe) {
		yield pwshExe;
	}
}

/**
 * Iterates through PowerShell installations on the machine according
 * to configuration passed in through the constructor.
 * PowerShell items returned by this object are verified
 * to exist on the filesystem.
 */
export function* enumeratePowerShellInstallations(): Iterable<IPowerShellExeDetails> {
	// Get the default PowerShell installations first
	for (const defaultPwsh of enumerateDefaultPowerShellInstallations()) {
		if (defaultPwsh && defaultPwsh.exists()) {
			yield defaultPwsh;
		}
	}
}

/**
* Returns the first available PowerShell executable found in the search order.
*/
export function getFirstAvailablePowerShellInstallation(): IPowerShellExeDetails | null {
	for (const pwsh of enumeratePowerShellInstallations()) {
		return pwsh;
	}
	return null;
}
