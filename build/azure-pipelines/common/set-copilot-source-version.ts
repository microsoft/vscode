/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { copilotSourceVersion } from './copilotSource.ts';

function main(): void {
	const root = path.join(import.meta.dirname, '../../..');
	const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version?: string };
	const version = copilotSourceVersion(packageJson.version ?? '', process.env['BUILD_SOURCEVERSION'] ?? '');
	console.log(`##vso[task.setvariable variable=COPILOT_SOURCE_VERSION]${version}`);
	console.log(`[copilot-source-version] Publishing Copilot source packages as ${version}.`);
}

if (import.meta.main) {
	main();
}
