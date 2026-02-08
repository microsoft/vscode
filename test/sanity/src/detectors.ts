/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import os from 'os';
import { webkit } from 'playwright';

/**
 * The capabilities of the current environment.
 */
export type Capability =
	| 'linux' | 'darwin' | 'windows' | 'alpine'
	| 'x64' | 'arm64' | 'arm32'
	| 'deb' | 'rpm' | 'snap'
	| 'desktop'
	| 'browser'
	| 'wsl'
	| 'github-account';

/**
 * Detect the capabilities of the current environment.
 */
export function detectCapabilities(): ReadonlySet<Capability> {
	const capabilities = new Set<Capability>();
	detectOS(capabilities);
	detectArch(capabilities);
	detectPackageManagers(capabilities);
	detectDesktop(capabilities);
	detectBrowser(capabilities);
	detectWSL(capabilities);
	detectGitHubAccount(capabilities);
	return capabilities;
}

/**
 * Detect the operating system.
 */
function detectOS(capabilities: Set<Capability>) {
	switch (os.platform()) {
		case 'linux':
			if (fs.existsSync('/etc/alpine-release')) {
				capabilities.add('alpine');
			} else {
				capabilities.add('linux');
			}
			break;
		case 'darwin':
			capabilities.add('darwin');
			break;
		case 'win32':
			capabilities.add('windows');
			break;
		default:
			throw new Error(`Unsupported platform: ${os.platform()}`);
	}
}

/**
 * Detect the architecture.
 */
function detectArch(capabilities: Set<Capability>) {
	let arch = os.arch();

	if (os.platform() === 'win32') {
		const winArch = process.env.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITECTURE;
		if (winArch === 'ARM64') {
			arch = 'arm64';
		} else if (winArch === 'AMD64') {
			arch = 'x64';
		}
	}

	switch (arch) {
		case 'x64':
			capabilities.add('x64');
			break;
		case 'arm64':
			capabilities.add('arm64');
			break;
		case 'arm':
			capabilities.add('arm32');
			break;
		default:
			throw new Error(`Unsupported architecture: ${arch}`);
	}
}

/**
 * Detect the package managers.
 */
function detectPackageManagers(capabilities: Set<Capability>) {
	if (os.platform() !== 'linux') {
		return;
	}
	if (fs.existsSync('/usr/bin/dpkg')) {
		capabilities.add('deb');
	}
	if (fs.existsSync('/usr/bin/dnf') || fs.existsSync('/usr/bin/yum')) {
		capabilities.add('rpm');
	}
	if (fs.existsSync('/run/snapd.socket')) {
		capabilities.add('snap');
	}
}

/**
 * Detect if a desktop environment is available.
 */
function detectDesktop(capabilities: Set<Capability>) {
	if (os.platform() !== 'linux' || !!process.env.DISPLAY) {
		capabilities.add('desktop');
	}
}

/**
 * Detect if a browser environment is available.
 */
function detectBrowser(capabilities: Set<Capability>) {
	switch (os.platform()) {
		case 'linux': {
			const path = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
			if (path && fs.existsSync(path)) {
				capabilities.add('browser');
			}
			break;
		}
		case 'darwin': {
			if (fs.existsSync(webkit.executablePath())) {
				capabilities.add('browser');
			}
			break;
		}
		case 'win32': {
			const path =
				process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
				`${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`;

			if (fs.existsSync(path)) {
				capabilities.add('browser');
			}
			break;
		}
	}
}

/**
 * Detect if WSL is available on Windows.
 */
function detectWSL(capabilities: Set<Capability>) {
	if (os.platform() === 'win32') {
		const wslPath = `${process.env.SystemRoot}\\System32\\wsl.exe`;
		if (fs.existsSync(wslPath)) {
			capabilities.add('wsl');
		}
	}
}

/**
 * Detect if GitHub account and password are available in the environment.
 */
function detectGitHubAccount(capabilities: Set<Capability>) {
	if (process.env.GITHUB_ACCOUNT && process.env.GITHUB_PASSWORD) {
		capabilities.add('github-account');
	}
}

