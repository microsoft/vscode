/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { Application, Logger } from '../../../../automation';
import { installAllHandlers, timeout } from '../../utils';

/**
 * Verifies that window reload kills the extension host even when blocked.
 *
 */
export function setup(logger: Logger) {
	describe('Extension Host Restart', () => {

		installAllHandlers(logger, opts => opts);

		function processExists(pid: number): boolean {
			try {
				process.kill(pid, 0);
				return true;
			} catch {
				return false;
			}
		}

		it('kills blocked extension host on window reload (windowLifecycleBound)', async function () {
			this.timeout(60_000);

			const app = this.app as Application;
			const pidFile = path.join(app.workspacePathOrFolder, 'vscode-ext-host-pid.txt');

			if (fs.existsSync(pidFile)) {
				fs.unlinkSync(pidFile);
			}

			await app.workbench.quickaccess.runCommand('smoketest.getExtensionHostPidAndBlock');

			// Wait for PID file to be created
			let retries = 0;
			while (!fs.existsSync(pidFile) && retries < 20) {
				await timeout(500);
				retries++;
			}

			if (!fs.existsSync(pidFile)) {
				throw new Error('PID file was not created - extension may not have activated');
			}

			const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);
			logger.log(`Old extension host PID: ${pid}`);

			// Reload window while extension host is blocked
			await app.workbench.quickaccess.runCommand('Developer: Reload Window');
			await app.code.whenWorkbenchRestored();
			logger.log('Window reloaded');

			// Verify old process is gone, allowing for slower teardown on busy machines
			const maxWaitMs = 10_000;
			const pollIntervalMs = 500;
			let waitedMs = 0;
			while (processExists(pid) && waitedMs < maxWaitMs) {
				await timeout(pollIntervalMs);
				waitedMs += pollIntervalMs;
			}

			const stillExists = processExists(pid);
			if (stillExists) {
				throw new Error(`Extension host ${pid} still running after reload (waited ${maxWaitMs}ms)`);
			}

			logger.log('Extension host was properly killed on reload');
		});
	});
}
