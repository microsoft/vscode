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
import { DevContainerAgentHostEnabledSettingId } from '../../../../../common/devContainerAgentHostService.js';
import { ensureDevContainerAgentHostsEnabled, isDevContainerWorkspaceAvailable } from '../../electron-browser/devContainerAgentHostConnector.contribution.js';

suite('Dev Container Agent Host Connector', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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

	test('registers a hidden, disabled-by-default user setting', () => {
		const property = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration)
			.getExcludedConfigurationProperties()[DevContainerAgentHostEnabledSettingId];

		assert.deepStrictEqual({
			default: property.default,
			scope: property.scope,
		}, {
			default: false,
			scope: ConfigurationScope.APPLICATION,
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
