/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { LocalMcpServerScope } from '../../../../../services/mcp/common/mcpWorkbenchManagementService.js';
import { CustomizationType, type PluginCustomization } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { withCustomizationDiscoveryMeta } from '../../../../../../platform/agentHost/common/meta/customizationDiscoveryMeta.js';
import { CustomizationToggle } from '../../../browser/aiCustomization/customizationToggle.js';
import { getPluginToolsGroup, isToolsTreeKeyboardTarget, ToolsListWidget } from '../../../browser/aiCustomization/toolsListWidget.js';
import { IToolData, IToolSet } from '../../../common/tools/languageModelToolsService.js';

suite('toolsListWidget', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('handles tree keys only from the row itself', () => {
		const row = document.createElement('div');
		const moreButton = document.createElement('button');
		row.appendChild(moreButton);

		assert.deepStrictEqual({
			row: isToolsTreeKeyboardTarget(row, row),
			moreButton: isToolsTreeKeyboardTarget(moreButton, row),
		}, {
			row: true,
			moreButton: false,
		});
	});

	test('uses switches for customization enablement', () => {
		const enabledToggle = disposables.add(new CustomizationToggle({ ariaLabel: 'Enabled', checked: true }));
		const mixedToggle = disposables.add(new CustomizationToggle({ ariaLabel: 'Mixed', checked: 'mixed' }));

		assert.deepStrictEqual({
			enabledRole: enabledToggle.domNode.firstElementChild?.getAttribute('role'),
			enabledChecked: enabledToggle.domNode.firstElementChild?.getAttribute('aria-checked'),
			mixedRole: mixedToggle.domNode.firstElementChild?.getAttribute('role'),
			mixedChecked: mixedToggle.domNode.firstElementChild?.getAttribute('aria-checked'),
		}, {
			enabledRole: 'switch',
			enabledChecked: 'true',
			mixedRole: 'switch',
			mixedChecked: 'mixed',
		});
	});

	test('derives plugin tool groups from discovery source', () => {
		const plugin = (source?: string): PluginCustomization => ({
			type: CustomizationType.Plugin,
			id: source ?? 'default',
			uri: `other-host:/${source ?? 'default'}`,
			name: source ?? 'default',
			_meta: source ? withCustomizationDiscoveryMeta(undefined, { source }) : undefined,
		});

		assert.deepStrictEqual([
			getPluginToolsGroup(plugin()),
			getPluginToolsGroup(plugin('user')),
			getPluginToolsGroup(plugin('repository')),
			getPluginToolsGroup(plugin('builtin')),
			getPluginToolsGroup(plugin('future-source')),
		], ['user', 'user', 'workspace', 'application', 'user']);
	});

	test('groups client-bundled servers by their VS Code configuration, not the bundle plugin', () => {
		const webApp = URI.file('/workspace/web-app');
		const api = URI.file('/workspace/api');
		const bundlePlugin = { type: CustomizationType.Plugin, id: 'bundle', uri: 'vscode-synced-customization:/standalone', name: 'VS Code Standalone Customizations' } as PluginCustomization;
		const bundled = (name: string) => ({ id: `session/${name}`, name, pluginId: 'bundle', isPluginProvided: true, isClientBundled: true, source: 'plugin', sourcePluginName: bundlePlugin.name, sourceUri: URI.file('/bundle/.mcp.json') });
		const grouped = (ToolsListWidget.prototype as unknown as {
			_computeConnectedEntriesByScope(this: object, query: string): Map<string, { label: string; description?: string }[]>;
		})._computeConnectedEntriesByScope.call({
			_workspaceContextService: { getWorkspace: () => ({ folders: [{ uri: webApp, name: 'web-app' }, { uri: api, name: 'api' }] }) },
			_connectedPlugins: [bundlePlugin],
			_connectedServers: [
				bundled('playwright'),
				bundled('acme-docs'),
				{ id: 'session/host-only', name: 'host-only', source: 'workspace', sourceUri: URI.joinPath(api, '.mcp.json') },
			],
			_mcpWorkbenchService: { local: [{ id: 'playwright-id', name: 'playwright', label: 'playwright', local: { scope: LocalMcpServerScope.Workspace, mcpResource: URI.joinPath(webApp, '.vscode', 'mcp.json') } }] },
			_mcpService: { servers: { get: () => [{ definition: { id: 'acme-docs-id', label: 'acme-docs' }, collection: { id: 'acme' }, readDefinitions: () => ({ get: () => ({}) }) }] } },
			_mcpRegistry: { collections: { get: () => [{ id: 'acme', source: new ExtensionIdentifier('acme.acme-chat-kit') }] } },
			_labelService: { getUriLabel: (uri: URI) => uri.path.slice('/workspace/'.length) },
			_agentPluginService: { plugins: { get: () => [] } },
			_extensionsWorkbenchService: { local: [{ identifier: { id: 'acme.acme-chat-kit' }, displayName: 'Acme Chat Kit' }] },
			_getHostServerSource: () => ({ label: 'host source' }),
			_computeConnectedServerEntries: (server: { name: string }, source: { label: string } | undefined) => [{ label: server.name, description: source?.label }],
		}, '');

		assert.deepStrictEqual(Object.fromEntries([...grouped].map(([key, entries]) => [key, entries.map(entry => `${entry.label}: ${entry.description}`)])), {
			user: ['acme-docs: Extension: Acme Chat Kit'],
			[`workspace:${webApp.toString()}`]: ['playwright: web-app/.vscode/mcp.json'],
			[`workspace:${api.toString()}`]: ['host-only: host source'],
			workspace: [],
			application: [],
		});
	});

	test('search treats dashes and spaces as equivalent separators with highlights', () => {
		const toolSet = {
			id: 'chrome-devtools',
			referenceName: 'chrome-devtools',
			description: 'Chrome DevTools MCP',
			source: { type: 'internal', label: 'Internal' },
			getTools: () => [{ id: 'take_screenshot', displayName: 'take-screenshot' }, { id: 'navigate', displayName: 'Navigate Page' }],
		} as unknown as IToolSet;
		const toViewModel = (query: string) => {
			const vm = (ToolsListWidget.prototype as unknown as {
				_toViewModel(this: object, reader: undefined, ts: IToolSet, query: string): { nameMatches?: unknown; visibleTools: { tool: IToolData; nameMatches?: unknown }[] } | undefined;
			})._toViewModel.call({ _resolveSetDetail: () => undefined }, undefined, toolSet, query);
			return vm && { set: vm.nameMatches, tools: vm.visibleTools.map(tool => [tool.tool.id, tool.nameMatches]) };
		};

		assert.deepStrictEqual({
			dashedSet: toViewModel('chrome-devtools'),
			spacedTool: toViewModel('take screenshot'),
			underscoredTool: toViewModel('navigate_page'),
			none: toViewModel('missing'),
		}, {
			dashedSet: { set: [{ start: 0, end: 6 }, { start: 7, end: 15 }], tools: [['take_screenshot', undefined], ['navigate', undefined]] },
			spacedTool: { set: undefined, tools: [['take_screenshot', [{ start: 0, end: 4 }, { start: 5, end: 15 }]]] },
			underscoredTool: { set: undefined, tools: [['navigate', [{ start: 0, end: 8 }, { start: 9, end: 13 }]]] },
			none: undefined,
		});
	});
});
