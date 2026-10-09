/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { join } from '../../../../../../base/common/path.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { disableTestGitMaintenance } from '../harness/agentHostE2ETestHarness.js';
import { createManagedPluginMarketplace } from './copilotManagedPluginMarketplace.js';

const execFileAsync = promisify(execFile);

suite('Copilot managed plugin marketplace fixture', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	async function cloneMarketplace(sourceUrl: string, checkout: string): Promise<void> {
		await execFileAsync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'clone', sourceUrl, checkout]);
		disableTestGitMaintenance(checkout);
	}

	async function withMarketplace(run: (root: string, marketplace: Awaited<ReturnType<typeof createManagedPluginMarketplace>>) => Promise<void>): Promise<void> {
		const root = await mkdtemp(join(tmpdir(), 'managed-plugin-marketplace-'));
		const marketplace = await createManagedPluginMarketplace(root, 'gated-marketplace', [{
			name: 'gated-plugin',
			version: '1.0.0',
			skillName: 'gated-skill',
		}]);
		let testError: Error | undefined;
		try {
			await run(root, marketplace);
		} catch (error) {
			testError = error instanceof Error ? error : new Error(String(error));
		}
		const cleanupErrors: Error[] = [];
		try {
			await marketplace.close();
		} catch (error) {
			cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
		}
		try {
			await rm(root, { recursive: true, force: true });
		} catch (error) {
			cleanupErrors.push(error instanceof Error ? error : new Error(String(error)));
		}
		if (testError || cleanupErrors.length > 0) {
			const errors = testError ? [testError, ...cleanupErrors] : cleanupErrors;
			throw testError && cleanupErrors.length === 0
				? testError
				: new AggregateError(errors, `Managed plugin marketplace fixture failed: ${errors.map(error => error.message).join('; ')}`);
		}
	}

	test('holds a real Git fetch until the test releases it', async () => {
		await withMarketplace(async (root, marketplace) => {
			const checkout = join(root, 'checkout');
			const gate = marketplace.holdNextRequest();
			let cloneComplete = false;
			const clone = cloneMarketplace(marketplace.sourceUrl, checkout).then(() => {
				cloneComplete = true;
			});
			try {
				await gate.started;
				assert.strictEqual(cloneComplete, false);
				gate.release();
				await clone;
				assert.deepStrictEqual({
					cloneComplete,
					skill: (await readFile(join(checkout, 'plugins', 'gated-plugin', 'skills', 'gated-skill', 'SKILL.md'), 'utf8')).replace(/\r\n/g, '\n'),
				}, {
					cloneComplete: true,
					skill: '---\nname: gated-skill\ndescription: Managed plugin skill gated-skill.\n---\n\nManaged plugin skill gated-skill.',
				});
			} finally {
				gate.release();
			}
		});
	});

	test('fails one request and serves the next clone', async () => {
		await withMarketplace(async (root, marketplace) => {
			marketplace.failNextRequest();
			await assert.rejects(
				execFileAsync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'clone', marketplace.sourceUrl, join(root, 'failed-checkout')]),
				/requested URL returned error: 503|Marketplace temporarily unavailable/,
			);
			await cloneMarketplace(marketplace.sourceUrl, join(root, 'recovered-checkout'));
			assert.ok(marketplace.requestCount > 1);
		});
	});

	test('keeps returning unavailable responses until restored', async () => {
		await withMarketplace(async (root, marketplace) => {
			marketplace.setUnavailable(true);
			for (const checkout of ['unavailable-a', 'unavailable-b']) {
				await assert.rejects(
					execFileAsync('git', ['-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'clone', marketplace.sourceUrl, join(root, checkout)]),
					/requested URL returned error: 503|Marketplace temporarily unavailable/,
				);
			}
			marketplace.setUnavailable(false);
			await cloneMarketplace(marketplace.sourceUrl, join(root, 'available'));
			assert.ok(marketplace.requestCount > 2);
		});
	});

	test('publishes an update that an existing checkout can pull', async () => {
		await withMarketplace(async (root, marketplace) => {
			const checkout = join(root, 'update-checkout');
			await cloneMarketplace(marketplace.sourceUrl, checkout);
			await marketplace.publish([{
				name: 'gated-plugin',
				version: '2.0.0',
				skillName: 'updated-gated-skill',
			}]);
			await execFileAsync('git', ['pull', '--ff-only'], { cwd: checkout });

			assert.deepStrictEqual({
				version: await readFile(join(checkout, 'plugins', 'gated-plugin', 'VERSION'), 'utf8'),
				skill: (await readFile(join(checkout, 'plugins', 'gated-plugin', 'skills', 'updated-gated-skill', 'SKILL.md'), 'utf8')).replace(/\r\n/g, '\n'),
			}, {
				version: '2.0.0',
				skill: '---\nname: updated-gated-skill\ndescription: Managed plugin skill updated-gated-skill.\n---\n\nManaged plugin skill updated-gated-skill.',
			});
		});
	});
});
