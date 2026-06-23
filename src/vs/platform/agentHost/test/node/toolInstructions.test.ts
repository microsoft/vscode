/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type { SectionOverride } from '@github/copilot-sdk';
import { appendUniversalToolInstructions, composeToolInstructions, resolveToolInstructionsOverride, universalToolInstructions } from '../../node/copilot/prompts/toolInstructions.js';
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

		test('returns undefined when no line applies (including the empty registry)', () => {
			assert.strictEqual(universalToolInstructions(hasTools('x'), [lineFor('a')]), undefined);
			assert.strictEqual(universalToolInstructions(hasTools('a')), undefined);
		});
	});

	suite('composeToolInstructions', () => {
		test('appends to the foundation section when there is no per-model override', () => {
			assert.deepStrictEqual(composeToolInstructions(undefined, 'LINE'), { action: 'append', content: '\nLINE' });
		});

		test('folds into a per-model string override, preserving its action', () => {
			assert.deepStrictEqual(composeToolInstructions({ action: 'append', content: 'A' }, 'LINE'), { action: 'append', content: 'A\nLINE' });
			assert.deepStrictEqual(composeToolInstructions({ action: 'replace', content: 'OWN' }, 'LINE'), { action: 'replace', content: 'OWN\nLINE' });
			assert.deepStrictEqual(composeToolInstructions({ action: 'prepend', content: 'P' }, 'LINE'), { action: 'prepend', content: 'P\nLINE' });
		});

		test('preserves a remove or transform-function override untouched', () => {
			const transform = (s: string) => s;
			assert.deepStrictEqual(composeToolInstructions({ action: 'remove' }, 'LINE'), { action: 'remove' });
			assert.deepStrictEqual(composeToolInstructions({ action: transform }, 'LINE'), { action: transform });
		});
	});

	suite('resolveToolInstructionsOverride', () => {
		test('returns undefined (keep existing) when no line applies', () => {
			const existing: SectionOverride = { action: 'append', content: 'A' };
			assert.strictEqual(resolveToolInstructionsOverride(hasTools('x'), existing, [lineFor('a')]), undefined);
		});

		test('composes the rendered lines with the existing override', () => {
			assert.deepStrictEqual(
				resolveToolInstructionsOverride(hasTools('a'), { action: 'append', content: 'A' }, [lineFor('a')]),
				{ action: 'append', content: 'A\nuse a' }
			);
		});
	});

	suite('appendUniversalToolInstructions', () => {
		test('returns the prompt unchanged while no lines apply (empty registry)', () => {
			assert.strictEqual(appendUniversalToolInstructions('FULL PROMPT', hasTools('a')), 'FULL PROMPT');
		});
	});
});
