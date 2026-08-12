/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SectionOverride } from '@github/copilot-sdk';
import { COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION, COPILOT_AGENT_HOST_SESSION_COORDINATION_TOOL_INSTRUCTION, resolveToolInstructionsOverride, toolSearchInstructionLines, universalToolInstructions } from '../../node/copilot/prompts/toolInstructions.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME } from '../../common/toolSearchConstants.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

/** Builds a `hasTool` predicate backed by the given available tool names. */
function hasTools(...names: string[]): (name: string) => boolean {
	const set = new Set(names);
	return name => set.has(name);
}

/** A gated tool-instruction line that renders `use <tool>` when `tool` is present. */
function lineFor(tool: string): (hasTool: (name: string) => boolean) => string | undefined {
	return hasTool => hasTool(tool) ? `use ${tool}` : undefined;
}

suite('toolInstructions', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const LARGE_OUTPUT_LINE = COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION;
	const SESSION_COORDINATION_LINE = COPILOT_AGENT_HOST_SESSION_COORDINATION_TOOL_INSTRUCTION;
	const BASE_LINES = `${LARGE_OUTPUT_LINE}\n${SESSION_COORDINATION_LINE}`;

	suite('universalToolInstructions', () => {
		test('joins applicable lines in order and drops gated-out ones', () => {
			assert.strictEqual(universalToolInstructions(hasTools('a', 'c'), [lineFor('a'), lineFor('b'), lineFor('c')]), 'use a\nuse c');
		});

		test('returns undefined when no injected line applies', () => {
			assert.strictEqual(universalToolInstructions(hasTools('x'), [lineFor('a')]), undefined);
		});

		test('always renders the registered host-wide lines from the default registry', () => {
			assert.deepStrictEqual([
				COPILOT_AGENT_HOST_LARGE_OUTPUT_TOOL_INSTRUCTION,
				universalToolInstructions(hasTools()),
			], [
				'When a tool reports that its output was saved to a temporary file because it was too large, ONLY use the `view` tool with a narrow `view_range` to inspect that file. NEVER read it with shell commands such as `cat`, `head`, `tail`, or `sed`, because their output may be offloaded again.',
				BASE_LINES,
			]);
		});

		test('renders session coordination guidance from the default registry', () => {
			assert.deepStrictEqual([
				COPILOT_AGENT_HOST_SESSION_COORDINATION_TOOL_INSTRUCTION,
				universalToolInstructions(hasTools())?.includes(SESSION_COORDINATION_LINE),
			], [
				'Before beginning code changes or creating a session, use `get_current_session` to identify the current session, then use `list_sessions` to check other active sessions across the same project or repository—not only the same working directory—and exclude the current session URI. Compare each session\'s title, activity, branch, pull request, and changed files to identify plausible overlap. For plausible overlaps, use `get_session_context` to confirm the scope and `send_message` to agree on ownership or sequencing before editing shared files; otherwise continue independently without waiting. Prefer dividing work to avoid duplicate effort, conflicting edits, and unnecessary merge conflicts.',
				true,
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
					`${BASE_LINES}\nUse the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.`,
					BASE_LINES,
					BASE_LINES,
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
				`${BASE_LINES}\n${TOOL_SEARCH_LINE}`,
				BASE_LINES,
			]);
		});

		test('inactive tool search never contributes the tool-search line', () => {
			assert.strictEqual(universalToolInstructions(hasTools(CLIENT_TOOL_SEARCH_REFERENCE_NAME), toolSearchInstructionLines(false)), BASE_LINES);
		});

		test('composes the tool-search line after the registered large-output and browser lines', () => {
			assert.strictEqual(
				universalToolInstructions(hasTools('openBrowserPage', 'readPage', CLIENT_TOOL_SEARCH_REFERENCE_NAME), toolSearchInstructionLines(true)),
				`${BASE_LINES}\nUse the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.\n${TOOL_SEARCH_LINE}`
			);
		});

		test('folds the tool-search line into an existing per-model override only while active', () => {
			assert.deepStrictEqual([
				resolveToolInstructionsOverride(hasTools(CLIENT_TOOL_SEARCH_REFERENCE_NAME), { action: 'append', content: 'A' }, toolSearchInstructionLines(true)),
				resolveToolInstructionsOverride(hasTools(CLIENT_TOOL_SEARCH_REFERENCE_NAME), { action: 'append', content: 'A' }, toolSearchInstructionLines(false)),
			], [
				{ action: 'append', content: `\nA\n${BASE_LINES}\n${TOOL_SEARCH_LINE}` },
				{ action: 'append', content: `\nA\n${BASE_LINES}` },
			]);
		});
	});
});
