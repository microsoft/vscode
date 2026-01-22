/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';

/**
 * The capabilities of the current environment.
 */
export type Capability =
	| 'linux' | 'darwin' | 'windows' | 'alpine'
	| 'x64' | 'arm64' | 'arm32'
	| 'deb' | 'rpm' | 'snap'
	| 'desktop'
	| 'browser';

/**
 * Detect the capabilities of the current environment.
 */
export function detectCapabilities(): Set<Capability> {
	const capabilities = new Set<Capability>();
	detectOS(capabilities);
	detectArch(capabilities);
	detectPackageManagers(capabilities);
	detectDesktop(capabilities);
	detectBrowser(capabilities);
	return capabilities;
}

/**
 * Detect the operating system.
 */
function detectOS(capabilities: Set<Capability>) {
	switch (process.platform) {
		case 'linux':
			capabilities.add('linux');
			if (fs.existsSync('/etc/alpine-release')) {
				capabilities.add('alpine');
			}
			break;
		case 'darwin':
			capabilities.add('darwin');
			break;
		case 'win32':
			capabilities.add('windows');
			break;
		default:
			throw new Error(`Unsupported platform: ${process.platform}`);
	}
}

/**
 * Detect the architecture.
 */
function detectArch(capabilities: Set<Capability>) {
	switch (process.arch) {
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
			throw new Error(`Unsupported architecture: ${process.arch}`);
	}
}

/**
 * Detect the package managers.
 */
function detectPackageManagers(capabilities: Set<Capability>) {
	if (process.platform !== 'linux') {
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
	if (process.platform !== 'linux' || process.env.DISPLAY) {
		capabilities.add('desktop');
	}
}

/**
 * Detect if a browser environment is available.
 */
function detectBrowser(capabilities: Set<Capability>) {
	if (process.platform !== 'linux' || process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
		capabilities.add('browser');
	}
}
