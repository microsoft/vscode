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
import { BrowserChatToolReferenceName } from '../../../browserView/common/browserChatToolReferenceNames.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import '../../node/copilot/prompts/allPrompts.js';

/**
 * Builds a prompt context backed by an in-memory bag of customization settings
 * and an optional set of available tool names.
 */
function context(settings: SchemaValues<typeof copilotCliConfigSchema.definition> = {}, tools: readonly string[] = [], workspaceless = false): IAgentHostPromptContext {
	const toolNames = new Set(tools);
	return {
		getSetting: key => settings[key],
		hasClientTool: name => toolNames.has(name),
		workspaceless,
	};
}

suite('AgentHostPromptRegistry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const withFileLinkInstructions = (config: SystemMessageConfig): SystemMessageConfig => ({
		...config,
		content: config.content ? `${config.content}\n\n${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}` : COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS,
	});

	test('falls back to the default system message when no model is provided', () => {
		const registry = new AgentHostPromptRegistry();
		assert.deepStrictEqual(registry.resolveSystemMessageConfig(undefined, context()), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
	});

	test('falls back to the default when no contributor matches the model', () => {
		const registry = new AgentHostPromptRegistry();
		assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: 'unknown-model' }, context()), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
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
			withFileLinkInstructions({ mode: 'customize', sections: { guidelines: { action: 'append', content: 'Be concise.' } } })
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
			withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
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
			withFileLinkInstructions({ mode: 'customize', sections: { tone: { action: 'append', content: 'GATED' } } })
		);
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'claude-x' }, context()),
			withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
		);
	});

	suite('Opus contributor (registered via allPrompts)', () => {
		const opusModel: ModelSelection = { id: 'claude-opus-4-8' };

		function resolveOpus(enabled: boolean | undefined) {
			return agentHostPromptRegistry.resolveSystemMessageConfig(opusModel, context(enabled === undefined ? {} : { [CopilotCliConfigKey.Opus48Prompt]: enabled }));
		}

		test('applies customize overrides only when enabled', () => {
			assert.deepStrictEqual(resolveOpus(undefined), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
			assert.deepStrictEqual(resolveOpus(false), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
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
					sections: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections,
					content: `${COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS}\n\n${COPILOT_AGENT_HOST_FILE_LINK_INSTRUCTIONS}`,
				}
			);
		});

		test('is a no-op for a workspace-bound session', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig(undefined, context({}, [], false)),
				withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE)
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
					sections: { guidelines: { action: 'append', content: 'Be concise.' } },
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
		// The browser line is the registered universal tool-instruction (see
		// toolInstructions.ts). These guard that the registry layers it end-to-end;
		// the composition/gating itself is covered in toolInstructions.test.ts.
		const BROWSER_LINE = 'Use the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.';
		const browserTools = [BrowserChatToolReferenceName.OpenBrowserPage, BrowserChatToolReferenceName.ReadPage];

		test('is a no-op when the session exposes no matching tools', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: 'm' }, context({}, ['anyTool'])), withFileLinkInstructions(COPILOT_AGENT_HOST_SYSTEM_MESSAGE));
		});

		test('layers the browser tool_instructions onto the default config when browser tools are present', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'm' }, context({}, browserTools)),
				withFileLinkInstructions({
					mode: 'customize',
					sections: {
						identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
						tool_instructions: { action: 'append', content: `\n${BROWSER_LINE}` },
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
				withFileLinkInstructions({ mode: 'customize', sections: { tool_instructions: { action: 'append', content: `\nAlways prefer ripgrep.\n${BROWSER_LINE}` } } })
			);
		});

		test('leaves a per-model tool_instructions override untouched when no browser tools are present', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['claude'];
				resolveSectionOverrides(): Partial<Record<SystemMessageSection, SectionOverride>> {
					return { tool_instructions: { action: 'append', content: 'Always prefer ripgrep.' } };
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'claude-x' }, context({}, ['anyTool'])),
				withFileLinkInstructions({ mode: 'customize', sections: { tool_instructions: { action: 'append', content: 'Always prefer ripgrep.' } } })
			);
		});
	});
});
