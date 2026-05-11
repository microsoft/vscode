#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Stage-3 packager — produce a single-binary `sota-windows-x64.exe` for
 * Windows x86_64 using esbuild + Node SEA. The script can run on any host
 * that has `npm`, `curl`, `unzip`, and `tar` available; postject injects
 * the SEA blob into the official `node.exe` extracted from the Node v22
 * Windows tarball.
 *
 * Codesigning is skipped (use signtool / Authenticode in a later stage
 * before distribution); the smoke step is skipped when the host platform
 * differs from the target.
 */

import { NODE_VERSION, runPipeline } from './lib/sea-pipeline.mjs';

const HOST_IS_TARGET = process.platform === 'win32' && process.arch === 'x64';

await runPipeline({
	id: 'windows-x64',
	os: 'win32',
	cpu: 'x64',
	exeFormat: 'windows',
	binaryName: 'sota-windows-x64.exe',
	blobName: 'sota-windows-x64.blob',
	nodeArchiveName: `node-${NODE_VERSION}-win-x64.zip`,
	nodeDir: `node-${NODE_VERSION}-win-x64`,
	nodeExeRelative: 'node.exe',
	matchesHost: HOST_IS_TARGET,
});
