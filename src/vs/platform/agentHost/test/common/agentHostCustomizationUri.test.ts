/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME, AGENT_DISCOVERY_CUSTOMIZATION_SCHEME, getMcpSkillCustomizationUri, getMcpSkillName, hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../common/agentHostUri.js';
import { withSyncedCustomizationSources } from '../../common/syncedCustomizationSources.js';
import { readCustomizationSourceUri } from '../../common/meta/customizationSourceMeta.js';
import { CustomizationType, type ChildCustomization } from '../../common/state/sessionState.js';
import { McpServerStatus } from '../../common/state/protocol/state.js';

suite('Agent Host customization URI', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('annotates every synced child position without changing host identities', () => {
		const pluginDir = URI.file('C:/cache/plugin');
		const root = URI.parse('client-bundle:/plugin');
		const file = (path: string) => URI.joinPath(pluginDir, path).toString();
		const children: ChildCustomization[] = [
			{ type: CustomizationType.Agent, id: 'agent', name: 'Agent', uri: file('agents/review.md') },
			{ type: CustomizationType.Skill, id: 'skill', name: 'Skill', uri: file('skills/review/SKILL.md') },
			{ type: CustomizationType.Rule, id: 'rule', name: 'Rule', uri: file('rules/review.mdc') },
			{ type: CustomizationType.Prompt, id: 'prompt', name: 'Prompt', uri: file('commands/review.md') },
			{ type: CustomizationType.Hook, id: 'hook', name: 'Hook', uri: file('hooks/hooks.json') },
			{ type: CustomizationType.McpServer, id: 'mcp', name: 'MCP', uri: file('.mcp.json') + '#review', state: { kind: McpServerStatus.Ready } },
			{ type: CustomizationType.Agent, id: 'outside', name: 'Outside', uri: URI.file('C:/outside/review.md').toString() },
		];
		const customization = { type: CustomizationType.Plugin, id: 'plugin', name: 'Plugin', uri: root.toString() } as const;
		const projected = withSyncedCustomizationSources(children, { customization, pluginDir });
		assert.deepStrictEqual({
			identities: projected.map(({ _meta, ...child }) => child),
			sources: projected.map(child => readCustomizationSourceUri(child)?.toString()),
			inPlace: withSyncedCustomizationSources(children, { customization: { ...customization, uri: 'vscode-agent-host-file:/host/plugin' }, pluginDir }),
		}, {
			identities: children,
			sources: [...['agents/review.md', 'skills/review/SKILL.md', 'rules/review.mdc', 'commands/review.md', 'hooks/hooks.json', '.mcp.json#review'].map(path => `client-bundle:/plugin/${path}`), undefined],
			inPlace: children,
		});
	});

	test('recognizes raw and client-wrapped built-in customizations', () => {
		const builtIn = URI.from({ scheme: AGENT_BUILTIN_CUSTOMIZATION_SCHEME, path: '/skill/init' });

		assert.deepStrictEqual({
			raw: isAgentBuiltinCustomizationUri(builtIn),
			wrapped: isAgentBuiltinCustomizationUri(toAgentHostUri(builtIn, 'remote')),
			file: isAgentBuiltinCustomizationUri(URI.file('/workspace/SKILL.md')),
			rawReadable: hasReadableCustomizationContent(builtIn),
			wrappedReadable: hasReadableCustomizationContent(toAgentHostUri(builtIn, 'remote')),
			fileReadable: hasReadableCustomizationContent(URI.file('/workspace/SKILL.md')),
		}, {
			raw: true,
			wrapped: true,
			file: false,
			rawReadable: false,
			wrappedReadable: false,
			fileReadable: true,
		});

	});

	test('only host-routable MCP skills expose readable content', () => {
		assert.deepStrictEqual(['opaque-mcp-channel:skills', undefined].map(channel => {
			const uri = URI.parse(getMcpSkillCustomizationUri('skill://server/friendly/SKILL.md', channel, 'Friendly'));
			return {
				scheme: uri.scheme,
				readable: hasReadableCustomizationContent(uri),
				wrappedReadable: hasReadableCustomizationContent(toAgentHostUri(uri, 'remote')),
			};
		}), [
			{ scheme: 'mcp-resource', readable: true, wrappedReadable: true },
			{ scheme: AGENT_DISCOVERY_CUSTOMIZATION_SCHEME, readable: false, wrappedReadable: false },
		]);
	});

	test('MCP skill names stay a single slash token', () => {
		assert.deepStrictEqual([getMcpSkillName('fs', 'review'), getMcpSkillName('Docs Server', 'release notes')], ['fs:review', 'Docs-Server:release-notes']);
	});

	test('discovery identities do not imply readable source files', () => {
		const resource = URI.from({ scheme: AGENT_DISCOVERY_CUSTOMIZATION_SCHEME, authority: 'copilot', path: '/hooks', fragment: 'opaque-id' });
		assert.deepStrictEqual([resource, toAgentHostUri(resource, 'remote')].map(uri => ({
			readable: hasReadableCustomizationContent(uri),
			builtin: isAgentBuiltinCustomizationUri(uri),
		})), [{ readable: false, builtin: false }, { readable: false, builtin: false }]);
	});

	test('Claude SDK agent identities have no readable source, including when host-wrapped', () => {
		const resource = URI.parse('claude-internal:/agent/Explore');
		assert.deepStrictEqual([resource, toAgentHostUri(resource, 'remote')].map(hasReadableCustomizationContent), [false, false]);
	});
});
