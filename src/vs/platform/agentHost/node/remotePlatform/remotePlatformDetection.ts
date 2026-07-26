/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ISshExec } from '../sshRemoteAgentHostHelpers.js';
import { PosixRemotePlatform } from './posixRemotePlatform.js';
import type { IRemotePlatform, IRemotePlatformInfo, RemoteArch, RemoteOS } from './remotePlatform.js';
import { buildWindowsDetectionCommand, WindowsRemotePlatform } from './windowsRemotePlatform.js';

const WINDOWS_DETECTION_LINE_RE = /VSCODE_REMOTE_OS=(?<os>\S+)\s+VSCODE_REMOTE_ARCH=(?<arch>\S+)/;

/**
 * Parse the output of `uname -s -m` into an {@link IRemotePlatformInfo}
 * for a POSIX remote. Returns `undefined` when the OS or architecture is
 * not one we support.
 */
export function resolveRemotePlatformInfo(unameOutput: string): IRemotePlatformInfo | undefined {
	const parts = unameOutput.trim().split(/\s+/);
	if (parts.length < 2) {
		return undefined;
	}
	const os = parts[0].toLowerCase();
	const machine = parts[1].toLowerCase();

	let mappedOs: RemoteOS;
	if (os === 'linux') {
		mappedOs = 'linux';
	} else if (os === 'darwin') {
		mappedOs = 'darwin';
	} else {
		return undefined;
	}

	let mappedArch: RemoteArch;
	if (machine === 'x86_64' || machine === 'amd64') {
		mappedArch = 'x64';
	} else if (machine === 'aarch64' || machine === 'arm64') {
		mappedArch = 'arm64';
	} else if (machine === 'armv7l') {
		mappedArch = 'armhf';
	} else {
		return undefined;
	}

	return { os: mappedOs, arch: mappedArch };
}

/**
 * Parse the output of the Windows probe payload into an
 * {@link IRemotePlatformInfo}. Returns `undefined` when the marker line
 * is absent or reports an architecture we do not support.
 */
export function resolveWindowsPlatformInfo(probeOutput: string): IRemotePlatformInfo | undefined {
	const match = probeOutput.match(WINDOWS_DETECTION_LINE_RE);
	if (!match || !match.groups) {
		return undefined;
	}
	if (match.groups.os !== 'win32') {
		return undefined;
	}
	const arch = match.groups.arch;
	if (arch !== 'x64' && arch !== 'arm64') {
		return undefined;
	}
	return { os: 'win32', arch };
}

/**
 * Detect the operating system and architecture of a remote and return
 * the matching {@link IRemotePlatform} strategy. Probes POSIX first
 * (single `uname -s -m` round trip) and only falls through to the
 * Windows probe when the POSIX probe fails or is unparseable. Throws
 * when neither probe produces a recognised platform, quoting both
 * probes' output so the failure is diagnosable.
 */
export async function detectRemotePlatform(exec: ISshExec): Promise<IRemotePlatform> {
	const posix = await exec('uname -s -m', { ignoreExitCode: true });
	if (posix.code === 0) {
		const info = resolveRemotePlatformInfo(posix.stdout);
		if (info) {
			return new PosixRemotePlatform(info);
		}
	}

	const windowsCommand = buildWindowsDetectionCommand();
	const win = await exec(windowsCommand, { ignoreExitCode: true });
	if (win.code === 0) {
		const info = resolveWindowsPlatformInfo(win.stdout);
		if (info) {
			return new WindowsRemotePlatform(info);
		}
	}

	throw new Error(
		`Could not detect remote platform.\n` +
		`POSIX probe (uname -s -m) exit=${posix.code}, stdout=${JSON.stringify(posix.stdout.trim())}, stderr=${JSON.stringify(posix.stderr.trim())}.\n` +
		`Windows probe exit=${win.code}, stdout=${JSON.stringify(win.stdout.trim())}, stderr=${JSON.stringify(win.stderr.trim())}.`
	);
}
