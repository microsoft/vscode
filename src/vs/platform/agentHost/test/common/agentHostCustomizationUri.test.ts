/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME, AGENT_DISCOVERY_CUSTOMIZATION_SCHEME, getMcpSkillCustomizationUri, getMcpSkillName, hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../common/agentHostUri.js';
import { CustomizationType, type ChildCustomization } from '../../common/state/sessionState.js';
import { readClientPluginSourceUris, toClientPluginSourceUrisMeta } from '../../common/meta/clientPluginCustomizationMeta.js';
import { getCustomizationSourceUri, toSourceCustomizations } from '../../common/syncedCustomizationUris.js';

suite('Agent Host customization URI', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('publishes canonical source identities without exposing materialization paths', () => {
		const root = URI.file('/cache/revision');
		const source = URI.parse('vscode-remote://ssh-client/extensions/reviewer.agent.md');
		const plugin = {
			pluginDir: root,
			customization: {
				type: CustomizationType.Plugin, id: 'plugin', uri: 'synced:/bundle', name: 'Bundle',
				_meta: toClientPluginSourceUrisMeta({ files: { 'agents/reviewer.agent.md': source } }),
			},
		} as const;
		const paths = ['agents/reviewer.agent.md', 'skills/review/SKILL.md', 'rules/review.md', '../outside.md'];
		const children: ChildCustomization[] = paths.map(path => ({
			type: CustomizationType.Agent, id: path, name: path, uri: URI.joinPath(root, path).toString(),
		}));
		assert.deepStrictEqual({
			children: toSourceCustomizations(children, plugin, 'author').map(child => ({ uri: child.uri, meta: child._meta })),
			otherRevision: getCustomizationSourceUri(URI.file('/cache/other/agents/reviewer.agent.md'), plugin).toString(),
			automation: toSourceCustomizations(children, plugin, 'vscode.automation'),
		}, {
			children: [
				{ uri: source.toString(), meta: { 'vscode.uriClientId': 'author' } },
				{ uri: 'synced:/bundle/skills/review/SKILL.md', meta: { 'vscode.uriClientId': 'author' } },
				{ uri: 'synced:/bundle/rules/review.md', meta: { 'vscode.uriClientId': 'author' } },
				{ uri: URI.file('/cache/outside.md').toString(), meta: undefined },
			],
			otherRevision: URI.file('/cache/other/agents/reviewer.agent.md').toString(),
			automation: children,
		});
	});

	test('validates source maps and preserves the source root and declaration fragments', () => {
		const root = URI.parse('vscode-remote://ssh-client/plugins/review');
		const customization = {
			type: CustomizationType.Plugin, id: 'plugin', name: 'Plugin', uri: 'vscode-agent-host-file:/host/plugins/review',
			_meta: {
				...toClientPluginSourceUrisMeta({ root, files: {} }),
				'vscode.sourceUris': { '../escape': 'file:///escape', '/absolute': 'file:///absolute', 'agents/review.md': false },
			},
		} as const;
		assert.deepStrictEqual({
			files: readClientPluginSourceUris(customization).files,
			uri: getCustomizationSourceUri(URI.parse('file:///host/plugins/review/hooks/hooks.json#hook-id'), {
				customization, pluginDir: URI.file('/host/plugins/review'),
			}).toString(),
		}, { files: {}, uri: URI.joinPath(root, 'hooks/hooks.json').with({ fragment: 'hook-id' }).toString() });
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
