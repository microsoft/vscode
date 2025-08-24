/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
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

	let devKernel = undefined;
	const erdosParent = path.dirname(path.dirname(path.dirname(EXTENSION_ROOT_DIR)));
	const devDebugKernel = path.join(erdosParent, 'ark', 'target', 'debug', kernelName);
	const devReleaseKernel = path.join(erdosParent, 'ark', 'target', 'release', kernelName);
	const debugModified = fs.statSync(devDebugKernel, { throwIfNoEntry: false })?.mtime;
	const releaseModified = fs.statSync(devReleaseKernel, { throwIfNoEntry: false })?.mtime;

	if (debugModified) {
		devKernel = (releaseModified && releaseModified > debugModified) ? devReleaseKernel : devDebugKernel;
	} else if (releaseModified) {
		devKernel = devReleaseKernel;
	}
	if (devKernel) {
		LOGGER.info('Loading Ark from disk in adjacent repo. Make sure it\'s up-to-date.');
		return devKernel;
	}

	const embeddedKernel = path.join(EXTENSION_ROOT_DIR, 'resources', 'ark', kernelName);
	if (fs.existsSync(embeddedKernel)) {
		return embeddedKernel;
	}
}
