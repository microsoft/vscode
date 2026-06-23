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
import { COPILOT_AGENT_HOST_SYSTEM_MESSAGE } from '../../node/copilot/prompts/systemMessage.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import '../../node/copilot/prompts/allPrompts.js';

/**
 * Builds a prompt context backed by an in-memory bag of customization settings
 * and an optional set of available tool names.
 */
function context(settings: SchemaValues<typeof agentHostCustomizationConfigSchema.definition> = {}, tools: readonly string[] = []): IAgentHostPromptContext {
	const toolNames = new Set(tools);
	return {
		getSetting: key => settings[key],
		hasTool: name => toolNames.has(name),
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

	suite('universal tool instructions wiring', () => {
		// No tool-instruction lines are registered yet (concrete tool hookups land
		// in follow-up changes), so the universal layer is currently a no-op. These
		// guard the wiring; the composition/gating itself is covered in
		// toolInstructions.test.ts.

		test('is a no-op while no tool-instruction lines are registered', () => {
			const registry = new AgentHostPromptRegistry();
			assert.deepStrictEqual(registry.resolveSystemMessageConfig({ id: 'm' }, context({}, ['anyTool'])), COPILOT_AGENT_HOST_SYSTEM_MESSAGE);
		});

		test('leaves a per-model tool_instructions override untouched', () => {
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

		test('leaves a full replace prompt untouched', () => {
			const registry = new AgentHostPromptRegistry();
			registry.registerPrompt(class {
				static readonly familyPrefixes = ['gpt-5'];
				resolveFullSystemPrompt(): string {
					return 'FULL PROMPT';
				}
			});
			assert.deepStrictEqual(
				registry.resolveSystemMessageConfig({ id: 'gpt-5-mini' }, context({}, ['anyTool'])),
				{ mode: 'replace', content: 'FULL PROMPT' }
			);
		});
	});
});
