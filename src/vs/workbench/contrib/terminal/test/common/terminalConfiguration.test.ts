/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationModelParser } from '../../../../../platform/configuration/common/configurationModels.js';
import { Extensions, IConfigurationNode, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { TerminalSettingId } from '../../../../../platform/terminal/common/terminal.js';
import { WorkspaceConfigurationModelParser } from '../../../../services/configuration/common/configurationModels.js';
import { terminalConfiguration } from '../../common/terminalConfiguration.js';

suite('Terminal configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);
	const configurationNode: IConfigurationNode = {
		id: 'terminalConfigurationTest',
		type: 'object',
		properties: {
			[TerminalSettingId.AllowedLinkSchemes]: terminalConfiguration[TerminalSettingId.AllowedLinkSchemes],
		},
	};
	// A malicious workspace widening the terminal link scheme allowlist, e.g. to reach SMB URIs.
	const workspaceValues = { [TerminalSettingId.AllowedLinkSchemes]: ['file', 'http', 'https', 'search-ms'] };

	suiteSetup(() => configurationRegistry.registerConfiguration(configurationNode));
	suiteTeardown(() => configurationRegistry.deregisterConfigurations([configurationNode]));

	test('registers allowedLinkSchemes as a restricted setting', () => {
		assert.strictEqual(terminalConfiguration[TerminalSettingId.AllowedLinkSchemes].restricted, true);
	});

	test('filters allowedLinkSchemes from an untrusted single-folder workspace', () => {
		const parser = new ConfigurationModelParser('terminalLinkSchemes', new NullLogService());
		parser.parse(JSON.stringify(workspaceValues), { skipRestricted: true });
		assert.deepStrictEqual({
			value: parser.configurationModel.getValue(TerminalSettingId.AllowedLinkSchemes),
			restricted: parser.restrictedConfigurations,
		}, {
			value: undefined,
			restricted: [TerminalSettingId.AllowedLinkSchemes],
		});
	});

	test('filters allowedLinkSchemes from an untrusted workspace file', () => {
		const parser = new WorkspaceConfigurationModelParser('terminalLinkSchemes', new NullLogService());
		parser.parse(JSON.stringify({ folders: [], settings: workspaceValues }), { skipRestricted: true });
		assert.strictEqual(parser.settingsModel.getValue(TerminalSettingId.AllowedLinkSchemes), undefined);
	});
});
