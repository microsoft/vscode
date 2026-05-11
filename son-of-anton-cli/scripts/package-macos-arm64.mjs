#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Stage-1 packager — produce a single-binary `sota` for darwin-arm64 using
 * esbuild + Node SEA (Single Executable Applications).
 *
 * Stage 2 added the vendored Claude Code + Codex CLIs (see PACKAGING.md).
 *
 * The actual pipeline lives in `lib/sea-pipeline.mjs`; this script is a thin
 * platform descriptor for darwin-arm64.
 */

import { NODE_VERSION, runPipeline } from './lib/sea-pipeline.mjs';

const HOST_IS_TARGET = process.platform === 'darwin' && process.arch === 'arm64';

await runPipeline({
	id: 'darwin-arm64',
	os: 'darwin',
	cpu: 'arm64',
	exeFormat: 'macho',
	binaryName: 'sota',
	blobName: 'sota.blob',
	nodeArchiveName: `node-${NODE_VERSION}-darwin-arm64.tar.gz`,
	nodeDir: `node-${NODE_VERSION}-darwin-arm64`,
	nodeExeRelative: 'bin/node',
	matchesHost: HOST_IS_TARGET,
});
