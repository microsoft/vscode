/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import os from 'os';
import rimraf from 'rimraf';
import es from 'event-stream';
import { rename } from './gulp/facade.ts';
import vfs from 'vinyl-fs';
import * as ext from './extensions.ts';
import { getCurrentExtensionTarget, getPlatformSpecificAssetName } from './extensionTarget.ts';
import fancyLog from 'fancy-log';
import ansiColors from 'ansi-colors';
import { Stream } from 'stream';

export interface IExtensionDefinition {
	name: string;
	version: string;
	sha256: string;
	repo: string;
	platforms?: string[];
	vsix?: string;
	/**
	 * Per-target checksums for a platform-specific extension published to a GitHub release.
	 * Keyed by marketplace target platform (e.g. `win32-x64`, `linux-armhf`, `alpine-x64`).
	 * The matching release asset is resolved by convention as `<name>-<osAlias>-<arch>.vsix`.
	 */
	platformSpecific?: { [target: string]: string };
	metadata: {
		id: string;
		publisherId: {
			publisherId: string;
			publisherName: string;
			displayName: string;
			flags: string;
		};
		publisherDisplayName: string;
	};
}

const root = path.dirname(path.dirname(import.meta.dirname));
const productjson = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../product.json'), 'utf8'));
const builtInExtensions = productjson.builtInExtensions as IExtensionDefinition[] || [];
const webBuiltInExtensions = productjson.webBuiltInExtensions as IExtensionDefinition[] || [];
const controlFilePath = path.join(os.homedir(), '.vscode-oss-dev', 'extensions', 'control.json');
const ENABLE_LOGGING = !process.env['VSCODE_BUILD_BUILTIN_EXTENSIONS_SILENCE_PLEASE'];

function log(...messages: string[]): void {
	if (ENABLE_LOGGING) {
		fancyLog(...messages);
	}
}

function getExtensionPath(extension: IExtensionDefinition): string {
	return path.join(root, '.build', 'builtInExtensions', extension.name);
}

function isUpToDate(extension: IExtensionDefinition): boolean {
	const packagePath = path.join(getExtensionPath(extension), 'package.json');

	if (!fs.existsSync(packagePath)) {
		return false;
	}

	const packageContents = fs.readFileSync(packagePath, { encoding: 'utf8' });

	try {
		const diskVersion = JSON.parse(packageContents).version;
		return (diskVersion === extension.version);
	} catch (err) {
		return false;
	}
}

function isInsiders(): boolean {
	return process.env['VSCODE_QUALITY'] === 'insider';
}

function getExtensionDownloadStream(extension: IExtensionDefinition) {
	let input: Stream;

	if (extension.vsix) {
		input = ext.fromVsix(path.join(root, extension.vsix), extension);
	} else if (extension.platformSpecific) {
		// A platform-specific extension publishes its VSIX assets on a GitHub release using a
		// specific asset naming convention, so it is always downloaded from GitHub and never falls
		// back to the Marketplace (which does not serve those assets) even when a gallery is configured.
		const asset = resolvePlatformSpecificAsset(extension);
		if (!asset) {
			return es.readArray([]);
		}
		input = ext.fromGithub(extension, { asset, latest: isInsiders() });
	} else if (productjson.extensionsGallery?.serviceUrl) {
		input = ext.fromMarketplace(productjson.extensionsGallery.serviceUrl, extension);
	} else {
		input = ext.fromGithub(extension, { latest: isInsiders() });
	}

	return input.pipe(rename(p => p.dirname = `${extension.name}/${p.dirname}`));
}

function resolvePlatformSpecificAsset(extension: IExtensionDefinition): { assetName: string; sha256: string } | undefined {
	const target = getCurrentExtensionTarget();
	if (!target) {
		// Unsupported build platform (e.g. FreeBSD): no platform-specific asset can apply, so skip
		// this extension gracefully instead of failing the whole build.
		log(ansiColors.yellow('[skip]'), `${extension.name}: no platform-specific asset for unsupported platform '${process.platform}-${process.env['VSCODE_ARCH'] ?? process.arch}'`);
		return undefined;
	}

	const sha256 = extension.platformSpecific![target];
	if (!sha256) {
		// The extension declares platform-specific assets but is missing one for this known target.
		// This is a configuration error, so fail loudly.
		throw new Error(`Built-in extension '${extension.name}' is platform-specific but has no asset for target '${target}'. Available targets: [${Object.keys(extension.platformSpecific!)}]`);
	}

	return { assetName: getPlatformSpecificAssetName(extension.name, target), sha256 };
}

export function getExtensionStream(extension: IExtensionDefinition) {
	// if the extension exists on disk, use those files instead of downloading anew
	if (isUpToDate(extension)) {
		log('[extensions]', `${extension.name}@${extension.version} up to date`, ansiColors.green('✔︎'));
		return vfs.src(['**'], { cwd: getExtensionPath(extension), dot: true })
			.pipe(rename(p => p.dirname = `${extension.name}/${p.dirname}`));
	}

	return getExtensionDownloadStream(extension);
}

function syncMarketplaceExtension(extension: IExtensionDefinition): Stream {
	const galleryServiceUrl = productjson.extensionsGallery?.serviceUrl;
	const source = ansiColors.blue(galleryServiceUrl ? '[marketplace]' : '[github]');
	if (isUpToDate(extension)) {
		log(source, `${extension.name}@${extension.version}`, ansiColors.green('✔︎'));
		return es.readArray([]);
	}

	rimraf.sync(getExtensionPath(extension));

	return getExtensionDownloadStream(extension)
		.pipe(vfs.dest('.build/builtInExtensions'))
		.on('end', () => log(source, extension.name, ansiColors.green('✔︎')));
}

function syncExtension(extension: IExtensionDefinition, controlState: 'disabled' | 'marketplace'): Stream {
	if (extension.platforms) {
		const platforms = new Set(extension.platforms);

		if (!platforms.has(process.platform)) {
			log(ansiColors.gray('[skip]'), `${extension.name}@${extension.version}: Platform '${process.platform}' not supported: [${extension.platforms}]`, ansiColors.green('✔︎'));
			return es.readArray([]);
		}
	}

	switch (controlState) {
		case 'disabled':
			log(ansiColors.blue('[disabled]'), ansiColors.gray(extension.name));
			return es.readArray([]);

		case 'marketplace':
			return syncMarketplaceExtension(extension);

		default:
			if (!fs.existsSync(controlState)) {
				log(ansiColors.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but that path does not exist.`));
				return es.readArray([]);

			} else if (!fs.existsSync(path.join(controlState, 'package.json'))) {
				log(ansiColors.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but there is no 'package.json' file in that directory.`));
				return es.readArray([]);
			}

			log(ansiColors.blue('[local]'), `${extension.name}: ${ansiColors.cyan(controlState)}`, ansiColors.green('✔︎'));
			return es.readArray([]);
	}
}

interface IControlFile {
	[name: string]: 'disabled' | 'marketplace';
}

function readControlFile(): IControlFile {
	try {
		return JSON.parse(fs.readFileSync(controlFilePath, 'utf8'));
	} catch (err) {
		return {};
	}
}

function writeControlFile(control: IControlFile): void {
	fs.mkdirSync(path.dirname(controlFilePath), { recursive: true });
	fs.writeFileSync(controlFilePath, JSON.stringify(control, null, 2));
}

export function getBuiltInExtensions(): Promise<void> {
	log('Synchronizing built-in extensions...');
	log(`You can manage built-in extensions with the ${ansiColors.cyan('--builtin')} flag`);

	const control = readControlFile();
	const streams: Stream[] = [];

	for (const extension of [...builtInExtensions, ...webBuiltInExtensions]) {
		const controlState = control[extension.name] || 'marketplace';
		control[extension.name] = controlState;

		streams.push(syncExtension(extension, controlState));
	}

	writeControlFile(control);

	return new Promise((resolve, reject) => {
		es.merge(streams)
			.on('error', reject)
			.on('end', resolve);
	});
}

if (import.meta.main) {
	getBuiltInExtensions().then(() => process.exit(0)).catch(err => {
		console.error(err);
		process.exit(1);
	});
}
