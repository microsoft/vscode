#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Stage-3 packager — produce a single-binary `sota-linux-x64` for ELF
 * Linux x86_64 using esbuild + Node SEA. The script can run on any host that
 * has `npm`, `curl`, and `tar` available (the cross-build doesn't actually
 * execute the Linux ELF; postject injects the SEA blob into the official
 * `node-${NODE_VERSION}-linux-x64.tar.xz` payload).
 *
 * Codesigning is skipped on Linux (unsigned ELF is the norm); the smoke
 * step is skipped when the host platform differs from the target.
 */

import { NODE_VERSION, runPipeline } from './lib/sea-pipeline.mjs';

const HOST_IS_TARGET = process.platform === 'linux' && process.arch === 'x64';

await runPipeline({
	id: 'linux-x64',
	os: 'linux',
	cpu: 'x64',
	exeFormat: 'elf',
	binaryName: 'sota-linux-x64',
	blobName: 'sota-linux-x64.blob',
	nodeArchiveName: `node-${NODE_VERSION}-linux-x64.tar.xz`,
	nodeDir: `node-${NODE_VERSION}-linux-x64`,
	nodeExeRelative: 'bin/node',
	matchesHost: HOST_IS_TARGET,
});
