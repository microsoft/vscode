/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AGENT_BUILTIN_CUSTOMIZATION_SCHEME, AGENT_DISCOVERY_CUSTOMIZATION_SCHEME, getMcpSkillCustomizationUri, getMcpSkillName, hasReadableCustomizationContent, isAgentBuiltinCustomizationUri } from '../../common/agentHostCustomizationUri.js';
import { toAgentHostUri } from '../../common/agentHostUri.js';
import { CustomizationType, type PluginCustomization } from '../../common/state/sessionState.js';
import { readClientPluginSourceUris, readCustomizationUriClientIds, toClientPluginSourceUrisMeta, toCustomizationUriClientMeta } from '../../common/meta/clientPluginCustomizationMeta.js';
import { getCustomizationSourceUri, parseSyncedPlugin, withClientCustomizationUriOwners } from '../../common/syncedCustomizationUris.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../log/common/log.js';
import { Schemas } from '../../../../base/common/network.js';
import { VSBuffer } from '../../../../base/common/buffer.js';

suite('Agent Host customization URI', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('shares only canonical sources explicitly contributed by each client', () => {
		const plugin = (clientId: string, agentPath: string): PluginCustomization => ({
			type: CustomizationType.Plugin, id: 'bundle', uri: 'synced:/bundle', name: 'Bundle', clientId,
			children: [{ type: CustomizationType.Agent, id: 'agent', name: 'Agent', uri: agentPath, _meta: toCustomizationUriClientMeta(clientId) }],
		});
		const first = plugin('first', 'file:///workspace/agent.md');
		const second = plugin('second', first.children![0].uri);
		const other = plugin('other', 'file:///different/agent.md');
		const merged = withClientCustomizationUriOwners(first, [first, second, other]);
		const afterDisconnect = withClientCustomizationUriOwners(second, [second, other]);
		assert.deepStrictEqual({
			uri: merged.children![0].uri,
			owners: readCustomizationUriClientIds(merged.children![0]),
			afterDisconnect: readCustomizationUriClientIds(afterDisconnect.children![0]),
			invalid: readCustomizationUriClientIds({ _meta: { 'vscode.uriClientIds': ['owner', false, '', 1] } }),
		}, { uri: first.children![0].uri, owners: ['first', 'second'], afterDisconnect: ['second'], invalid: ['owner'] });
	});

	test('parses canonical source identities while retaining private materialized files', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new InMemoryFileSystemProvider())));
		const root = URI.file('/cache/revision');
		const source = URI.parse('vscode-remote://ssh-client/extensions/reviewer.agent.md');
		await fileService.writeFile(URI.joinPath(root, 'plugin.json'), VSBuffer.fromString('{}'));
		await fileService.writeFile(URI.joinPath(root, 'agents/reviewer.agent.md'), VSBuffer.fromString('---\nname: Reviewer\n---\nReview changes'));
		await fileService.writeFile(URI.joinPath(root, 'skills/review/SKILL.md'), VSBuffer.fromString('---\nname: Review Skill\n---\nReview changes'));
		await fileService.writeFile(URI.joinPath(root, 'rules/review.instructions.md'), VSBuffer.fromString('Review carefully'));
		await fileService.writeFile(URI.joinPath(root, '.mcp.json'), VSBuffer.fromString('{"mcpServers":{"review":{"command":"node","args":["server.js"]}}}'));
		const plugin = {
			pluginDir: root,
			customization: {
				type: CustomizationType.Plugin, id: 'plugin', uri: 'synced:/bundle', name: 'Bundle',
				_meta: toClientPluginSourceUrisMeta({ files: { 'agents/reviewer.agent.md': source } }),
			},
		} as const;
		const parsed = await parseSyncedPlugin(plugin, 'author', fileService, undefined, URI.file('/home'));
		const automation = await parseSyncedPlugin(plugin, 'vscode.automation', fileService, undefined, URI.file('/home'));
		const resources = [parsed.agents[0], parsed.skills[0], parsed.instructions[0], parsed.mcpServers[0]];
		assert.deepStrictEqual({
			resources: resources.map(resource => ({
				uri: resource.uri.toString(), materialized: resource.materializedUri?.toString(),
				child: resource.customization.uri, owner: readCustomizationUriClientIds(resource.customization),
			})),
			otherRevision: getCustomizationSourceUri(URI.file('/cache/other/agents/reviewer.agent.md'), plugin).toString(),
			automation: { uri: automation.agents[0].uri.toString(), materialized: automation.agents[0].materializedUri, owner: readCustomizationUriClientIds(automation.agents[0].customization) },
		}, {
			resources: [
				{ uri: source.toString(), materialized: URI.joinPath(root, 'agents/reviewer.agent.md').toString(), child: source.toString(), owner: ['author'] },
				{ uri: 'synced:/bundle/skills/review/SKILL.md', materialized: URI.joinPath(root, 'skills/review/SKILL.md').toString(), child: 'synced:/bundle/skills/review/SKILL.md', owner: ['author'] },
				{ uri: 'synced:/bundle/rules/review.instructions.md', materialized: URI.joinPath(root, 'rules/review.instructions.md').toString(), child: 'synced:/bundle/rules/review.instructions.md', owner: ['author'] },
				{ uri: 'synced:/bundle/.mcp.json', materialized: URI.joinPath(root, '.mcp.json').toString(), child: 'synced:/bundle/.mcp.json', owner: ['author'] },
			],
			otherRevision: URI.file('/cache/other/agents/reviewer.agent.md').toString(),
			automation: { uri: URI.joinPath(root, 'agents/reviewer.agent.md').toString(), materialized: undefined, owner: [] },
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
