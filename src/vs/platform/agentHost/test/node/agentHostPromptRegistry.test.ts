/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SectionOverride, SystemMessageConfig, SystemMessageSection } from '@github/copilot-sdk';
import { CopilotCliConfigKey, copilotCliConfigSchema, normalizeModelFamilyAlias, resolveModelCapabilityOverrideField } from '../../common/copilotCliConfig.js';
import type { SchemaValues } from '../../common/agentHostSchema.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';
import { AgentHostPromptRegistry, agentHostPromptRegistry, type IAgentHostPromptContext } from '../../node/copilot/prompts/promptRegistry.js';
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from '../../node/copilot/prompts/systemMessage.js';
import { CLAUDE_ALT_PROMPT_IMPLEMENTATION_DISCIPLINE, CLAUDE_ALT_PROMPT_TOOL_INSTRUCTIONS, dropFoundationBullets, mergeSectionOverrides, trimFoundationLastInstructions, trimFoundationToolInstructions } from '../../node/copilot/prompts/anthropicPrompt.js';
import { AGENT_HOST_FILE_LINK_INSTRUCTIONS } from '../../node/shared/fileLinkInstructions.js';
import { AGENT_HOST_WORKSPACELESS_INSTRUCTIONS } from '../../node/shared/workspacelessInstructions.js';
import { COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION, COPILOT_AGENT_HOST_SUBAGENT_TOOL_INSTRUCTIONS } from '../../node/copilot/prompts/toolInstructions.js';
import { BrowserChatToolReferenceName } from '../../../browserView/common/browserChatToolReferenceNames.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME } from '../../common/toolSearchConstants.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import '../../node/copilot/prompts/allPrompts.js';

/**
 * Builds a prompt context backed by an in-memory bag of customization settings
 * and an optional set of available tool names.
 */
function context(settings: SchemaValues<typeof copilotCliConfigSchema.definition> = {}, tools: readonly string[] = [], workspaceless = false, toolSearchActive = false): IAgentHostPromptContext {
	const toolNames = new Set(tools);
	return {
		getSetting: key => settings[key],
		hasClientTool: name => toolNames.has(name),
		workspaceless,
		toolSearchActive,
	};
}

suite('AgentHostPromptRegistry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const LARGE_OUTPUT_LINE = COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION;
	const UNCONDITIONAL_TOOL_INSTRUCTIONS = `${LARGE_OUTPUT_LINE}\n${COPILOT_AGENT_HOST_SUBAGENT_TOOL_INSTRUCTIONS}`;

	const withUniversalAgentHostInstructions = (config: SystemMessageConfig): SystemMessageConfig => {
		const configWithToolInstructions = config.mode === 'replace'
			? { ...config, content: `${config.content}\n\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}` }
			: config;
		const content = configWithToolInstructions.content ? `${configWithToolInstructions.content}\n\n${AGENT_HOST_FILE_LINK_INSTRUCTIONS}` : AGENT_HOST_FILE_LINK_INSTRUCTIONS;
		if (configWithToolInstructions.mode !== 'customize' || configWithToolInstructions.sections?.tool_instructions) {
			return { ...configWithToolInstructions, content };
		}
		return {
			...configWithToolInstructions,
			sections: {
				...configWithToolInstructions.sections,
				tool_instructions: { action: 'append', content: `\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}` } satisfies SectionOverride,
			},
			content,
		};
	};

	test('falls back to the default system message when no model is provided', () => {
		const registry = new AgentHostPromptRegistry();
		assert.deepStrictEqual(registry.resolveSystemMessageConfig(undefined, context()), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
	});

	test('falls back to the default when no contributor matches the model', () => {
		const registry = new AgentHostPromptRegistry();
		assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: 'unknown-model' }, context()), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
	});

	test('a contributor can fully replace the system prompt (replace mode, universal appends survive)', () => {
		const registry = new AgentHostPromptRegistry();
		registry.registerPrompt(class {
			static readonly familyPrefixes = ['gpt-5'];
			resolveFullSystemPrompt(): string {
				return 'FULL PROMPT';
			}
		});
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'gpt-5-mini' }, context()),
			withUniversalAgentHostInstructions({ mode: 'replace', content: 'FULL PROMPT' })
		);
	});

	test('a replacement prompt retains active tool-search guidance', () => {
		const registry = new AgentHostPromptRegistry();
		registry.registerPrompt(class {
			static readonly familyPrefixes = ['gpt-5'];
			resolveFullSystemPrompt(): string {
				return 'FULL PROMPT';
			}
		});
		const resolved = registry.resolveSystemMessageConfig(
			{ id: 'gpt-5-mini' },
			context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, true)
		);
		assert.strictEqual(resolved.mode, 'replace');
		assert.ok(resolved.content.includes('Most tools are deferred and hidden until you search for them.'));
	});

	test('a contributor can override individual sections (customize mode, default identity composed underneath)', () => {
		const registry = new AgentHostPromptRegistry();
		registry.registerPrompt(class {
			static readonly familyPrefixes = ['claude'];
			resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
				return { guidelines: { action: 'append', content: 'Be concise.' } };
			}
		});
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'claude-sonnet' }, context()),
			withUniversalAgentHostInstructions({
				mode: 'customize',
				sections: {
					identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
					guidelines: { action: 'append', content: 'Be concise.' },
				},
			})
		);
	});

	test('a contributor identity override wins over the composed default identity', () => {
		const registry = new AgentHostPromptRegistry();
		registry.registerPrompt(class {
			static readonly familyPrefixes = ['claude'];
			resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
				return { identity: { action: 'replace', content: 'CUSTOM IDENTITY' } };
			}
		});
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'claude-sonnet' }, context()),
			withUniversalAgentHostInstructions({ mode: 'customize', sections: { identity: { action: 'replace', content: 'CUSTOM IDENTITY' } } })
		);
	});

	test('treats empty section overrides as no override (falls back to default)', () => {
		const registry = new AgentHostPromptRegistry();
		registry.registerPrompt(class {
			static readonly familyPrefixes = ['claude'];
			resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
				return {};
			}
		});
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'claude-sonnet' }, context()),
			withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
		);
	});

	test('matchesModel takes precedence over family prefixes', () => {
		const registry = new AgentHostPromptRegistry();
		registry.registerPrompt(class {
			static readonly familyPrefixes: readonly string[] = [];
			static matchesModel(model: ModelSelection): boolean {
				return model.id.includes('codex');
			}
			resolveFullSystemPrompt(): string {
				return 'CODEX';
			}
		});
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'gpt-5-codex' }, context()),
			withUniversalAgentHostInstructions({ mode: 'replace', content: 'CODEX' })
		);
	});

	test('contributors gate on the prompt context', () => {
		const registry = new AgentHostPromptRegistry();
		registry.registerPrompt(class {
			static readonly familyPrefixes = ['claude'];
			resolveSectionOverrides(_model: ModelSelection, ctx: IAgentHostPromptContext): Partial<Record<SystemMessageSection, SectionOverride>> | undefined {
				return ctx.getSetting(CopilotCliConfigKey.Opus48Prompt) === true ? { tone: { action: 'append', content: 'GATED' } } : undefined;
			}
		});
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'claude-x' }, context({ [CopilotCliConfigKey.Opus48Prompt]: true })),
			withUniversalAgentHostInstructions({
				mode: 'customize',
				sections: {
					identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
					tone: { action: 'append', content: 'GATED' },
				},
			})
		);
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'claude-x' }, context()),
			withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
		);
	});

	suite('Opus contributor (registered via allPrompts)', () => {
		const opusModel: ModelSelection = { id: 'claude-opus-4-8' };

		function resolveOpus(enabled: boolean | undefined) {
			return agentHostPromptRegistry.resolveSystemMessageConfig(opusModel, context(enabled === undefined ? {} : { [CopilotCliConfigKey.Opus48Prompt]: enabled }));
		}

		test('applies customize overrides only when enabled', () => {
			assert.deepStrictEqual(resolveOpus(undefined), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
			assert.deepStrictEqual(resolveOpus(false), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
			assert.strictEqual(resolveOpus(true).mode, 'customize');
		});
	});

	suite('Claude alternate-prompt contributor (registered via allPrompts)', () => {
		const altOn = { [CopilotCliConfigKey.ClaudeAltPrompt]: true };

		// Representative slices of the SDK foundation sections the transforms run over
		// (captured from a real agent-host session; wording owned by the CLI/SDK).
		const FOUNDATION_CODE_CHANGE_RULES = [
			'<code_change_instructions>',
			'<rules_for_code_changes>',
			'* Make precise, complete, surgical changes that fully address the request; prefer completeness over a minimal but incomplete fix, and avoid unrelated changes.',
			'* Don\'t fix unrelated pre-existing issues, but do fix bugs caused by or tightly coupled to your changes.',
			'* Update directly related documentation.',
			'* Validate that your changes preserve existing behavior</rules_for_code_changes>',
			'<linting_building_testing>',
			'* Use existing linters, builds, and tests; add tooling only when the task requires it.',
			'</linting_building_testing>',
			'</code_change_instructions>',
		].join('\n');
		const FOUNDATION_GUIDELINES = [
			'<tips_and_tricks>',
			'* Reflect on command output before proceeding to next step',
			'* Clean up temporary files at end of task',
			'* Use view/edit for existing files (not create - avoid data loss)',
			'* Ask for guidance if uncertain; use the ask_user tool to ask clarifying questions',
			'* Do not create markdown files for planning, notes, or tracking unless explicitly requested; session artifacts may go in the session workspace.',
			'</tips_and_tricks>',
		].join('\n');

		function resolve(id: string, settings: SchemaValues<typeof copilotCliConfigSchema.definition> = altOn) {
			return agentHostPromptRegistry.resolveSystemMessageConfig({ id }, context(settings));
		}

		/** The `customize` sections of a resolved config, asserting the mode. */
		function sectionsOf(id: string, settings: SchemaValues<typeof copilotCliConfigSchema.definition> = altOn): Partial<Record<SystemMessageSection, SectionOverride>> {
			const config = resolve(id, settings);
			assert.strictEqual(config.mode, 'customize', id);
			return config.mode === 'customize' ? config.sections ?? {} : {};
		}

		async function runTransform(override: SectionOverride | undefined, content: string): Promise<string> {
			assert.ok(override && typeof override.action === 'function', 'expected a transform override');
			return override.action(content);
		}

		test('is off by default and gated on its setting', () => {
			for (const id of ['claude-opus-5', 'claude-sonnet-4.6', 'claude-haiku-4.5']) {
				assert.deepStrictEqual(resolve(id, {}), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE), id);
				assert.deepStrictEqual(resolve(id, { [CopilotCliConfigKey.ClaudeAltPrompt]: false }), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE), id);
			}
		});

		test('applies to every Claude model, not to other families', () => {
			for (const id of ['claude-opus-5', 'claude-opus-4-8', 'claude-sonnet-4.6', 'claude-haiku-4.5']) {
				assert.deepStrictEqual(Object.keys(sectionsOf(id)).sort(), ['code_change_rules', 'guidelines', 'identity', 'last_instructions', 'tool_instructions'], id);
			}
			assert.deepStrictEqual(resolve('gpt-5.6'), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
		});

		// The SDK foundation `last_instructions` section, verbatim from a captured
		// agent-host session (wording owned by the CLI/SDK).
		const FOUNDATION_LAST_INSTRUCTIONS = [
			'<tool_calling>',
			'When you launch a background task agent, treat it as a parallelism opportunity: immediately continue with your own independent tool calls (for example, search, view, edit, and shell tools) rather than polling with read_agent. The background agent runs autonomously — use the time to make progress on other parts of the task.',
			'</tool_calling>',
			'Your goal is to deliver complete, working solutions. If your first approach doesn\'t fully solve the problem, iterate with alternative approaches. Don\'t settle for partial fixes. Verify your changes actually work before considering the task done.',
			'',
			'<task_completion>',
			'* A task is not complete until the expected outcome is verified and persistent',
			'* Install or restore dependencies only after changing dependency manifests or when the chosen validation command fails because packages/tools are missing.',
			'* After starting a background process, verify it is running and responsive (e.g., test with `curl`, check process status)',
			'* If an initial approach fails, try alternative tools or methods before concluding the task is impossible',
			'</task_completion>',
			'Respond concisely to the user, but be thorough in your work.',
		].join('\n');

		test('last_instructions drops the verification mandates but keeps tool_calling and the dependency rule', async () => {
			const result = await runTransform(sectionsOf('claude-opus-5').last_instructions, FOUNDATION_LAST_INSTRUCTIONS);
			assert.strictEqual(result, [
				'<tool_calling>',
				'When you launch a background task agent, treat it as a parallelism opportunity: immediately continue with your own independent tool calls (for example, search, view, edit, and shell tools) rather than polling with read_agent. The background agent runs autonomously — use the time to make progress on other parts of the task.',
				'</tool_calling>',
				'',
				'Install or restore dependencies only after changing dependency manifests or when the chosen validation command fails because packages/tools are missing.',
			].join('\n'));
			assert.doesNotMatch(result, /verif|thorough|task_completion|Don't settle|curl|impossible/i);
		});

		test('last_instructions leaves unrecognised foundation text in place', async () => {
			const result = await runTransform(sectionsOf('claude-opus-5').last_instructions, 'Some new SDK closing guidance.\nRespond concisely to the user, but be thorough in your work.');
			assert.strictEqual(result, 'Some new SDK closing guidance.');
			assert.strictEqual(trimFoundationLastInstructions('Unrelated.'), 'Unrelated.');
		});

		// Representative slice of the SDK foundation `tool_instructions` group
		// (captured from a real agent-host session; wording owned by the CLI/SDK).
		const FOUNDATION_TOOL_INSTRUCTIONS = [
			'<tools>',
			'<bash>',
			'* Use with `mode="sync"` when running long commands.',
			'<example>',
			'* First call: command: `npm run build`, initial_wait: 180, mode: "sync"',
			'</example>',
			'* read_bash is useful for retrieving the remaining output from builds.',
			'</bash>',
			'<edit>',
			'You can use the **edit** tool to batch edits to the same file in a single response.',
			'<example>',
			'// first edit',
			'</example>',
			'</edit>',
			'<ask_user>',
			'Use the ask_user tool to ask the user clarifying questions when needed.',
			'- Prefer multiple choice (provide choices array) over freeform for faster UX',
			'</ask_user>',
			'<sql>',
			'`todos` and `todo_deps` already exist—insert into them; never create them.',
			'</sql>',
			'<task>',
			'* Delegate only work needing substantial separate context.',
			'</task>',
			'</tools>',
		].join('\n');

		test('tool_instructions trims foundation examples and ask_user, keeps runtime guidance, then adds the alternate-prompt rules and the universal lines', async () => {
			const result = await runTransform(sectionsOf('claude-opus-5').tool_instructions, FOUNDATION_TOOL_INSTRUCTIONS);
			assert.doesNotMatch(result, /<example>|<\/example>|npm run build|first edit/);
			assert.doesNotMatch(result, /<ask_user>|clarifying questions|multiple choice/);
			assert.match(result, /read_bash is useful/);
			assert.match(result, /batch edits to the same file/);
			assert.match(result, /<sql>[\s\S]*todo_deps[\s\S]*<\/sql>/);
			assert.match(result, /<task>[\s\S]*Delegate only[\s\S]*<\/task>/);
			assert.ok(result.endsWith(`</tools>\n${CLAUDE_ALT_PROMPT_TOOL_INSTRUCTIONS}\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}`), 'alternate-prompt rules then universal lines must follow the trimmed foundation');
		});

		test('trimFoundationToolInstructions is a no-op on text without the targeted blocks', () => {
			assert.strictEqual(trimFoundationToolInstructions('<bash>keep</bash>'), '<bash>keep</bash>');
		});

		test('code_change_rules drops the preserve-behavior mandate, keeps its closing tag and adds implementation discipline', async () => {
			const result = await runTransform(sectionsOf('claude-opus-5').code_change_rules, FOUNDATION_CODE_CHANGE_RULES);
			assert.doesNotMatch(result, /Validate that your changes preserve existing behavior/);
			assert.match(result, /Update directly related documentation\.\n<\/rules_for_code_changes>/);
			assert.match(result, /Use existing linters, builds, and tests/);
			assert.ok(result.endsWith(`\n${CLAUDE_ALT_PROMPT_IMPLEMENTATION_DISCIPLINE}`));
		});

		test('guidelines drops the verification tips, keeps the rest and appends the Copilot Chat guidance', async () => {
			const result = await runTransform(sectionsOf('claude-opus-5').guidelines, FOUNDATION_GUIDELINES);
			assert.doesNotMatch(result, /Reflect on command output|Clean up temporary files|Ask for guidance/);
			assert.match(result, /Use view\/edit for existing files/);
			assert.match(result, /Do not create markdown files for planning/);
			assert.match(result, /<instructions>\n[\s\S]*do not over-explore[\s\S]*<\/instructions>/);
			assert.match(result, /<operational_safety>/);
			assert.match(result, /<communication_style>\nBe brief\./);
			assert.doesNotMatch(result, /You are a highly sophisticated/);
		});

		test('Sonnet gets the Sonnet exploration wording, other Claude models the Opus wording', async () => {
			const sonnet = await runTransform(sectionsOf('claude-sonnet-4.6').guidelines, '');
			const opus = await runTransform(sectionsOf('claude-opus-5').guidelines, '');
			const haiku = await runTransform(sectionsOf('claude-haiku-4.5').guidelines, '');
			assert.match(sonnet, /Step back and consider a different strategy after two failed attempts/);
			assert.match(sonnet, /batch the reads you've already decided you need/);
			assert.doesNotMatch(opus, /two failed attempts/);
			assert.match(opus, /Avoid redundant searches for information already found/);
			assert.strictEqual(haiku, opus);
		});

		test('a foundation rewording leaves the section untouched apart from the appended guidance', async () => {
			const reworded = '<tips_and_tricks>\n* Think about command output first\n</tips_and_tricks>';
			const result = await runTransform(sectionsOf('claude-opus-5').guidelines, reworded);
			assert.ok(result.startsWith(`${reworded}\n<instructions>`));
		});

		test('composes with the Opus 4.8 tuning when both settings are on', async () => {
			const both = { ...altOn, [CopilotCliConfigKey.Opus48Prompt]: true };
			const sections = sectionsOf('claude-opus-4-8', both);
			// Opus 4.8 tone tweak survives alongside the alternate-prompt sections.
			assert.strictEqual(sections.tone?.action, 'append');
			// Opus 4.8 guidelines append is folded after the alternate-prompt transform.
			const guidelines = await runTransform(sections.guidelines, FOUNDATION_GUIDELINES);
			assert.match(guidelines, /<communication_style>[\s\S]*Do not spawn a subagent for work you can complete directly/);
			// The 4.8 tuning alone is unaffected by the new setting being off.
			assert.deepStrictEqual(Object.keys(sectionsOf('claude-opus-4-8', { [CopilotCliConfigKey.Opus48Prompt]: true })).sort(), ['guidelines', 'identity', 'tone', 'tool_instructions']);
			// And the alternate prompt alone on Opus 4.8 does not pull in the 4.8 tuning.
			assert.strictEqual(sectionsOf('claude-opus-4-8').tone, undefined);
		});
	});

	suite('dropFoundationBullets / mergeSectionOverrides', () => {
		test('drops whole-line bullets and bullets sharing a line with a closing tag', () => {
			const content = 'a\n* drop me\nb\n* drop me too</tag>';
			assert.strictEqual(dropFoundationBullets(content, [String.raw`\* drop me`, String.raw`\* drop me too`]), 'a\nb\n</tag>');
		});

		test('is a no-op when a bullet is absent', () => {
			assert.strictEqual(dropFoundationBullets('a\nb', [String.raw`\* missing`]), 'a\nb');
		});

		test('merges appends, folds an append after a transform, otherwise lets the second win', async () => {
			const transform = (content: string) => `${content}!`;
			const merged = mergeSectionOverrides(
				{ tone: { action: 'append', content: 'A' }, guidelines: { action: transform }, safety: { action: 'replace', content: 'X' } },
				{ tone: { action: 'append', content: 'B' }, guidelines: { action: 'append', content: 'C' }, safety: { action: 'remove' }, preamble: { action: 'append', content: 'P' } },
			);
			assert.deepStrictEqual(merged.tone, { action: 'append', content: 'AB' });
			assert.deepStrictEqual(merged.safety, { action: 'remove' });
			assert.deepStrictEqual(merged.preamble, { action: 'append', content: 'P' });
			assert.ok(typeof merged.guidelines?.action === 'function');
			assert.strictEqual(await merged.guidelines.action('x'), 'x!C');
		});
	});

	suite('model capability overrides (family alias)', () => {
		// Mirrors the launcher's composition in `_buildSessionConfig`: the
		// resolved family becomes the effective model id handed to the registry.
		test('an aliased preview model routes to the family contributor', () => {
			const overrides = { 'preview-model-x': { family: 'claude-opus-4.8' } };
			const family = resolveModelCapabilityOverrideField(overrides, 'preview-model-x', 'family', (value): value is string => normalizeModelFamilyAlias(value) !== undefined);
			const result = agentHostPromptRegistry.resolveSystemMessageConfig(
				{ id: 'preview-model-x', ...(family ? { id: family } : {}) },
				context({ [CopilotCliConfigKey.Opus48Prompt]: true })
			);
			assert.strictEqual(result.mode, 'customize');
		});
	});

	suite('workspace-less scratch/repoless wiring', () => {
		test('prefers attaching a workspace over creating a replacement session', () => {
			assert.deepStrictEqual({
				usesSetWorkspace: AGENT_HOST_WORKSPACELESS_INSTRUCTIONS.includes('Use `set_workspace` only to modify a repository or run commands requiring its project environment'),
				avoidsReplacementSession: AGENT_HOST_WORKSPACELESS_INSTRUCTIONS.includes('do not create a replacement session'),
				allowsScratchArtifacts: AGENT_HOST_WORKSPACELESS_INSTRUCTIONS.includes('scratch changes alone do not require a workspace'),
				keepsAttachmentWorkWorkspaceless: AGENT_HOST_WORKSPACELESS_INSTRUCTIONS.includes('Keep attachment-, pasted-, or generated-content work here'),
				requiresConfirmation: AGENT_HOST_WORKSPACELESS_INSTRUCTIONS.includes('ask exactly one single-select question'),
				namesProviderTools: AGENT_HOST_WORKSPACELESS_INSTRUCTIONS.includes('`request_user_input` (Codex) or `ask_user` (Copilot)'),
				combinesWorkspaceAndIsolation: AGENT_HOST_WORKSPACELESS_INSTRUCTIONS.includes('Each choice must pair an exact workspace with isolation'),
				forbidsSplitQuestions: AGENT_HOST_WORKSPACELESS_INSTRUCTIONS.includes('Do not split the question'),
			}, {
				usesSetWorkspace: true,
				avoidsReplacementSession: true,
				allowsScratchArtifacts: true,
				keepsAttachmentWorkWorkspaceless: true,
				requiresConfirmation: true,
				namesProviderTools: true,
				combinesWorkspaceAndIsolation: true,
				forbidsSplitQuestions: true,
			});
		});

		test('appends the scratch instructions to the default config for a workspace-less chat', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig(undefined, context({}, [], true)),
				{
					mode: 'customize',
					sections: {
						...COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections,
						tool_instructions: { action: 'append', content: `\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}` },
					},
					content: `${AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}\n\n${AGENT_HOST_FILE_LINK_INSTRUCTIONS}`,
				}
			);
		});

		test('is a no-op for a workspace-bound session', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig(undefined, context({}, [], false)),
				withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
			);
		});

		test('composes with per-model customize content for a workspace-less chat', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['claude'];
				resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
					return { guidelines: { action: 'append', content: 'Be concise.' } };
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'claude-sonnet' }, context({}, [], true)),
				{
					mode: 'customize',
					sections: {
						identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
						guidelines: { action: 'append', content: 'Be concise.' },
						tool_instructions: { action: 'append', content: `\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}` },
					},
					content: `${AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}\n\n${AGENT_HOST_FILE_LINK_INSTRUCTIONS}`,
				}
			);
		});

		test('appends scratch instructions after a full replace prompt', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['gpt-5'];
				resolveFullSystemPrompt(): string {
					return 'FULL PROMPT';
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'gpt-5-mini' }, context({}, [], true)),
				{ mode: 'replace', content: `FULL PROMPT\n\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}\n\n${AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}\n\n${AGENT_HOST_FILE_LINK_INSTRUCTIONS}` }
			);
		});
	});

	suite('universal tool instructions wiring', () => {
		// These guard that the registry layers the registered universal instructions
		// end-to-end; composition and gating are covered in toolInstructions.test.ts.
		const BROWSER_LINE = 'Use the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.';
		const browserTools = [BrowserChatToolReferenceName.OpenBrowserPage, BrowserChatToolReferenceName.ReadPage];

		test('layers the unconditional tool instructions onto the default config', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: 'm' }, context({}, ['anyTool'])), withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
		});

		test('layers the browser tool_instructions onto the default config when browser tools are present', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'm' }, context({}, browserTools)),
				withUniversalAgentHostInstructions({
					mode: 'customize',
					sections: {
						identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
						tool_instructions: { action: 'append', content: `\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}\n${BROWSER_LINE}` },
					},
				})
			);
		});

		test('composes the browser line with a per-model tool_instructions override', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['claude'];
				resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
					return { tool_instructions: { action: 'append', content: 'Always prefer ripgrep.' } };
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'claude-x' }, context({}, browserTools)),
				withUniversalAgentHostInstructions({
					mode: 'customize',
					sections: {
						identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
						tool_instructions: { action: 'append', content: `\nAlways prefer ripgrep.\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}\n${BROWSER_LINE}` },
					},
				})
			);
		});

		test('composes the unconditional tool instructions with a per-model override', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['claude'];
				resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
					return { tool_instructions: { action: 'append', content: 'Always prefer ripgrep.' } };
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'claude-x' }, context({}, ['anyTool'])),
				withUniversalAgentHostInstructions({
					mode: 'customize',
					sections: {
						identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
						tool_instructions: { action: 'append', content: `\nAlways prefer ripgrep.\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}` },
					},
				})
			);
		});

		test('appends the browser line after a full replace prompt', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['gpt-5'];
				resolveFullSystemPrompt(): string {
					return 'FULL PROMPT';
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'gpt-5-mini' }, context({}, browserTools)),
				{ mode: 'replace', content: `FULL PROMPT\n\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}\n${BROWSER_LINE}\n\n${AGENT_HOST_FILE_LINK_INSTRUCTIONS}` }
			);
		});
	});

	suite('tool search instructions wiring', () => {
		// End-to-end guard that the registry layers the tool-search line only
		// when `toolSearchActive` AND the client tool-search tool are both
		// present; the composition/gating itself is covered in
		// toolInstructions.test.ts.
		const TOOL_SEARCH_LINE = `Most tools are deferred and hidden until you search for them. Before calling a tool that has not already been loaded, ALWAYS use tool search first with a short description of the capability you need, then call the specific tool it returns; tools it returns are immediately available and must not be searched for again.`;

		test('layers the tool-search line onto the default config when active and the tool-search tool is present', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'm' }, context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, true)),
				withUniversalAgentHostInstructions({
					mode: 'customize',
					sections: {
						identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
						tool_instructions: { action: 'append', content: `\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}\n${TOOL_SEARCH_LINE}` },
					},
				})
			);
		});

		test('does not add the tool-search instruction when tool search is inactive', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'm' }, context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, false)),
				withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
			);
		});

		test('does not add the tool-search instruction when the client tool is unavailable', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'm' }, context({}, ['anyTool'], false, true)),
				withUniversalAgentHostInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
			);
		});

		test('composes the tool-search line with a per-model tool_instructions override', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['claude'];
				resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
					return { tool_instructions: { action: 'append', content: 'Always prefer ripgrep.' } };
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'claude-x' }, context({}, [CLIENT_TOOL_SEARCH_REFERENCE_NAME], false, true)),
				withUniversalAgentHostInstructions({
					mode: 'customize',
					sections: {
						identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
						tool_instructions: { action: 'append', content: `\nAlways prefer ripgrep.\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}\n${TOOL_SEARCH_LINE}` },
					},
				})
			);
		});
	});
});
