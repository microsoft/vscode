/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import cp from 'child_process';
import fs from 'fs';
import path from 'path';

const root = path.dirname(path.dirname(path.dirname(import.meta.dirname)));

export type UseRunnerNodeForServerResult = 'present' | 'versionMismatch' | 'copied';

/**
 * The web and remote tests start the server out of sources, and `npm run gulp node` downloads the server's Node.js
 * from nodejs.org unless it is already in `.build/node`. When the runner's Node.js is the version that the server
 * needs, copies it there instead, so that the tests do not depend on nodejs.org.
 *
 * @param serverNodePath where the server's Node.js goes, as printed by `build/lib/node.ts`
 * @param serverNodeVersion the version that `remote/.npmrc` pins, without the `v` prefix
 */
export function useRunnerNodeForServer(serverNodePath: string, serverNodeVersion: string, runnerNodePath = process.execPath, runnerNodeVersion = process.version): UseRunnerNodeForServerResult {
	if (fs.existsSync(serverNodePath)) {
		return 'present';
	}
	if (runnerNodeVersion !== `v${serverNodeVersion}`) {
		return 'versionMismatch';
	}

	// `npm run gulp node` skips the download when this folder exists, so remove it again if the copy fails.
	const serverNodeFolder = path.dirname(serverNodePath);
	fs.mkdirSync(serverNodeFolder, { recursive: true });
	try {
		fs.copyFileSync(runnerNodePath, serverNodePath);
		fs.chmodSync(serverNodePath, 0o755);
	} catch (error) {
		fs.rmSync(serverNodeFolder, { recursive: true, force: true });
		throw error;
	}
	return 'copied';
}

function main(): void {
	const serverNodePath = cp.execFileSync(process.execPath, [path.join(root, 'build', 'lib', 'node.ts')], { encoding: 'utf8' }).trim();
	const npmrc = fs.readFileSync(path.join(root, 'remote', '.npmrc'), 'utf8');
	const serverNodeVersion = /^target="(.*)"$/m.exec(npmrc)?.[1];
	if (!serverNodeVersion) {
		throw new Error('Cannot find the Node.js version of the server in remote/.npmrc.');
	}

	switch (useRunnerNodeForServer(serverNodePath, serverNodeVersion)) {
		case 'present':
			console.log(`The server's Node.js is already at ${serverNodePath}.`);
			break;
		case 'versionMismatch':
			console.log(`The runner has Node.js ${process.version}, but the server needs v${serverNodeVersion}, so \`npm run gulp node\` downloads it.`);
			break;
		case 'copied':
			console.log(`Copied the runner's Node.js ${process.version} to ${serverNodePath}.`);
			break;
	}
}

if (import.meta.main) {
	try {
		main();
	} catch (error) {
		// Reusing the runner's Node.js only saves a download, so a failure must not keep the tests from running.
		console.log(`::warning::Cannot use the runner's Node.js for the server, so \`npm run gulp node\` downloads it: ${error instanceof Error ? error.message : String(error)}`);
	}
}
