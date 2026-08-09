/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SectionOverride, SystemMessageConfig, SystemMessageSection } from '@github/copilot-sdk';
import { CopilotCliConfigKey, applyModelFamilyAlias, copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import type { SchemaValues } from '../../common/agentHostSchema.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';
import { AgentHostPromptRegistry, agentHostPromptRegistry, type IAgentHostPromptContext } from '../../node/copilot/prompts/promptRegistry.js';
import { COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS, COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS, COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from '../../node/copilot/prompts/systemMessage.js';
import { COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION } from '../../node/copilot/prompts/toolInstructions.js';
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

	const withUniversalAgentHostInstructions = (config: SystemMessageConfig): SystemMessageConfig => {
		const content = config.content ? `${config.content}\n\n${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}` : COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS;
		if (config.mode !== 'customize' || config.sections?.tool_instructions) {
			return { ...config, content };
		}
		return {
			...config,
			sections: {
				...config.sections,
				tool_instructions: { action: 'append', content: `\n${LARGE_OUTPUT_LINE}` } satisfies SectionOverride,
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

	test('a contributor can fully replace the system prompt (replace mode)', () => {
		const registry = new AgentHostPromptRegistry();
		registry.registerPrompt(class {
			static readonly familyPrefixes = ['gpt-5'];
			resolveFullSystemPrompt(): string {
				return 'FULL PROMPT';
			}
		});
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'gpt-5-mini' }, context()),
			{ mode: 'replace', content: 'FULL PROMPT' }
		);
	});

	test('a contributor can override individual sections (customize mode)', () => {
		const registry = new AgentHostPromptRegistry();
		registry.registerPrompt(class {
			static readonly familyPrefixes = ['claude'];
			resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
				return { guidelines: { action: 'append', content: 'Be concise.' } };
			}
		});
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'claude-sonnet' }, context()),
			withUniversalAgentHostInstructions({ mode: 'customize', sections: { guidelines: { action: 'append', content: 'Be concise.' } } })
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
			{ mode: 'replace', content: 'CODEX' }
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
			withUniversalAgentHostInstructions({ mode: 'customize', sections: { tone: { action: 'append', content: 'GATED' } } })
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

	suite('model capability overrides (family alias)', () => {
		// The launcher composes `applyModelFamilyAlias` with the registry (see
		// `_buildSessionConfig`); this guards that composition end-to-end using
		// the real Opus contributor, whose custom `matchesModel` checks the id.
		// The alias helper's own behavior is covered in copilotCliConfig.test.ts.
		test('an aliased preview model routes to the family contributor', () => {
			const overrides = { 'preview-model-x': { family: 'claude-opus-4-8' } };
			const result = agentHostPromptRegistry.resolveSystemMessageConfig(
				applyModelFamilyAlias({ id: 'preview-model-x' }, overrides),
				context({ [CopilotCliConfigKey.Opus48Prompt]: true })
			);
			assert.strictEqual(result.mode, 'customize');
		});
	});

	suite('workspace-less scratch/repoless wiring', () => {
		test('appends the scratch instructions to the default config for a workspace-less chat', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig(undefined, context({}, [], true)),
				{
					mode: 'customize',
					sections: {
						...COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections,
						tool_instructions: { action: 'append', content: `\n${LARGE_OUTPUT_LINE}` },
					},
					content: `${COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}\n\n${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}`,
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
						guidelines: { action: 'append', content: 'Be concise.' },
						tool_instructions: { action: 'append', content: `\n${LARGE_OUTPUT_LINE}` },
					},
					content: `${COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}\n\n${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}`,
				}
			);
		});

		test('does not append scratch instructions to a full replace prompt', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['gpt-5'];
				resolveFullSystemPrompt(): string {
					return 'FULL PROMPT';
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'gpt-5-mini' }, context({}, [], true)),
				{ mode: 'replace', content: 'FULL PROMPT' }
			);
		});
	});

	suite('universal tool instructions wiring', () => {
		// These guard that the registry layers the registered universal instructions
		// end-to-end; composition and gating are covered in toolInstructions.test.ts.
		const BROWSER_LINE = 'Use the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.';
		const browserTools = [BrowserChatToolReferenceName.OpenBrowserPage, BrowserChatToolReferenceName.ReadPage];

		test('layers the unconditional large-output instruction onto the default config', () => {
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
						tool_instructions: { action: 'append', content: `\n${LARGE_OUTPUT_LINE}\n${BROWSER_LINE}` },
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
				withUniversalAgentHostInstructions({ mode: 'customize', sections: { tool_instructions: { action: 'append', content: `\nAlways prefer ripgrep.\n${LARGE_OUTPUT_LINE}\n${BROWSER_LINE}` } } })
			);
		});

		test('composes the unconditional large-output instruction with a per-model override', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['claude'];
				resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
					return { tool_instructions: { action: 'append', content: 'Always prefer ripgrep.' } };
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'claude-x' }, context({}, ['anyTool'])),
				withUniversalAgentHostInstructions({ mode: 'customize', sections: { tool_instructions: { action: 'append', content: `\nAlways prefer ripgrep.\n${LARGE_OUTPUT_LINE}` } } })
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
						tool_instructions: { action: 'append', content: `\n${LARGE_OUTPUT_LINE}\n${TOOL_SEARCH_LINE}` },
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
				withUniversalAgentHostInstructions({ mode: 'customize', sections: { tool_instructions: { action: 'append', content: `\nAlways prefer ripgrep.\n${LARGE_OUTPUT_LINE}\n${TOOL_SEARCH_LINE}` } } })
			);
		});
	});
});
