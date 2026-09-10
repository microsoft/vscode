/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDevContainerAgentHostMainService } from '../../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerWorktreeEnabledSettingId } from '../../../../../common/devContainerAgentHostService.js';
import { ensureDevContainerAgentHostsEnabled, isDevContainerWorkspaceAvailable } from '../../electron-browser/devContainerAgentHostConnector.contribution.js';

suite('Dev Container Agent Host Connector', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	// Capture these before configuration registry tests clear global registrations.
	const devContainerAgentHostEnabledProperty = configurationRegistry.getConfigurationProperties()[DevContainerAgentHostEnabledSettingId];
	const devContainerWorktreeEnabledProperty = configurationRegistry.getExcludedConfigurationProperties()[DevContainerWorktreeEnabledSettingId];

	test('requires Docker and a default Dev Container configuration', async () => {
		const workspaceUri = URI.file('/workspace');
		const check = (existingPaths: readonly string[], dockerAvailable: boolean, devContainerAgentHostsEnabled = true, remoteAgentHostsEnabled = true, uri = workspaceUri) => {
			const fileService = new class extends mock<IFileService>() {
				override async exists(resource: URI): Promise<boolean> {
					return existingPaths.includes(resource.path);
				}
			}();
			const mainService = new class extends mock<IDevContainerAgentHostMainService>() {
				override async isDockerAvailable(): Promise<boolean> {
					return dockerAvailable;
				}
			}();
			const configurationService = new TestConfigurationService({
				[DevContainerAgentHostEnabledSettingId]: devContainerAgentHostsEnabled,
				[RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled,
			});
			return isDevContainerWorkspaceAvailable(uri, fileService, mainService, configurationService);
		};

		assert.deepStrictEqual({
			nestedConfig: await check(['/workspace/.devcontainer/devcontainer.json'], true),
			rootConfig: await check(['/workspace/.devcontainer.json'], true),
			noDocker: await check(['/workspace/.devcontainer/devcontainer.json'], false),
			noConfig: await check([], true),
			devContainerAgentHostsDisabled: await check(['/workspace/.devcontainer/devcontainer.json'], true, false),
			remoteAgentHostsDisabled: await check(['/workspace/.devcontainer/devcontainer.json'], true, true, false),
			nonFileWorkspace: await check(['/workspace/.devcontainer/devcontainer.json'], true, true, true, URI.parse('vscode-remote://host/workspace')),
		}, {
			nestedConfig: true,
			rootConfig: true,
			noDocker: false,
			noConfig: false,
			devContainerAgentHostsDisabled: false,
			remoteAgentHostsDisabled: false,
			nonFileWorkspace: false,
		});
	});

	test('registers an experimental, disabled-by-default user setting', () => {
		assert.deepStrictEqual({
			default: devContainerAgentHostEnabledProperty.default,
			scope: devContainerAgentHostEnabledProperty.scope,
			tags: devContainerAgentHostEnabledProperty.tags,
			experiment: devContainerAgentHostEnabledProperty.experiment,
		}, {
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('registers a hidden experimental setting for combining Dev Containers and worktrees', () => {
		assert.deepStrictEqual({
			default: devContainerWorktreeEnabledProperty.default,
			scope: devContainerWorktreeEnabledProperty.scope,
			tags: devContainerWorktreeEnabledProperty.tags,
			experiment: devContainerWorktreeEnabledProperty.experiment,
		}, {
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('rejects connections when Dev Container or remote Agent Hosts are disabled', () => {
		const configurationService = (devContainerAgentHostsEnabled: boolean, remoteAgentHostsEnabled: boolean) => new TestConfigurationService({
			[DevContainerAgentHostEnabledSettingId]: devContainerAgentHostsEnabled,
			[RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled,
		});

		assert.throws(() => ensureDevContainerAgentHostsEnabled(configurationService(false, true)), /Dev Container Agent Host connections are not enabled/);
		assert.throws(() => ensureDevContainerAgentHostsEnabled(configurationService(true, false)), /Remote Agent Host connections are not enabled/);
	});
});
