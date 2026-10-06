/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { prepareCloudSandbox } from './cloudSandbox.ts';
import { root } from './installStateHash.ts';

if (prepareCloudSandbox()) {
	execFileSync(process.execPath, [path.join(root, 'build/npm/preinstall.ts')], {
		cwd: root,
		stdio: 'inherit',
		env: { ...process.env, npm_command: 'ci', VSCODE_FORCE_INSTALL: '1' },
	});
	console.log('Cloud Sandbox prerequisites are ready. npm install and npm ci can now build native dependencies.');
}
