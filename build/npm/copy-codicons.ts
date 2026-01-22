/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';

const root = path.dirname(path.dirname(import.meta.dirname));

function log(message: string) {
	if (process.stdout.isTTY) {
		console.log(`\x1b[34m[.]\x1b[0m`, message);
	} else {
		console.log(`[.]`, message);
	}
}

// Copy codicon.ttf from @vscode/codicons package
const codiconSource = path.join(root, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.ttf');
const codiconDest = path.join(root, 'src', 'vs', 'base', 'browser', 'ui', 'codicons', 'codicon', 'codicon.ttf');

if (!fs.existsSync(codiconSource)) {
	console.error(`ERR codicon.ttf not found at ${codiconSource}`);
	process.exit(1);
}

try {
	fs.mkdirSync(path.dirname(codiconDest), { recursive: true });
	fs.copyFileSync(codiconSource, codiconDest);
	log(`Copied codicon.ttf to ${codiconDest}`);
} catch (error) {
	console.error(`ERR Failed to copy codicon.ttf from ${codiconSource} to ${codiconDest}:`, error);
	process.exit(1);
}
