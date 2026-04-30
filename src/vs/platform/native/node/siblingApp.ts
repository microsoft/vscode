/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, spawn } from 'child_process';
import { statSync } from 'fs';
import { dirname, join } from '../../../base/common/path.js';
import { isMacintosh, isWindows, INodeProcess } from '../../../base/common/platform.js';
import { IProductConfiguration } from '../../../base/common/product.js';

export interface ISiblingAppLaunchResult {
	readonly child: ChildProcess;
}

/**
 * Launches the sibling application (host ↔ embedded) using a detached
 * child process with its own process group.
 *
 * @param product The product configuration of the **current** process.
 * @param args    CLI arguments to forward to the sibling app.
 * @param onError Optional callback invoked when the spawned process emits an error.
 * @returns The spawned detached child process, or `undefined` if the
 *          sibling could not be resolved on the current platform.
 */
export function launchSiblingApp(product: IProductConfiguration, args: string[] = [], onError?: (err: Error) => void): ISiblingAppLaunchResult | undefined {
	if (isMacintosh) {
		const bundleId = resolveSiblingDarwinBundleIdentifier(product);
		if (!bundleId) {
			return undefined;
		}
		const spawnArgs = ['-n', '-g', '-b', bundleId];
		if (args.length > 0) {
			spawnArgs.push('--args', ...args);
		}
		const child = spawn('open', spawnArgs, {
			detached: true,
			stdio: 'ignore',
		});
		child.on('error', err => onError?.(err));
		child.unref();
		return { child };
	}

	if (isWindows) {
		const exePath = resolveSiblingWindowsExePath(product);
		if (!exePath) {
			return undefined;
		}
		const child = spawn(exePath, args, {
			detached: true,
			stdio: 'ignore',
		});
		child.on('error', err => onError?.(err));
		child.unref();
		return { child };
	}

	return undefined;
}

/**
 * Returns the macOS bundle identifier for the sibling app.
 */
function resolveSiblingDarwinBundleIdentifier(product: IProductConfiguration): string | undefined {
	const isEmbedded = !!(process as INodeProcess).isEmbeddedApp;
	return isEmbedded
		? product.embedded?.darwinSiblingBundleIdentifier
		: product.darwinSiblingBundleIdentifier;
}

/**
 * Resolves the sibling app's Windows executable path.
 */
export function resolveSiblingWindowsExePath(product: IProductConfiguration): string | undefined {
	const isEmbedded = !!(process as INodeProcess).isEmbeddedApp;
	const siblingBasename = isEmbedded
		? product.embedded?.win32SiblingExeBasename
		: product.win32SiblingExeBasename;

	if (!siblingBasename) {
		return undefined;
	}

	const siblingExe = join(dirname(process.execPath), `${siblingBasename}.exe`);
	try {
		if (statSync(siblingExe).isFile()) {
			return siblingExe;
		}
	} catch {
		// may not exist on disk
	}

	return undefined;
}
