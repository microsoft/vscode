/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as vscode from 'vscode';
import { LOGGER } from './extension';
import { EXTENSION_ROOT_DIR } from './constants';

export function getArkKernelPath(): string | undefined {
	const arkConfig = vscode.workspace.getConfiguration('erdos.r');
	const kernelPath = arkConfig.get<string>('kernel.path');
	if (kernelPath) {
		return kernelPath;
	}

	const kernelName = os.platform() === 'win32' ? 'ark.exe' : 'ark';
	const path = require('path');
	const fs = require('fs');

	// First priority: GitHub/ark source binary (newest available)
	const erdosParent = path.dirname(path.dirname(path.dirname(EXTENSION_ROOT_DIR)));
	const devDebugKernel = path.join(erdosParent, 'ark', 'target', 'debug', kernelName);
	const devReleaseKernel = path.join(erdosParent, 'ark', 'target', 'release', kernelName);
	const debugModified = fs.existsSync(devDebugKernel) ? fs.statSync(devDebugKernel).mtime : null;
	const releaseModified = fs.existsSync(devReleaseKernel) ? fs.statSync(devReleaseKernel).mtime : null;

	let devKernel = undefined;
	if (debugModified && releaseModified) {
		devKernel = releaseModified > debugModified ? devReleaseKernel : devDebugKernel;
	} else if (debugModified) {
		devKernel = devDebugKernel;
	} else if (releaseModified) {
		devKernel = devReleaseKernel;
	}
	
	if (devKernel) {
		LOGGER.info(`Using GitHub/ark source binary: ${devKernel}`);
		return devKernel;
	}

	// Fallback to embedded binary if source binary doesn't exist
	const embeddedKernel = path.join(EXTENSION_ROOT_DIR, 'resources', 'ark', kernelName);
	if (fs.existsSync(embeddedKernel)) {
		LOGGER.info('Using embedded Ark kernel.');
		return embeddedKernel;
	}
}
