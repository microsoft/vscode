/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { parseFrontMatter, type YamlParseError } from '../../../../base/common/yaml.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { FileService } from '../../../files/common/fileService.js';
import { FileOperationResult, FileSystemProviderCapabilities, toFileOperationResult } from '../../../files/common/files.js';
import { NullLogService } from '../../../log/common/log.js';
import { CustomizationType } from '../../common/state/protocol/state.js';
import { CustomizationLoadStatus } from '../../common/state/sessionState.js';
import { buildCopilotBuiltinAgentMarkdown, buildCopilotBuiltinAgents, buildCopilotBuiltinAgentsContainer, COPILOT_BUILTIN_AGENTS, COPILOT_BUILTIN_AGENTS_SCHEME, COPILOT_BUILTIN_AGENT_NAMES, COPILOT_BUILTIN_AGENT_NAMES_BY_URI, CopilotBuiltinAgentsStore, getCopilotBuiltinAgentUri } from '../../node/copilot/copilotBuiltinAgents.js';

suite('Copilot built-in agents', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('registry reserves each unique SDK name and readable URI', () => {
		assert.deepStrictEqual({
			names: [...COPILOT_BUILTIN_AGENT_NAMES],
			namesByUri: [...COPILOT_BUILTIN_AGENT_NAMES_BY_URI],
			uniqueNames: COPILOT_BUILTIN_AGENT_NAMES.size,
			uniqueUris: COPILOT_BUILTIN_AGENT_NAMES_BY_URI.size,
		}, {
			names: COPILOT_BUILTIN_AGENTS.map(agent => agent.name),
			namesByUri: COPILOT_BUILTIN_AGENTS.map(agent => [getComparisonKey(getCopilotBuiltinAgentUri(agent)), agent.name]),
			uniqueNames: COPILOT_BUILTIN_AGENTS.length,
			uniqueUris: COPILOT_BUILTIN_AGENTS.length,
		});
	});

	test('builds each SDK config from the registry without model inference', () => {
		assert.deepStrictEqual(buildCopilotBuiltinAgents([]), COPILOT_BUILTIN_AGENTS.map(agent => ({
			name: agent.name,
			displayName: agent.displayName(),
			description: agent.description(),
			infer: false,
			disableModelInvocation: true,
			prompt: agent.prompt,
			tools: [...agent.tools],
		})));
	});

	test('Ask permits only read-only built-in tools and is never inferred', () => {
		const config = buildCopilotBuiltinAgents([]).find(agent => agent.name === 'vscode-ask')!;
		assert.deepStrictEqual({
			name: config.name,
			displayName: config.displayName,
			description: config.description,
			infer: config.infer,
			disableModelInvocation: config.disableModelInvocation,
			tools: config.tools,
			readOnlyPrompt: config.prompt.includes('strictly read-only') && config.prompt.includes('Write tools are unavailable by design'),
			explainsChanges: config.prompt.includes('explain what changes would be needed but do NOT make them'),
		}, {
			name: 'vscode-ask',
			displayName: 'Ask',
			description: 'Answers questions about your code without making changes',
			infer: false,
			disableModelInvocation: true,
			tools: ['view', 'grep', 'glob', 'rg', 'lsp', 'web_fetch', 'web_search', 'ask_user', 'report_intent', 'think', 'show_file', 'fetch_copilot_cli_documentation'],
			readOnlyPrompt: true,
			explainsChanges: true,
		});
	});

	test('includes only explicitly read-only client tools where requested, using their SDK names', () => {
		const configs = buildCopilotBuiltinAgents([
			{ name: 'readProject', annotations: { readOnlyHint: true } },
			{ name: 'toolSearch', annotations: { readOnlyHint: true } },
			{ name: 'writeProject', annotations: { readOnlyHint: false } },
			{ name: 'unspecified' },
			{ name: 'otherHints', annotations: { destructiveHint: false, idempotentHint: true } },
			...COPILOT_BUILTIN_AGENTS.flatMap(agent => agent.tools.map(name => ({ name, annotations: { readOnlyHint: true } }))),
			{ name: 'readProject', annotations: { readOnlyHint: true } },
		]);
		const staticTools = COPILOT_BUILTIN_AGENTS.flatMap(agent => agent.tools);
		assert.deepStrictEqual(configs.map(agent => agent.tools), COPILOT_BUILTIN_AGENTS.map(agent => [...new Set([
			...agent.tools,
			...(agent.includeReadOnlyClientTools ? ['readProject', 'tool_search_tool', ...staticTools] : []),
		])]));
	});

	test('generated frontmatter round-trips each descriptor', () => {
		assert.deepStrictEqual(COPILOT_BUILTIN_AGENTS.map(agent => {
			const errors: YamlParseError[] = [];
			const markdown = parseFrontMatter(buildCopilotBuiltinAgentMarkdown(agent), errors);
			return {
				name: markdown?.getStringValue('name'),
				description: markdown?.getStringValue('description'),
				tools: markdown?.getStringArrayValue('tools'),
				disableModelInvocation: markdown?.getBooleanValue('disable-model-invocation'),
				body: markdown?.body,
				errors,
			};
		}), COPILOT_BUILTIN_AGENTS.map(agent => ({
			name: agent.displayName(),
			description: agent.description(),
			tools: [...agent.tools],
			disableModelInvocation: true,
			body: agent.prompt,
			errors: [],
		})));
	});

	test('frontmatter safely quotes punctuation, escapes and newlines', () => {
		const agent = {
			...COPILOT_BUILTIN_AGENTS[0],
			displayName: () => 'Agent: "quoted" and \'single\'',
			description: () => 'First line\nSecond line: # comment \\ path',
			tools: ['tool\'s', 'tool"quoted', 'tool\\path'],
		};
		const errors: YamlParseError[] = [];
		const markdown = parseFrontMatter(buildCopilotBuiltinAgentMarkdown(agent), errors);
		assert.deepStrictEqual({
			name: markdown?.getStringValue('name'),
			description: markdown?.getStringValue('description'),
			tools: markdown?.getStringArrayValue('tools'),
			errors,
		}, {
			name: agent.displayName(),
			description: agent.description(),
			tools: agent.tools,
			errors: [],
		});
	});

	test('publishes all built-ins as readable, read-only customizations', () => {
		const uri = URI.from({ scheme: COPILOT_BUILTIN_AGENTS_SCHEME, path: '/agents' }).toString();
		assert.deepStrictEqual(buildCopilotBuiltinAgentsContainer(), {
			type: CustomizationType.Directory,
			id: uri,
			uri,
			name: 'builtin',
			enabled: true,
			contents: CustomizationType.Agent,
			writable: false,
			load: { kind: CustomizationLoadStatus.Loaded },
			children: COPILOT_BUILTIN_AGENTS.map(agent => ({
				type: CustomizationType.Agent,
				id: getCopilotBuiltinAgentUri(agent).toString(),
				uri: getCopilotBuiltinAgentUri(agent).toString(),
				name: agent.displayName(),
				description: agent.description(),
				disableModelInvocation: true,
			})),
		});
	});

	test('store immediately serves every published file and rejects writes', async () => {
		const fileService = disposables.add(new FileService(new NullLogService()));
		const store = disposables.add(new CopilotBuiltinAgentsStore(fileService));
		const files = [];
		for (const child of buildCopilotBuiltinAgentsContainer().children ?? []) {
			const uri = URI.parse(child.uri);
			files.push({
				uri: child.uri,
				content: (await fileService.readFile(uri)).value.toString(),
				readonly: fileService.hasCapability(uri, FileSystemProviderCapabilities.Readonly),
			});
			await assert.rejects(fileService.writeFile(uri, VSBuffer.fromString('modified')), (error: Error) => toFileOperationResult(error) === FileOperationResult.FILE_PERMISSION_DENIED);
		}
		assert.deepStrictEqual(files, COPILOT_BUILTIN_AGENTS.map(agent => ({
			uri: getCopilotBuiltinAgentUri(agent).toString(),
			content: buildCopilotBuiltinAgentMarkdown(agent),
			readonly: true,
		})));
		store.dispose();
		assert.strictEqual(fileService.hasProvider(URI.from({ scheme: COPILOT_BUILTIN_AGENTS_SCHEME, path: '/agents' })), false);
	});
});
