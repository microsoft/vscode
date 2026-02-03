/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import { spawn } from '@malept/cross-spawn-promise';

const root = path.dirname(path.dirname(import.meta.dirname));
const product = JSON.parse(fs.readFileSync(path.join(root, 'product.json'), 'utf8'));

interface DmgBuildSettings {
	title: string;
	icon?: string | null;
	'badge-icon'?: string | null;
	background?: string;
	'background-color'?: string;
	'icon-size'?: number;
	'text-size'?: number;
	format?: string;
	window?: {
		position?: { x: number; y: number };
		size?: { width: number; height: number };
	};
	contents: Array<{
		path: string;
		x: number;
		y: number;
		type: 'file' | 'link';
		name?: string;
	}>;
}

function getDmgBuilderPath(): string {
	return path.join(import.meta.dirname, '..', 'node_modules', 'dmg-builder');
}

function getDmgBuilderVendorPath(): string {
	return path.join(getDmgBuilderPath(), 'vendor');
}

async function runDmgBuild(settingsFile: string, volumeName: string, artifactPath: string): Promise<void> {
	const vendorDir = getDmgBuilderVendorPath();
	const scriptPath = path.join(vendorDir, 'run_dmgbuild.py');
	await spawn('python3', [scriptPath, '-s', settingsFile, volumeName, artifactPath], {
		cwd: vendorDir,
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

	const settings: DmgBuildSettings = {
		title,
		'badge-icon': diskIconPath,
		background: backgroundPath,
		format: 'ULMO',
		'text-size': 12,
		window: {
			position: { x: 100, y: 400 },
			size: { width: 480, height: 352 }
		},
		contents: [
			{
				path: appPath,
				x: 120,
				y: 160,
				type: 'file'
			},
			{
				path: '/Applications',
				x: 360,
				y: 160,
				type: 'link'
			}
		]
	};

	const settingsFile = path.join(outDir, '.dmg-settings.json');
	fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));

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
