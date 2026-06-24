/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
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
			const pidFile = path.join(os.tmpdir(), 'vscode-ext-host-pid.txt');

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
			await app.workbench.quickaccess.runCommand('Developer: Reload Window', { keepOpen: true });
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

		it('allows extensions to gracefully deactivate on window reload (windowLifecycleGraceTime)', async function () {
			this.timeout(60_000);

			const app = this.app as Application;
			const pidFile = path.join(os.tmpdir(), 'vscode-ext-host-pid-graceful.txt');
			const markerFile = path.join(os.tmpdir(), 'vscode-ext-host-deactivated.txt');

			// Clean up any existing files
			if (fs.existsSync(pidFile)) {
				fs.unlinkSync(pidFile);
			}
			if (fs.existsSync(markerFile)) {
				fs.unlinkSync(markerFile);
			}

			// Setup the extension to write a marker file on deactivation
			await app.workbench.quickaccess.runCommand('smoketest.setupGracefulDeactivation');

			// Wait for PID file to be created (confirms extension is ready)
			let retries = 0;
			while (!fs.existsSync(pidFile) && retries < 20) {
				await timeout(500);
				retries++;
			}

			if (!fs.existsSync(pidFile)) {
				throw new Error('PID file was not created - extension may not have activated');
			}

			const pid = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);
			logger.log(`Extension host PID for graceful deactivation test: ${pid}`);

			// Reload window - this should trigger graceful deactivation
			await app.workbench.quickaccess.runCommand('Developer: Reload Window', { keepOpen: true });
			await app.code.whenWorkbenchRestored();
			logger.log('Window reloaded');

			// Wait for the process to exit and marker file to be written
			const maxWaitMs = 10_000;
			const pollIntervalMs = 500;
			let waitedMs = 0;
			while (!fs.existsSync(markerFile) && waitedMs < maxWaitMs) {
				await timeout(pollIntervalMs);
				waitedMs += pollIntervalMs;
			}

			if (!fs.existsSync(markerFile)) {
				throw new Error(`Deactivation marker file was not created within ${maxWaitMs}ms - extension may not have been given time to deactivate gracefully`);
			}

			logger.log('Extension was given time to gracefully deactivate on reload');

			// Also verify the old process is gone
			waitedMs = 0;
			while (processExists(pid) && waitedMs < maxWaitMs) {
				await timeout(pollIntervalMs);
				waitedMs += pollIntervalMs;
			}

			if (processExists(pid)) {
				throw new Error(`Extension host ${pid} still running after reload (waited ${maxWaitMs}ms)`);
			}

			logger.log('Extension host was properly terminated after graceful deactivation');
		});

		it('kills blocked extension host on restart extension host (issue #296681)', async function () {
			this.timeout(90_000);

			const app = this.app as Application;
			const pidFile = path.join(os.tmpdir(), 'vscode-ext-host-pid.txt');
			const activationPidFile = path.join(os.tmpdir(), 'vscode-ext-host-pid-on-activate.txt');

			if (fs.existsSync(pidFile)) {
				fs.unlinkSync(pidFile);
			}

			await app.workbench.quickaccess.runCommand('smoketest.getExtensionHostPidAndBlock');

			let retries = 0;
			while (!fs.existsSync(pidFile) && retries < 20) {
				await timeout(500);
				retries++;
			}

			if (!fs.existsSync(pidFile)) {
				throw new Error('PID file was not created - extension may not have activated');
			}

			const oldPid = parseInt(fs.readFileSync(pidFile, 'utf-8'), 10);
			logger.log(`Old extension host PID: ${oldPid}`);

			if (fs.existsSync(activationPidFile)) {
				fs.unlinkSync(activationPidFile);
			}

			await app.workbench.quickaccess.runCommand('Developer: Restart Extension Host', { keepOpen: true });

			const maxWaitMs = 10_000;
			const pollIntervalMs = 500;
			let waitedMs = 0;

			let newPid: number | undefined;
			while (waitedMs < maxWaitMs) {
				if (fs.existsSync(activationPidFile)) {
					const pidText = fs.readFileSync(activationPidFile, 'utf-8').trim();
					const parsedPid = parseInt(pidText, 10);
					if (!Number.isNaN(parsedPid) && parsedPid !== oldPid) {
						newPid = parsedPid;
						break;
					}
				}

				await timeout(pollIntervalMs);
				waitedMs += pollIntervalMs;
			}

			if (!newPid) {
				throw new Error(`New extension host PID was not observed after restart (waited ${maxWaitMs}ms)`);
			}

			if (newPid === oldPid) {
				throw new Error(`Extension host PID did not change after restart (pid: ${oldPid})`);
			}

			logger.log(`New extension host PID observed: ${newPid}`);

			waitedMs = 0;
			while (processExists(oldPid) && waitedMs < maxWaitMs) {
				await timeout(pollIntervalMs);
				waitedMs += pollIntervalMs;
			}

			if (processExists(oldPid)) {
				throw new Error(`Old extension host ${oldPid} still running after restart (waited ${maxWaitMs}ms)`);
			}

			logger.log(`Extension host restarted successfully (old: ${oldPid}, new: ${newPid})`);
		});
	});
}
