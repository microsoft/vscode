/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SectionOverride } from '@github/copilot-sdk';
import { COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION, COPILOT_AGENT_HOST_SUBAGENT_TOOL_INSTRUCTIONS, resolveToolInstructionsOverride, toolSearchInstructionLines, universalToolInstructions, type IToolInstructionContext } from '../../node/copilot/prompts/toolInstructions.js';
import type { SchemaValues } from '../../common/agentHostSchema.js';
import { CopilotCliConfigKey, copilotCliConfigSchema } from '../../common/copilotCliConfig.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME } from '../../common/toolSearchConstants.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

/** Builds a line context exposing the given tool names and host settings. */
function context(tools: readonly string[] = [], settings: SchemaValues<typeof copilotCliConfigSchema.definition> = {}): IToolInstructionContext {
	const set = new Set(tools);
	return {
		hasTool: name => set.has(name),
		getSetting: key => settings[key],
	};
}

/** Shorthand for a context with only tools available. */
function hasTools(...names: string[]): IToolInstructionContext {
	return context(names);
}

/** A gated tool-instruction line that renders `use <tool>` when `tool` is present. */
function lineFor(tool: string): (ctx: IToolInstructionContext) => string | undefined {
	return ({ hasTool }) => hasTool(tool) ? `use ${tool}` : undefined;
}

suite('toolInstructions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const LARGE_OUTPUT_LINE = COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION;
	const UNCONDITIONAL_TOOL_INSTRUCTIONS = LARGE_OUTPUT_LINE;

	suite('universalToolInstructions', () => {
		test('joins applicable lines in order and drops gated-out ones', () => {
			assert.strictEqual(universalToolInstructions(hasTools('a', 'c'), [lineFor('a'), lineFor('b'), lineFor('c')]), 'use a\nuse c');
		});

		test('returns undefined when no injected line applies', () => {
			assert.strictEqual(universalToolInstructions(hasTools('x'), [lineFor('a')]), undefined);
		});

		test('always renders the registered unconditional instructions', () => {
			assert.deepStrictEqual([
				COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION,
				universalToolInstructions(hasTools()),
			], [
				'When a tool reports that its output was saved to a temporary file because it was too large, ONLY use the `view` tool with a narrow `view_range` to inspect that file. NEVER read it with shell commands such as `cat`, `head`, `tail`, or `sed`, because their output may be offloaded again.',
				UNCONDITIONAL_TOOL_INSTRUCTIONS,
			]);
		});

		test('adds the registered subagent model guidance only when its setting is enabled', () => {
			assert.deepStrictEqual([
				COPILOT_AGENT_HOST_SUBAGENT_TOOL_INSTRUCTIONS,
				universalToolInstructions(context([], { [CopilotCliConfigKey.SubagentModelGuidance]: true })),
				universalToolInstructions(context([], { [CopilotCliConfigKey.SubagentModelGuidance]: false })),
				universalToolInstructions(context()),
			], [
				'When launching subagents with the task tool, leave the `model`, `reasoning_effort`, and `context_tier` parameters unset — each agent type already runs on a model suited to it, and overriding the model changes the session\'s cost and behavior profile.\nOnly set the task tool\'s `model` parameter when the user explicitly names the model the subagent should run on.',
				`${UNCONDITIONAL_TOOL_INSTRUCTIONS}\n${COPILOT_AGENT_HOST_SUBAGENT_TOOL_INSTRUCTIONS}`,
				UNCONDITIONAL_TOOL_INSTRUCTIONS,
				UNCONDITIONAL_TOOL_INSTRUCTIONS,
			]);
		});

		test('adds the registered browser line only when openBrowserPage + an agentic browser tool are present', () => {
			assert.deepStrictEqual(
				[
					universalToolInstructions(hasTools('openBrowserPage', 'readPage')),
					universalToolInstructions(hasTools('openBrowserPage')),
					universalToolInstructions(hasTools('readPage')),
				],
				[
					`${UNCONDITIONAL_TOOL_INSTRUCTIONS}\nUse the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.`,
					UNCONDITIONAL_TOOL_INSTRUCTIONS,
					UNCONDITIONAL_TOOL_INSTRUCTIONS,
				]
			);
		});
	});

	// `composeToolInstructions` is module-private; its composition/spacing
	// behavior is exercised here through the public `resolveToolInstructionsOverride`
	// (injecting synthetic lines via the `lines` seam).
	suite('resolveToolInstructionsOverride', () => {
		test('returns undefined (keep existing) when no line applies', () => {
			assert.strictEqual(resolveToolInstructionsOverride(hasTools('x'), { action: 'append', content: 'A' }, [lineFor('a')]), undefined);
		});

		test('with no per-model override, appends the rendered line after the foundation section', () => {
			assert.deepStrictEqual(resolveToolInstructionsOverride(hasTools('a'), undefined, [lineFor('a')]), { action: 'append', content: '\nuse a' });
		});

		test('folds into a per-model string override, preserving action and foundation spacing', () => {
			const overrides: SectionOverride[] = [
				{ action: 'append', content: 'A' },   // sits after foundation → leads with a newline
				{ action: 'prepend', content: 'P' },  // sits before foundation → trails with a newline
				{ action: 'replace', content: 'OWN' },// owns the section → no padding
				{ action: 'replace', content: '' },   // empty replace → no spurious leading newline
			];
			assert.deepStrictEqual(overrides.map(o => resolveToolInstructionsOverride(hasTools('a'), o, [lineFor('a')])), [
				{ action: 'append', content: '\nA\nuse a' },
				{ action: 'prepend', content: 'P\nuse a\n' },
				{ action: 'replace', content: 'OWN\nuse a' },
				{ action: 'replace', content: 'use a' },
			]);
		});

		test('preserves a remove or transform-function override untouched', () => {
			const transform = (s: string) => s;
			assert.deepStrictEqual(resolveToolInstructionsOverride(hasTools('a'), { action: 'remove' }, [lineFor('a')]), { action: 'remove' });
			assert.deepStrictEqual(resolveToolInstructionsOverride(hasTools('a'), { action: transform }, [lineFor('a')]), { action: transform });
		});
	});

	// The tool-search line is the model-facing instruction gated on BOTH
	// `toolSearchActive` (via `toolSearchInstructionLines`) and the client
	// exposing the tool-search tool. These lock its content, gating, and
	// composition so neither the instruction nor its gate can silently regress.
	suite('toolSearchInstructionLines', () => {
		const TOOL_SEARCH_LINE = `Most tools are deferred and hidden until you search for them. Before calling a tool that has not already been loaded, ALWAYS use tool search first with a short description of the capability you need, then call the specific tool it returns; tools it returns are immediately available and must not be searched for again.`;

		test('active tool search contributes the tool-search line only when the client exposes the tool-search tool', () => {
			assert.deepStrictEqual([
				universalToolInstructions(hasTools(CLIENT_TOOL_SEARCH_REFERENCE_NAME), toolSearchInstructionLines(true)),
				universalToolInstructions(hasTools('other'), toolSearchInstructionLines(true)),
			], [
				`${UNCONDITIONAL_TOOL_INSTRUCTIONS}\n${TOOL_SEARCH_LINE}`,
				UNCONDITIONAL_TOOL_INSTRUCTIONS,
			]);
		});

		test('inactive tool search never contributes the tool-search line', () => {
			assert.strictEqual(universalToolInstructions(hasTools(CLIENT_TOOL_SEARCH_REFERENCE_NAME), toolSearchInstructionLines(false)), UNCONDITIONAL_TOOL_INSTRUCTIONS);
		});

		test('composes the tool-search line after the registered large-output and browser lines', () => {
			assert.strictEqual(
				universalToolInstructions(hasTools('openBrowserPage', 'readPage', CLIENT_TOOL_SEARCH_REFERENCE_NAME), toolSearchInstructionLines(true)),
				`${UNCONDITIONAL_TOOL_INSTRUCTIONS}\nUse the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.\n${TOOL_SEARCH_LINE}`
			);
		});

		test('folds the tool-search line into an existing per-model override only while active', () => {
			assert.deepStrictEqual([
				resolveToolInstructionsOverride(hasTools(CLIENT_TOOL_SEARCH_REFERENCE_NAME), { action: 'append', content: 'A' }, toolSearchInstructionLines(true)),
				resolveToolInstructionsOverride(hasTools(CLIENT_TOOL_SEARCH_REFERENCE_NAME), { action: 'append', content: 'A' }, toolSearchInstructionLines(false)),
			], [
				{ action: 'append', content: `\nA\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}\n${TOOL_SEARCH_LINE}` },
				{ action: 'append', content: `\nA\n${UNCONDITIONAL_TOOL_INSTRUCTIONS}` },
			]);
		});
	});
});
