/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SectionOverride } from '@github/copilot-sdk';
import { resolveToolInstructionsOverride, universalToolInstructions } from '../../node/copilot/prompts/toolInstructions.js';
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

	suite('universalToolInstructions', () => {
		test('joins applicable lines in order and drops gated-out ones', () => {
			assert.strictEqual(universalToolInstructions(hasTools('a', 'c'), [lineFor('a'), lineFor('b'), lineFor('c')]), 'use a\nuse c');
		});

		test('returns undefined when no line applies (including the default registry when its lines do not apply)', () => {
			assert.strictEqual(universalToolInstructions(hasTools('x'), [lineFor('a')]), undefined);
			assert.strictEqual(universalToolInstructions(hasTools('a')), undefined);
		});

		test('renders the registered browser line from the default registry only when openBrowserPage + an agentic browser tool are present', () => {
			assert.deepStrictEqual(
				[
					universalToolInstructions(hasTools('openBrowserPage', 'readPage')),
					universalToolInstructions(hasTools('openBrowserPage')),
					universalToolInstructions(hasTools('readPage')),
				],
				[
					'Use the browser tools (openBrowserPage, readPage, etc.) when beneficial for front-end tasks, such as when visualizing or validating UI changes.',
					undefined,
					undefined,
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
});
