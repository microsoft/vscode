/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { join } from '../../../base/common/path.js';
import { Promises } from '../../../base/node/pfs.js';

export async function buildTelemetryMessage(appRoot: string, extensionsPath?: string, builtinExtensionsPath?: string): Promise<string> {
	const mergedTelemetry = Object.create(null);

	const mergeTelemetry = (contents: string, dirName: string) => {
		const telemetryData = JSON.parse(contents);
		mergedTelemetry[dirName] = telemetryData;
	};

	const mergeExtensionTelemetry = async (path: string, useManifestIdentity: boolean) => {
		const dirs: string[] = [];

		const files = await Promises.readdir(path);
		for (const file of files) {
			try {
				const fileStat = await fs.promises.stat(join(path, file));
				if (fileStat.isDirectory()) {
					dirs.push(file);
				}
			} catch {
			}
		}

		const telemetryJsonFolders: string[] = [];
		for (const dir of dirs) {
			const files = (await Promises.readdir(join(path, dir))).filter(file => file === 'telemetry.json');
			if (files.length === 1) {
				telemetryJsonFolders.push(dir);
			}
		}

		for (const folder of telemetryJsonFolders) {
			const extensionPath = join(path, folder);
			const contents = (await fs.promises.readFile(join(extensionPath, 'telemetry.json'))).toString();
			let source = folder;
			if (useManifestIdentity) {
				const manifest = JSON.parse((await fs.promises.readFile(join(extensionPath, 'package.json'))).toString());
				source = `${manifest.publisher}.${manifest.name}-${manifest.version}`.toLowerCase();
			}
			mergeTelemetry(contents, source);
		}
	};

	if (builtinExtensionsPath) {
		await mergeExtensionTelemetry(builtinExtensionsPath, true);
	}

	if (extensionsPath) {
		await mergeExtensionTelemetry(extensionsPath, false);
	}

	let contents = (await fs.promises.readFile(join(appRoot, 'telemetry-core.json'))).toString();
	mergeTelemetry(contents, 'vscode-core');

	contents = (await fs.promises.readFile(join(appRoot, 'telemetry-extensions.json'))).toString();
	mergeTelemetry(contents, 'vscode-extensions');

	return JSON.stringify(mergedTelemetry, null, 4);
}
