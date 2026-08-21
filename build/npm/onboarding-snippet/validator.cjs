/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * @typedef {Object} SnippetConfig
 * @property {string} template
 * @property {string} language
 * @property {string[]} requires
 * @property {Object.<string, string>} [links]
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid
 * @property {string[]} warnings
 */

/**
 * Validates environment for a given topic
 * @param {string} topic - The topic identifier
 * @param {SnippetConfig} config - Snippet configuration
 * @returns {Promise<ValidationResult>}
 */
async function validateEnvironment(topic, config) {
	const warnings = [];
	const requires = config.requires || [];

	// Check Node.js version (if node is required)
	if (requires.includes('node')) {
		const nodeVersion = process.versions.node;
		const major = parseInt(nodeVersion.split('.')[0]);
		const minor = parseInt(nodeVersion.split('.')[1]);
		const patch = parseInt(nodeVersion.split('.')[2]);

		// VS Code requires Node.js 20.18.1+ (see build/npm/preinstall.js)
		if (major < 20 || (major === 20 && minor < 18) || (major === 20 && minor === 18 && patch < 1)) {
			warnings.push(`Node.js version ${nodeVersion} detected. VS Code requires Node.js 20.18.1 or later.`);
		}
	}

	// Check Docker (if docker is required)
	if (requires.includes('docker')) {
		try {
			cp.execSync('docker --version', { stdio: 'ignore' });
		} catch {
			warnings.push('Docker not found. Install Docker to use Docker-related snippets.');
		}
	}

	// Check WSL (if wsl is required)
	if (requires.includes('wsl')) {
		if (os.platform() !== 'linux') {
			try {
				cp.execSync('wsl --version', { stdio: 'ignore' });
			} catch {
				warnings.push('WSL not detected. These snippets are for Windows Subsystem for Linux.');
			}
		}
	}

	// Check Visual Studio (Windows-specific, for build topics)
	if (topic === 'build' && os.platform() === 'win32') {
		const programFiles64Path = process.env['ProgramFiles'];
		const programFiles86Path = process.env['ProgramFiles(x86)'];
		const vsVersions = ['2022', '2019', '2017'];
		const vsTypes = ['Enterprise', 'Professional', 'Community', 'Preview', 'BuildTools', 'IntPreview'];
		let vsFound = false;

		for (const version of vsVersions) {
			// Check environment variable first
			const vsEnvPath = process.env[`vs${version}_install`];
			if (vsEnvPath && fs.existsSync(vsEnvPath)) {
				vsFound = true;
				break;
			}

			// Check Program Files paths
			if (programFiles64Path) {
				const vsPath = path.join(programFiles64Path, 'Microsoft Visual Studio', version);
				if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath, vsType)))) {
					vsFound = true;
					break;
				}
			}

			if (programFiles86Path) {
				const vsPath = path.join(programFiles86Path, 'Microsoft Visual Studio', version);
				if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath, vsType)))) {
					vsFound = true;
					break;
				}
			}
		}

		if (!vsFound) {
			warnings.push('Visual Studio 2022/2019/2017 not detected. Required for building native modules on Windows.');
		}
	}

	return {
		valid: warnings.length === 0,
		warnings
	};
}

module.exports = { validateEnvironment };

