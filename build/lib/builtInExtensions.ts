/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import fs from 'fs';
import path from 'path';
import os from 'os';
import rimraf from 'rimraf';
import es from 'event-stream';
import rename from 'gulp-rename';
import vfs from 'vinyl-fs';
import * as ext from './extensions.ts';
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

function getExtensionDownloadStream(extension: IExtensionDefinition) {
	let input: Stream;

	if (extension.vsix) {
		input = ext.fromVsix(path.join(root, extension.vsix), extension);
	} else if (productjson.extensionsGallery?.serviceUrl) {
		input = ext.fromMarketplace(productjson.extensionsGallery.serviceUrl, extension);
	} else {
		input = ext.fromGithub(extension);
	}

	return input.pipe(rename(p => p.dirname = `${extension.name}/${p.dirname}`));
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
