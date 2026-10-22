/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { join } from '../../../../base/common/path.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostWorkspaceTrustConfigKey } from '../../common/agentHostSchema.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { CopilotProjectExtensionLaunchPolicy } from '../../node/copilot/copilotProjectExtensionLaunchPolicy.js';

suite('CopilotProjectExtensionLaunchPolicy', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPolicy(realpath: (path: string) => Promise<string> = fs.realpath) {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		return {
			configurationService,
			policy: new CopilotProjectExtensionLaunchPolicy(configurationService, logService, realpath),
		};
	}

	test('gates project launches by admission and workspace trust', async () => {
		const root = await fs.mkdtemp(`${os.tmpdir()}/copilot-extension-trust-`);
		const workspace = join(root, 'workspace');
		const trustedAlias = join(root, 'trusted-alias');
		const extensionDirectory = join(workspace, '.github', 'extensions', 'preview');
		const modulePath = join(extensionDirectory, 'extension.mjs');
		await fs.mkdir(extensionDirectory, { recursive: true });
		await fs.writeFile(modulePath, '');
		await fs.symlink(workspace, trustedAlias, process.platform === 'win32' ? 'junction' : 'dir');
		const { configurationService, policy } = createPolicy();
		try {
			const admission = disposables.add(await policy.acquireAdmission([URI.file(workspace)], undefined));
			const missingTrustConfig = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [] },
			});
			policy.updateTrust();
			const untrusted = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [URI.file(trustedAlias).toString()] },
			});
			policy.updateTrust();
			const trusted = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: false, trustedUris: [] },
			});
			policy.updateTrust();
			const trustDisabled = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			admission.dispose();
			const noAdmission = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');

			assert.deepStrictEqual({
				missingTrustConfig: !!missingTrustConfig.launch,
				untrusted: !!untrusted.launch,
				trusted: !!trusted.launch,
				trustDisabled: !!trustDisabled.launch,
				noAdmission: !!noAdmission.launch,
			}, {
				missingTrustConfig: false,
				untrusted: false,
				trusted: true,
				trustDisabled: true,
				noAdmission: false,
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('allows only the admitted workspace-less root without trust', async () => {
		const root = await fs.mkdtemp(`${os.tmpdir()}/copilot-extension-workspaceless-`);
		const scratch = join(root, 'scratch');
		const other = join(root, 'other');
		const scratchModule = join(scratch, '.github', 'extensions', 'preview', 'extension.mjs');
		const otherModule = join(other, '.github', 'extensions', 'preview', 'extension.mjs');
		await fs.mkdir(join(scratch, '.github', 'extensions', 'preview'), { recursive: true });
		await fs.mkdir(join(other, '.github', 'extensions', 'preview'), { recursive: true });
		await Promise.all([fs.writeFile(scratchModule, ''), fs.writeFile(otherModule, '')]);
		const { policy } = createPolicy();
		try {
			disposables.add(await policy.acquireAdmission([URI.file(scratch), URI.file(other)], URI.file(scratch)));

			assert.deepStrictEqual({
				scratch: !!(await policy.resolveLaunch(scratchModule, 'project', '/copilot-sdk/extension-bootstrap.mjs')).launch,
				other: !!(await policy.resolveLaunch(otherModule, 'project', '/copilot-sdk/extension-bootstrap.mjs')).launch,
			}, {
				scratch: true,
				other: false,
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('rejects symlink escapes and trust revocation during canonicalization', async () => {
		const root = await fs.mkdtemp(`${os.tmpdir()}/copilot-extension-race-`);
		const workspace = join(root, 'workspace');
		const untrustedDirectory = join(root, 'untrusted');
		const extensionDirectory = join(workspace, '.github', 'extensions', 'preview');
		const escapedDirectory = join(workspace, '.github', 'extensions', 'escaped');
		const modulePath = join(extensionDirectory, 'extension.mjs');
		const escapedModulePath = join(escapedDirectory, 'extension.mjs');
		await fs.mkdir(extensionDirectory, { recursive: true });
		await fs.mkdir(untrustedDirectory, { recursive: true });
		await fs.writeFile(modulePath, '');
		await fs.writeFile(join(untrustedDirectory, 'extension.mjs'), '');
		await fs.symlink(untrustedDirectory, escapedDirectory, process.platform === 'win32' ? 'junction' : 'dir');
		const realpathStarted = new DeferredPromise<void>();
		const releaseRealpath = new DeferredPromise<void>();
		let delayModuleResolution = false;
		const { configurationService, policy } = createPolicy(async path => {
			if (delayModuleResolution && isEqual(URI.file(path), URI.file(modulePath))) {
				realpathStarted.complete();
				await releaseRealpath.p;
			}
			return fs.realpath(path);
		});
		try {
			disposables.add(await policy.acquireAdmission([URI.file(workspace), URI.file(untrustedDirectory)], undefined));
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [URI.file(workspace).toString()] },
			});
			policy.updateTrust();
			const escaped = await policy.resolveLaunch(escapedModulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			delayModuleResolution = true;
			const revokedPromise = policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			await realpathStarted.p;
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [] },
			});
			policy.updateTrust();
			releaseRealpath.complete();
			const revoked = await revokedPromise;

			assert.deepStrictEqual({
				escaped: !!escaped.launch,
				revoked: !!revoked.launch,
			}, {
				escaped: false,
				revoked: false,
			});
		} finally {
			releaseRealpath.complete();
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('re-evaluates a launch against the latest trust when trust contracts while its roots resolve', async () => {
		const root = await fs.mkdtemp(`${os.tmpdir()}/copilot-extension-contract-`);
		const workspace = join(root, 'workspace');
		const other = join(root, 'other');
		const modulePath = join(workspace, '.github', 'extensions', 'preview', 'extension.mjs');
		await fs.mkdir(join(workspace, '.github', 'extensions', 'preview'), { recursive: true });
		await fs.mkdir(other);
		await fs.writeFile(modulePath, '');
		const realpathStarted = new DeferredPromise<void>();
		const releaseRealpath = new DeferredPromise<void>();
		const { configurationService, policy } = createPolicy(async path => {
			if (isEqual(URI.file(path), URI.file(other))) {
				realpathStarted.complete();
				await releaseRealpath.p;
			}
			return fs.realpath(path);
		});
		try {
			disposables.add(await policy.acquireAdmission([URI.file(workspace)], undefined));
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [URI.file(workspace).toString(), URI.file(other).toString()] },
			});
			policy.updateTrust();
			const launch = policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			await realpathStarted.p;
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [URI.file(workspace).toString()] },
			});
			policy.updateTrust();
			releaseRealpath.complete();

			assert.strictEqual(!!(await launch).launch, true);
		} finally {
			releaseRealpath.complete();
			await fs.rm(root, { recursive: true, force: true });
		}
	});

	test('honors a trusted root that resolves only after an earlier decision failed to resolve it', async () => {
		const root = await fs.mkdtemp(`${os.tmpdir()}/copilot-extension-late-root-`);
		const workspace = join(root, 'workspace');
		const trustedAlias = join(root, 'trusted-alias');
		const modulePath = join(workspace, '.github', 'extensions', 'preview', 'extension.mjs');
		await fs.mkdir(join(workspace, '.github', 'extensions', 'preview'), { recursive: true });
		await fs.writeFile(modulePath, '');
		const { configurationService, policy } = createPolicy();
		try {
			disposables.add(await policy.acquireAdmission([URI.file(workspace)], undefined));
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [URI.file(trustedAlias).toString()] },
			});
			policy.updateTrust();
			const beforeRootExists = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			await fs.symlink(workspace, trustedAlias, process.platform === 'win32' ? 'junction' : 'dir');
			const afterRootExists = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');

			assert.deepStrictEqual({
				beforeRootExists: !!beforeRootExists.launch,
				afterRootExists: !!afterRootExists.launch,
			}, {
				beforeRootExists: false,
				afterRootExists: true,
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});

});
