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
import { CopilotProjectExtensionLaunchPolicy, parseCopilotProjectExtensionTrustGrant, serializeCopilotProjectExtensionTrustGrant } from '../../node/copilot/copilotProjectExtensionLaunchPolicy.js';

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
			const untrusted = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [], connectionAuthorityTrusted: true },
			});
			const authorityTrusted = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [URI.file(trustedAlias).toString()] },
			});
			const trusted = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: false, trustedUris: [] },
			});
			const trustDisabled = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			admission.dispose();
			const noAdmission = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');

			assert.deepStrictEqual({
				missingTrustConfig: !!missingTrustConfig.launch,
				untrusted: !!untrusted.launch,
				authorityTrusted: !!authorityTrusted.launch,
				trusted: !!trusted.launch,
				trustDisabled: !!trustDisabled.launch,
				noAdmission: !!noAdmission.launch,
			}, {
				missingTrustConfig: false,
				untrusted: false,
				authorityTrusted: true,
				trusted: true,
				trustDisabled: true,
				noAdmission: false,
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
			const escaped = await policy.resolveLaunch(escapedModulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			delayModuleResolution = true;
			const revokedPromise = policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			await realpathStarted.p;
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [] },
			});
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

	test('validates, rechecks, and binds inherited worktree trust', async () => {
		const root = await fs.mkdtemp(`${os.tmpdir()}/copilot-worktree-trust-`);
		const repository = join(root, 'repository');
		const worktree = join(root, 'repository.worktrees', 'session');
		const swappedWorktree = join(root, 'repository.worktrees', 'swapped');
		const siblingWorktree = join(root, 'repository.worktrees', 'sibling');
		const ordinaryFolder = join(root, 'repository.worktrees', 'ordinary');
		const extensionDirectory = join(worktree, '.github', 'extensions', 'preview');
		const swappedExtensionDirectory = join(swappedWorktree, '.github', 'extensions', 'preview');
		const siblingExtensionDirectory = join(siblingWorktree, '.github', 'extensions', 'preview');
		const modulePath = join(extensionDirectory, 'extension.mjs');
		const swappedModulePath = join(swappedExtensionDirectory, 'extension.mjs');
		await fs.mkdir(repository, { recursive: true });
		await fs.mkdir(extensionDirectory, { recursive: true });
		await fs.mkdir(swappedExtensionDirectory, { recursive: true });
		await fs.mkdir(siblingExtensionDirectory, { recursive: true });
		await fs.mkdir(ordinaryFolder, { recursive: true });
		await fs.writeFile(modulePath, '');
		await fs.writeFile(swappedModulePath, '');
		await fs.writeFile(join(siblingExtensionDirectory, 'extension.mjs'), '');
		const { configurationService, policy } = createPolicy();
		try {
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [URI.file(repository).toString()] },
			});
			const grant = await policy.resolveTrustGrant(URI.file(worktree), {
				kind: 'knownRepository',
				repositoryRoot: URI.file(repository),
			});
			const derivedGrant = await policy.resolveTrustGrant(URI.file(worktree), {
				kind: 'hostCreatedWorktree',
			});
			const invalidGrant = await policy.resolveTrustGrant(URI.file(ordinaryFolder), {
				kind: 'knownRepository',
				repositoryRoot: URI.file(ordinaryFolder),
			});
			const swappedGrant = await policy.resolveTrustGrant(URI.file(swappedWorktree), {
				kind: 'knownRepository',
				repositoryRoot: URI.file(repository),
			});
			await fs.rm(swappedWorktree, { recursive: true, force: true });
			await fs.symlink(siblingWorktree, swappedWorktree, process.platform === 'win32' ? 'junction' : 'dir');
			const swappedAdmission = disposables.add(await policy.acquireAdmission([URI.file(swappedWorktree)], swappedGrant));
			const swappedAfterValidation = await policy.resolveLaunch(swappedModulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			swappedAdmission.dispose();
			const movedGrant = await policy.resolvePersistedTrustGrant(URI.file(ordinaryFolder), grant);
			const roundTrip = parseCopilotProjectExtensionTrustGrant(serializeCopilotProjectExtensionTrustGrant(grant));
			const worktreeAdmission = disposables.add(await policy.acquireAdmission([URI.file(worktree)], grant));
			const inheritedWorktree = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			configurationService.updateRootConfig({
				[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [] },
			});
			const inheritedAfterRevocation = await policy.resolveLaunch(modulePath, 'project', '/copilot-sdk/extension-bootstrap.mjs');
			worktreeAdmission.dispose();

			assert.deepStrictEqual({
				grant: grant && {
					worktreeDirectory: grant.worktreeDirectory.toString(),
					repositoryRoot: grant.repositoryRoot.toString(),
				},
				derivedGrant: derivedGrant && {
					worktreeDirectory: derivedGrant.worktreeDirectory.toString(),
					repositoryRoot: derivedGrant.repositoryRoot.toString(),
				},
				roundTrip: roundTrip && {
					worktreeDirectory: roundTrip.worktreeDirectory.toString(),
					repositoryRoot: roundTrip.repositoryRoot.toString(),
				},
				invalidGrant,
				swappedAfterValidation: !!swappedAfterValidation.launch,
				movedGrant,
				inheritedWorktree: !!inheritedWorktree.launch,
				inheritedAfterRevocation: !!inheritedAfterRevocation.launch,
			}, {
				grant: {
					worktreeDirectory: URI.file(await fs.realpath(worktree)).toString(),
					repositoryRoot: URI.file(await fs.realpath(repository)).toString(),
				},
				derivedGrant: {
					worktreeDirectory: URI.file(await fs.realpath(worktree)).toString(),
					repositoryRoot: URI.file(await fs.realpath(repository)).toString(),
				},
				roundTrip: {
					worktreeDirectory: URI.file(await fs.realpath(worktree)).toString(),
					repositoryRoot: URI.file(await fs.realpath(repository)).toString(),
				},
				invalidGrant: undefined,
				swappedAfterValidation: false,
				movedGrant: undefined,
				inheritedWorktree: true,
				inheritedAfterRevocation: false,
			});
		} finally {
			await fs.rm(root, { recursive: true, force: true });
		}
	});
});
