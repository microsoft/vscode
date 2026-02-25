/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { spawn } from '@malept/cross-spawn-promise';

const root = path.dirname(path.dirname(import.meta.dirname));
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));

const DMGBUILD_REPO = 'https://github.com/dmgbuild/dmgbuild.git';
const DMGBUILD_COMMIT = '75c8a6c7835c5b73dfd4510d92a8f357f93a5fbf';
const MIN_PYTHON_VERSION = [3, 10];

function getDmgBuildPath(): string {
	return path.join(import.meta.dirname, '.dmgbuild');
}

function getVenvPath(): string {
	return path.join(getDmgBuildPath(), 'venv');
}

function getPythonPath(): string {
	return path.join(getVenvPath(), 'bin', 'python3');
}

async function checkPythonVersion(pythonBin: string): Promise<boolean> {
	try {
		const output = await spawn(pythonBin, ['--version']);
		const match = output.match(/Python (\d+)\.(\d+)/);
		if (match) {
			const major = parseInt(match[1], 10);
			const minor = parseInt(match[2], 10);
			return major > MIN_PYTHON_VERSION[0] || (major === MIN_PYTHON_VERSION[0] && minor >= MIN_PYTHON_VERSION[1]);
		}
	} catch {
		// not available
	}
	return false;
}

/**
 * Finds a Python binary that meets the minimum version requirement.
 * Tries well-known candidates first, and if none are suitable,
 * installs Python 3.12 via Homebrew.
 */
async function findSuitablePython(): Promise<string> {
	const candidates = [
		'python3',
		'python3.12',
		'python3.11',
		'python3.10',
		// Homebrew paths (Apple Silicon)
		'/opt/homebrew/opt/python@3.12/bin/python3',
		'/opt/homebrew/opt/python@3.11/bin/python3',
		'/opt/homebrew/opt/python@3.10/bin/python3',
		// Homebrew paths (Intel)
		'/usr/local/opt/python@3.12/bin/python3',
		'/usr/local/opt/python@3.11/bin/python3',
		'/usr/local/opt/python@3.10/bin/python3',
	];

	for (const candidate of candidates) {
		if (await checkPythonVersion(candidate)) {
			console.log(`Found suitable Python: ${candidate}`);
			return candidate;
		}
	}

	console.log(`No Python >= ${MIN_PYTHON_VERSION[0]}.${MIN_PYTHON_VERSION[1]} found, installing via Homebrew...`);
	await spawn('brew', ['install', 'python@3.12'], {
		stdio: 'inherit',
		env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1', HOMEBREW_NO_INSTALL_CLEANUP: '1' }
	});

	// Use `brew --prefix` to reliably locate the installation
	const brewPrefix = (await spawn('brew', ['--prefix', 'python@3.12'])).trim();
	const brewBinDir = path.join(brewPrefix, 'bin');
	console.log(`Homebrew Python prefix: ${brewPrefix}`);

	// Try both python3 and python3.12 (keg-only formulae may only have the versioned name)
	for (const name of ['python3', 'python3.12']) {
		const fullPath = path.join(brewBinDir, name);
		if (await checkPythonVersion(fullPath)) {
			console.log(`Using Homebrew Python: ${fullPath}`);
			return fullPath;
		}
	}

	throw new Error(`Could not find Python >= ${MIN_PYTHON_VERSION[0]}.${MIN_PYTHON_VERSION[1]} even after Homebrew install at ${brewPrefix}.`);
}

async function ensureDmgBuild(): Promise<void> {
	const dmgBuildPath = getDmgBuildPath();
	const venvPath = getVenvPath();
	const markerFile = path.join(dmgBuildPath, '.installed');
	if (fs.existsSync(markerFile)) {
		console.log('dmgbuild already installed, skipping setup');
		return;
	}

	console.log('Setting up dmgbuild from GitHub...');
	if (fs.existsSync(dmgBuildPath)) {
		fs.rmSync(dmgBuildPath, { recursive: true });
	}

	console.log(`Cloning dmgbuild from ${DMGBUILD_REPO} at ${DMGBUILD_COMMIT}...`);
	await spawn('git', ['clone', DMGBUILD_REPO, dmgBuildPath], {
		stdio: 'inherit'
	});
	await spawn('git', ['-C', dmgBuildPath, 'checkout', DMGBUILD_COMMIT], {
		stdio: 'inherit'
	});

	const pythonBin = await findSuitablePython();
	console.log('Creating Python virtual environment...');
	await spawn(pythonBin, ['-m', 'venv', venvPath], {
		stdio: 'inherit'
	});

	console.log('Installing dmgbuild and dependencies into venv...');
	const pipPath = path.join(venvPath, 'bin', 'pip');
	await spawn(pipPath, ['install', dmgBuildPath], {
		stdio: 'inherit'
	});

	fs.writeFileSync(markerFile, `Installed at ${new Date().toISOString()}\nCommit: ${DMGBUILD_COMMIT}\n`);
	console.log('dmgbuild setup complete');
}

async function runDmgBuild(settingsFile: string, volumeName: string, artifactPath: string): Promise<void> {
	await ensureDmgBuild();

	const pythonPath = getPythonPath();
	await spawn(pythonPath, ['-m', 'dmgbuild', '-s', settingsFile, volumeName, artifactPath], {
		stdio: 'inherit'
	});
}

async function main(buildDir?: string, outDir?: string): Promise<void> {
	const arch = process.env['VSCODE_ARCH'];
	const quality = process.env['VSCODE_QUALITY'];

	if (!buildDir) {
		throw new Error('Build directory argument is required');
	}

	if (!arch) {
		throw new Error('$VSCODE_ARCH not set');
	}

	if (!outDir) {
		throw new Error('Output directory argument is required');
	}

	const appRoot = path.join(buildDir, `VSCode-darwin-${arch}`);
	const appName = product.nameLong + '.app';
	const appPath = path.join(appRoot, appName);
	const dmgName = `VSCode-darwin-${arch}`;
	const artifactPath = path.join(outDir, `${dmgName}.dmg`);
	const backgroundPath = path.join(import.meta.dirname, `dmg-background-${quality}.tiff`);
	const diskIconPath = path.join(root, 'resources', 'darwin', 'code.icns');
	let title = 'Code OSS';
	switch (quality) {
		case 'stable':
			title = 'VS Code';
			break;
		case 'insider':
			title = 'VS Code Insiders';
			break;
		case 'exploration':
			title = 'VS Code Exploration';
			break;
	}

	if (!fs.existsSync(appPath)) {
		throw new Error(`App path does not exist: ${appPath}`);
	}

	console.log(`Creating DMG for ${product.nameLong}...`);
	console.log(`  App path: ${appPath}`);
	console.log(`  Output directory: ${outDir}`);
	console.log(`  DMG name: ${dmgName}`);

	if (fs.existsSync(artifactPath)) {
		fs.unlinkSync(artifactPath);
	}

	// Copy and process the settings template for dmgbuild
	const settingsTemplatePath = path.join(import.meta.dirname, 'dmg-settings.py.template');
	const settingsFile = path.join(outDir, '.dmg-settings.py');
	let settingsContent = fs.readFileSync(settingsTemplatePath, 'utf8');
	settingsContent = settingsContent
		.replace('{{VOLUME_NAME}}', JSON.stringify(title))
		.replace('{{BADGE_ICON}}', JSON.stringify(diskIconPath))
		.replace('{{BACKGROUND}}', JSON.stringify(backgroundPath))
		.replace('{{APP_PATH}}', JSON.stringify(appPath))
		.replace('{{APP_NAME}}', JSON.stringify(product.nameLong + '.app'));
	fs.writeFileSync(settingsFile, settingsContent);

	try {
		await runDmgBuild(settingsFile, dmgName, artifactPath);
	} finally {
		if (fs.existsSync(settingsFile)) {
			fs.unlinkSync(settingsFile);
		}
	}

	if (!fs.existsSync(artifactPath)) {
		throw new Error(`DMG was not created at expected path: ${artifactPath}`);
	}

	const stats = fs.statSync(artifactPath);
	console.log(`Successfully created DMG: ${artifactPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

if (import.meta.main) {
	main(process.argv[2], process.argv[3]).catch(err => {
		console.error('Failed to create DMG:', err);
		process.exit(1);
	});
}
