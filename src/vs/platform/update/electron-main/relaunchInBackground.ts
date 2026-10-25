/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, spawn } from 'child_process';
import { dirname, join } from '../../../base/common/path.js';

/**
 * How long Squirrel's installer (ShipIt) must be gone before relaunching. Its launchd
 * job restarts it 2 seconds after a failed attempt.
 */
const INSTALLER_GONE_SECONDS = 5;

/**
 * Waits for process `$1` to exit, then until `$3` (`product.json`) contains commit `$2`,
 * or until ShipIt, whose launchd job is named after bundle identifier `$4`, has not run
 * for `$7` seconds. Then launches bundle `$6` with `$5` (`open`) without activating it.
 * Seconds only count while the machine is awake, and there is no timeout: if the machine
 * sleeps, the script continues where it left off.
 */
const RELAUNCH_SCRIPT = [
	'while kill -0 "$1" 2>/dev/null; do sleep 1; done',
	'gone=0',
	'while [ "$gone" -lt "$7" ]; do',
	'  if [ -n "$2" ] && grep -qF -- "$2" "$3" 2>/dev/null; then break; fi',
	'  if pgrep -f -- "/ShipIt $4.ShipIt" >/dev/null; then gone=0; else gone=$((gone+1)); fi',
	'  sleep 1',
	'done',
	'exec "$5" -g -a "$6"',
].join('\n');

export interface IBackgroundRelaunchOptions {

	/**
	 * The process to wait for, usually the current main process.
	 */
	readonly pid: number;

	/**
	 * The commit of the update that gets installed once the process exits, if known.
	 */
	readonly commit: string | undefined;

	/**
	 * The `appRoot` of the application, inside its `.app` bundle.
	 */
	readonly appRoot: string;

	/**
	 * The bundle identifier of the application, which names the launchd job of ShipIt.
	 */
	readonly bundleIdentifier: string;

	readonly openCommand?: string;
	readonly installerGoneSeconds?: number;
}

/**
 * Returns whether the value can identify an update by its commit.
 */
export function isCommit(value: string | undefined): value is string {
	return !!value && /^[0-9a-f]{7,40}$/i.test(value);
}

/**
 * macOS: launches the application without activating it once the process has exited and
 * Squirrel has installed the update, which it does when the application quits. If the
 * installation fails, the current version is launched once the installer gave up.
 */
export function relaunchInBackground(options: IBackgroundRelaunchOptions): ChildProcess {
	const bundlePath = dirname(dirname(dirname(options.appRoot)));
	const child = spawn('/bin/sh', [
		'-c', RELAUNCH_SCRIPT, 'code-relaunch',
		String(options.pid),
		isCommit(options.commit) ? options.commit : '',
		join(options.appRoot, 'product.json'),
		options.bundleIdentifier,
		options.openCommand ?? '/usr/bin/open',
		bundlePath,
		String(options.installerGoneSeconds ?? INSTALLER_GONE_SECONDS)
	], {
		detached: true,
		stdio: 'ignore'
	});
	child.unref();

	return child;
}
