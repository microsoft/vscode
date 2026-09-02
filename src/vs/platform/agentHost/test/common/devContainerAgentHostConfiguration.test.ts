/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';
import '../../common/devContainerAgentHost.config.contribution.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerWorktreeEnabledSettingId } from '../../common/devContainerAgentHost.js';

suite('Dev Container Agent Host Configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	// Capture these before configuration registry tests clear global registrations.
	const devContainerAgentHostEnabledProperty = configurationRegistry.getConfigurationProperties()[DevContainerAgentHostEnabledSettingId];
	const devContainerWorktreeEnabledProperty = configurationRegistry.getExcludedConfigurationProperties()[DevContainerWorktreeEnabledSettingId];

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
});
