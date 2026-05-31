/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import { join } from '../../../base/common/path.js';
import { Promises } from '../../../base/node/pfs.js';

export async function buildTelemetryMessage(appRoot: string, extensionsPath?: string): Promise<string> {
	const mergedTelemetry = Object.create(null);

	// Simple function to merge the telemetry into one json object
	const mergeTelemetry = (contents: string, dirName: string) => {
		const telemetryData = JSON.parse(contents);
		mergedTelemetry[dirName] = telemetryData;
	};

	if (extensionsPath) {
		const dirs: string[] = [];

		const files = await Promises.readdir(extensionsPath);
		for (const file of files) {
			try {
				const fileStat = await fs.promises.stat(join(extensionsPath, file));
				if (fileStat.isDirectory()) {
					dirs.push(file);
				}
			} catch {
				// This handles case where broken symbolic links can cause statSync to throw and error
			}
		}

		const telemetryJsonFolders: string[] = [];
		for (const dir of dirs) {
			const files = (await Promises.readdir(join(extensionsPath, dir))).filter(file => file === 'telemetry.json');
			if (files.length === 1) {
				telemetryJsonFolders.push(dir); // // We know it contains a telemetry.json file so we add it to the list of folders which have one
			}
		}

		for (const folder of telemetryJsonFolders) {
			const contents = (await fs.promises.readFile(join(extensionsPath, folder, 'telemetry.json'))).toString();
			mergeTelemetry(contents, folder);
		}
	}

	let contents = (await fs.promises.readFile(join(appRoot, 'telemetry-core.json'))).toString();
	mergeTelemetry(contents, 'vscode-core');

	contents = (await fs.promises.readFile(join(appRoot, 'telemetry-extensions.json'))).toString();
	mergeTelemetry(contents, 'vscode-extensions');

	return JSON.stringify(mergedTelemetry, null, 4);
}
