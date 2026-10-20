/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { customizationDefinitionsEqual } from '../../common/customizationDefinitions.js';
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, type Customization, type McpServerCustomization } from '../../common/state/protocol/state.js';

suite('customizationDefinitionsEqual', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const mcpServer = (state: McpServerCustomization['state'], enabled = true): McpServerCustomization => ({
		type: CustomizationType.McpServer, id: 'github', uri: 'file:///mcp/github', name: 'github', state,
		enablement: [{ kind: CustomizationEnablementKind.Global, enabled }],
	});
	const plugin = (mcpServers: readonly McpServerCustomization[]): Customization => ({
		type: CustomizationType.Plugin, id: 'file:///plugins/host', uri: 'file:///plugins/host', name: 'Host Plugin', children: [...mcpServers],
	});

	test('ignores MCP server runtime state but not definitions', () => {
		const starting = mcpServer({ kind: McpServerStatus.Starting });
		const failed = mcpServer({ kind: McpServerStatus.Error, error: { errorType: 'spawn', message: 'failed' } });

		assert.deepStrictEqual({
			statusOnly: customizationDefinitionsEqual([starting], [failed]),
			nestedStatusOnly: customizationDefinitionsEqual([plugin([starting])], [plugin([failed])]),
			enablement: customizationDefinitionsEqual([starting], [mcpServer({ kind: McpServerStatus.Starting }, false)]),
			added: customizationDefinitionsEqual([starting], [starting, plugin([])]),
			missing: customizationDefinitionsEqual(undefined, []),
		}, {
			statusOnly: true,
			nestedStatusOnly: true,
			enablement: false,
			added: false,
			missing: false,
		});
	});
});
