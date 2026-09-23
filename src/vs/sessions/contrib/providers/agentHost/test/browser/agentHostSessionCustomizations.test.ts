/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationType, ResponsePartKind, ToolCallContributorKind, ToolCallStatus, type Customization, type ResponsePart } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { SessionCustomizationKind } from '../../../../../services/sessions/common/session.js';
import { createIncrementalChatCustomizationRefsParser, CustomizationIndex, CustomizationRefKind, parseTurnCustomizationRefs, resolveChatCustomizations } from '../../browser/agentHostSessionCustomizations.js';

suite('Agent Host Session Customizations', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const root = URI.file('/repo');

	function toolCall(toolName: string, toolInput: string, contributor?: { customizationId: string }): ResponsePart {
		return {
			kind: ResponsePartKind.ToolCall,
			toolCall: {
				status: ToolCallStatus.Completed,
				toolCallId: `${toolName}-${toolInput}`,
				toolName,
				displayName: toolName,
				invocationMessage: toolName,
				pastTenseMessage: toolName,
				success: true,
				toolInput,
				...(contributor ? { contributor: { kind: ToolCallContributorKind.MCP, customizationId: contributor.customizationId } } : {}),
			},
		} as ResponsePart;
	}

	const customizations: readonly Customization[] = [{
		id: 'dir-1',
		type: CustomizationType.Directory,
		uri: URI.file('/repo/.github/skills').toString(),
		name: 'Skills',
		enabled: true,
		contents: CustomizationType.Skill,
		writable: true,
		children: [
			{ id: 'skill-1', type: CustomizationType.Skill, uri: URI.file('/repo/.github/skills/sessions/SKILL.md').toString(), name: 'sessions' },
			{ id: 'rule-1', type: CustomizationType.Rule, uri: URI.file('/repo/.github/instructions/tests.instructions.md').toString(), name: 'writing-tests' },
			{ id: 'hook-1', type: CustomizationType.Hook, uri: URI.file('/repo/.github/hooks/pre.md').toString(), name: 'pre-commit' },
			{ id: 'mcp-1', type: CustomizationType.McpServer, uri: URI.file('/repo/.vscode/mcp.json').toString(), name: 'playwright' },
		],
	} as unknown as Customization];

	const index = new CustomizationIndex(customizations, [root]);

	function resolve(parts: ResponsePart[]): readonly { id: string; kind: SessionCustomizationKind }[] {
		return resolveChatCustomizations(parseTurnCustomizationRefs(parts), index)
			.map(customization => ({ id: customization.id, kind: customization.kind }));
	}

	test('resolves reads, skill invocations and MCP tool calls, in first-appearance order', () => {
		assert.deepStrictEqual(resolve([
			toolCall('view', '{"path":"/repo/.github/instructions/tests.instructions.md"}'),
			toolCall('playwright_click', '{"selector":"a"}', { customizationId: 'mcp-1' }),
			toolCall('Skill', '{"skill":"sessions"}'),
			toolCall('view', '{"path":".github/hooks/pre.md"}'),
		]), [
			{ id: 'rule-1', kind: SessionCustomizationKind.Instruction },
			{ id: 'mcp-1', kind: SessionCustomizationKind.McpServer },
			{ id: 'skill-1', kind: SessionCustomizationKind.Skill },
			{ id: 'hook-1', kind: SessionCustomizationKind.Hook },
		]);
	});

	test('de-duplicates a customization reached through different references', () => {
		assert.deepStrictEqual(resolve([
			toolCall('Skill', '{"skill":"sessions"}'),
			toolCall('view', '{"path":"/repo/.github/skills/sessions/SKILL.md"}'),
			// A sibling file inside the skill folder still counts as that skill.
			toolCall('view', '{"path":"/repo/.github/skills/sessions/reference.md"}'),
		]), [{ id: 'skill-1', kind: SessionCustomizationKind.Skill }]);
	});

	test('matches Windows drive paths, escaped separators and file URIs', () => {
		assert.deepStrictEqual(resolve([
			toolCall('read', '{"file_path":"\\\\repo\\\\.github\\\\instructions\\\\tests.instructions.md"}'),
			toolCall('read', `{"uri":"${URI.file('/repo/.github/hooks/pre.md').toString()}"}`),
		]), [
			{ id: 'rule-1', kind: SessionCustomizationKind.Instruction },
			{ id: 'hook-1', kind: SessionCustomizationKind.Hook },
		]);
	});

	test('matches a Windows absolute path, whose drive prefix must stay attached', () => {
		const windowsIndex = new CustomizationIndex([
			{
				id: 'dir-1', type: CustomizationType.Directory, uri: URI.file('C:\\repo\\.github\\skills').toString(), name: 'Skills',
				enabled: true, contents: CustomizationType.Skill, writable: true,
				children: [{ id: 'skill-1', type: CustomizationType.Skill, uri: URI.file('C:\\repo\\.github\\skills\\sessions\\SKILL.md').toString(), name: 'sessions' }],
			},
		] as unknown as readonly Customization[]);

		assert.strictEqual(
			windowsIndex.resolve({ kind: CustomizationRefKind.Path, value: 'C:\\repo\\.github\\skills\\sessions\\SKILL.md' })?.id,
			'skill-1',
		);
	});

	test('ignores unrelated paths and streaming tool calls', () => {
		const streaming = {
			kind: ResponsePartKind.ToolCall,
			toolCall: { status: ToolCallStatus.Streaming, toolCallId: 'x', toolName: 'view', displayName: 'view', toolInput: '{"path":"/repo/.github/hooks/pre.md"}' },
		} as ResponsePart;

		assert.deepStrictEqual(resolve([
			toolCall('view', '{"path":"/repo/src/main.ts"}'),
			toolCall('bash', 'npm run compile'),
			streaming,
		]), []);
	});

	test('parses each completed turn once and re-parses only the active turn', () => {
		const parsed: string[] = [];
		const parse = createIncrementalChatCustomizationRefsParser(parts => {
			parsed.push((parts[0] as { toolCall: { toolCallId: string } }).toolCall.toolCallId);
			return parseTurnCustomizationRefs(parts);
		});

		const turnOne = { id: 't1', responseParts: [toolCall('view', '{"path":"/repo/.github/hooks/pre.md"}')] };
		const turnTwo = { id: 't2', responseParts: [toolCall('Skill', '{"skill":"sessions"}')] };
		parse({ turns: [turnOne], activeTurn: turnTwo });
		parse({ turns: [turnOne], activeTurn: turnTwo });
		const final = parse({ turns: [turnOne, turnTwo] });

		assert.deepStrictEqual({
			parsed,
			refs: final.map(ref => ref.value),
		}, {
			// t1 parsed once and cached; the active t2 re-parsed per delta, then
			// parsed once more when it completes.
			parsed: ['view-{"path":"/repo/.github/hooks/pre.md"}', 'Skill-{"skill":"sessions"}', 'Skill-{"skill":"sessions"}', 'Skill-{"skill":"sessions"}'],
			refs: ['/repo/.github/hooks/pre.md', 'sessions'],
		});
	});

	test('a plugin folder under a dotted ancestor does not claim its siblings', () => {
		const pluginIndex = new CustomizationIndex([
			{ id: 'plugin-1', type: CustomizationType.Plugin, uri: URI.file('/home/.agents/plugins/foo').toString(), name: 'foo' },
		] as unknown as readonly Customization[]);

		assert.deepStrictEqual({
			inside: pluginIndex.resolve({ kind: CustomizationRefKind.Path, value: '/home/.agents/plugins/foo/skills/a/SKILL.md' })?.id,
			sibling: pluginIndex.resolve({ kind: CustomizationRefKind.Path, value: '/home/.agents/plugins/bar/SKILL.md' })?.id,
		}, {
			inside: 'plugin-1',
			sibling: undefined,
		});
	});

	test('a versioned plugin root does not claim its sibling roots', () => {
		const pluginIndex = new CustomizationIndex([
			{ id: 'plugin-1', type: CustomizationType.Plugin, uri: URI.file('/home/.agents/plugins/foo/1.2.0').toString(), name: 'foo' },
		] as unknown as readonly Customization[]);

		assert.deepStrictEqual({
			inside: pluginIndex.resolve({ kind: CustomizationRefKind.Path, value: '/home/.agents/plugins/foo/1.2.0/skills/a/SKILL.md' })?.id,
			sibling: pluginIndex.resolve({ kind: CustomizationRefKind.Path, value: '/home/.agents/plugins/bar/1.0.0/SKILL.md' })?.id,
		}, {
			inside: 'plugin-1',
			sibling: undefined,
		});
	});

	test('an empty customization tree resolves nothing', () => {
		assert.deepStrictEqual(
			resolveChatCustomizations(parseTurnCustomizationRefs([toolCall('Skill', '{"skill":"sessions"}')]), new CustomizationIndex(undefined)),
			[],
		);
	});
});
