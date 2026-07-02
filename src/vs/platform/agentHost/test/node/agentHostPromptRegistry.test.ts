/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SectionOverride, SystemMessageSection } from '@github/copilot-sdk';
import { AgentHostConfigKey, agentHostCustomizationConfigSchema } from '../../common/agentHostCustomizationConfig.js';
import type { SchemaValues } from '../../common/agentHostSchema.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';
import { AgentHostPromptRegistry, agentHostPromptRegistry, type IAgentHostPromptContext } from '../../node/copilot/prompts/promptRegistry.js';
import { COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS, COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from '../../node/copilot/prompts/systemMessage.js';
import { BrowserChatToolReferenceName } from '../../../browserView/common/browserChatToolReferenceNames.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import '../../node/copilot/prompts/allPrompts.js';

/**
 * Builds a prompt context backed by an in-memory bag of customization settings
 * and an optional set of available tool names.
 */
function context(settings: SchemaValues<typeof agentHostCustomizationConfigSchema.definition> = {}, tools: readonly string[] = [], workspaceless = false): IAgentHostPromptContext {
	const toolNames = new Set(tools);
	return {
		getSetting: key => settings[key],
		hasClientTool: name => toolNames.has(name),
		workspaceless,
	};
}

suite('AgentHostPromptRegistry', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('falls back to the default system message when no model is provided', () => {
		const registry = new AgentHostPromptRegistry();
		assert.deepStrictEqual(registry.resolveSystemMessageConfig(undefined, context()), COPILOT_AGENT_HOST_SYSTEM_MESSAGE);
	});

	test('falls back to the default when no contributor matches the model', () => {
		const registry = new AgentHostPromptRegistry();
		assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: 'unknown-model' }, context()), COPILOT_AGENT_HOST_SYSTEM_MESSAGE);
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
			{ mode: 'customize', sections: { guidelines: { action: 'append', content: 'Be concise.' } } }
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
			COPILOT_AGENT_HOST_SYSTEM_MESSAGE
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
				return ctx.getSetting(AgentHostConfigKey.Opus48Prompt) === true ? { tone: { action: 'append', content: 'GATED' } } : undefined;
			}
		});
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'claude-x' }, context({ [AgentHostConfigKey.Opus48Prompt]: true })),
			{ mode: 'customize', sections: { tone: { action: 'append', content: 'GATED' } } }
		);
		assert.deepStrictEqual(
			registry.resolveSystemMessageConfig({ id: 'claude-x' }, context()),
			COPILOT_AGENT_HOST_SYSTEM_MESSAGE
		);
	});

	suite('Opus contributor (registered via allPrompts)', () => {
		const opusModel: ModelSelection = { id: 'claude-opus-4-8' };

		function resolveOpus(enabled: boolean | undefined) {
			return agentHostPromptRegistry.resolveSystemMessageConfig(opusModel, context(enabled === undefined ? {} : { [AgentHostConfigKey.Opus48Prompt]: enabled }));
		}

		test('applies customize overrides only when enabled', () => {
			assert.strictEqual(resolveOpus(undefined), COPILOT_AGENT_HOST_SYSTEM_MESSAGE);
			assert.strictEqual(resolveOpus(false), COPILOT_AGENT_HOST_SYSTEM_MESSAGE);
			assert.strictEqual(resolveOpus(true).mode, 'customize');
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
					content: COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS,
				}
			);
		});

		test('is a no-op for a workspace-bound session', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig(undefined, context({}, [], false)),
				COPILOT_AGENT_HOST_SYSTEM_MESSAGE
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
					content: COPILOT_AGENT_HOST_WORKSPACELESS_INSTRUCTIONS,
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
			assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: 'm' }, context({}, ['anyTool'])), COPILOT_AGENT_HOST_SYSTEM_MESSAGE);
		});

		test('layers the browser tool_instructions onto the default config when browser tools are present', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'm' }, context({}, browserTools)),
				{
					mode: 'customize',
					sections: {
						identity: COPILOT_AGENT_HOST_SYSTEM_MESSAGE.sections.identity,
						tool_instructions: { action: 'append', content: `\n${BROWSER_LINE}` },
					},
				}
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
				{ mode: 'customize', sections: { tool_instructions: { action: 'append', content: `\nAlways prefer ripgrep.\n${BROWSER_LINE}` } } }
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
				{ mode: 'customize', sections: { tool_instructions: { action: 'append', content: 'Always prefer ripgrep.' } } }
			);
		});
	});
});
