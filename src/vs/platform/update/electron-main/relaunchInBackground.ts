/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, spawn } from 'child_process';
import { dirname, join } from '../../../base/common/path.js';

/**
 * How long to wait for the update to be installed before relaunching anyway.
 */
const INSTALL_TIMEOUT_SECONDS = 300;

/**
 * Waits for process `$1` to exit and for `$3` (`product.json`) to contain commit `$2`,
 * then launches bundle `$5` with `$4` (`open`) without activating it.
 */
const RELAUNCH_SCRIPT = [
	'while kill -0 "$1" 2>/dev/null; do sleep 1; done',
	'i=0',
	`while [ "$i" -lt ${INSTALL_TIMEOUT_SECONDS} ] && ! grep -qF -- "$2" "$3" 2>/dev/null; do sleep 1; i=$((i+1)); done`,
	'exec "$4" -g -a "$5" --args --open-in-background',
].join('\n');

export interface IBackgroundRelaunchOptions {

	/**
	 * The process to wait for, usually the current main process.
	 */
	readonly pid: number;

	/**
	 * The commit of the update that gets installed once the process exits.
	 */
	readonly commit: string;

	/**
	 * The `appRoot` of the application, inside its `.app` bundle.
	 */
	readonly appRoot: string;

	readonly openCommand?: string;
}

/**
 * Returns whether the value can identify an update by its commit.
 */
export function isCommit(value: string | undefined): value is string {
	return !!value && /^[0-9a-f]{7,40}$/i.test(value);
}

/**
 * macOS: launches the application without activating it once the process has exited
 * and the update, which Squirrel installs when the application quits, is in place.
 * If the update does not get installed in time, the current version is launched.
 */
export function relaunchInBackground(options: IBackgroundRelaunchOptions): ChildProcess {
	const bundlePath = dirname(dirname(dirname(options.appRoot)));
	const child = spawn('/bin/sh', ['-c', RELAUNCH_SCRIPT, 'code-relaunch', String(options.pid), options.commit, join(options.appRoot, 'product.json'), options.openCommand ?? '/usr/bin/open', bundlePath], {
		detached: true,
		stdio: 'ignore'
	});
	child.unref();

	return child;
}
