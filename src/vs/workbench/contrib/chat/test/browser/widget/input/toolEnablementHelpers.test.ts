/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { countEnabledCustomizationTools, countEnabledTools, getToolSetTriState, isToolEnabledInSet, IToolEnablementState, setToolEnabled, setToolSetEnabled } from '../../../../browser/widget/input/toolEnablementHelpers.js';

suite('toolEnablementHelpers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const SET = 'set1';
	const TOOLS = ['t1', 't2', 't3'];

	function state(toolSets: [string, boolean][] = [], tools: [string, boolean][] = []): IToolEnablementState {
		return { toolSets: new Map(toolSets), tools: new Map(tools) };
	}

	test('default state: all tools enabled, tool set checked', () => {
		const s = state();
		assert.strictEqual(getToolSetTriState(s, SET, TOOLS), true);
		assert.strictEqual(isToolEnabledInSet(s, SET, 't1'), true);
	});

	test('disabling the tool set disables all member tools', () => {
		const s = setToolSetEnabled(state(), SET, TOOLS, false);
		assert.strictEqual(getToolSetTriState(s, SET, TOOLS), false);
		assert.strictEqual(isToolEnabledInSet(s, SET, 't1'), false);
		assert.strictEqual(isToolEnabledInSet(s, SET, 't2'), false);
		assert.strictEqual(isToolEnabledInSet(s, SET, 't3'), false);
	});

	test('toggling one tool off from an all-on set yields mixed and keeps others on', () => {
		const s = setToolEnabled(state(), SET, TOOLS, 't2', false);
		assert.strictEqual(getToolSetTriState(s, SET, TOOLS), 'mixed');
		assert.strictEqual(isToolEnabledInSet(s, SET, 't1'), true);
		assert.strictEqual(isToolEnabledInSet(s, SET, 't2'), false);
		assert.strictEqual(isToolEnabledInSet(s, SET, 't3'), true);
	});

	test('turning the last-off tool back on collapses to a fully-enabled set', () => {
		let s = setToolEnabled(state(), SET, TOOLS, 't2', false);
		s = setToolEnabled(s, SET, TOOLS, 't2', true);
		assert.strictEqual(getToolSetTriState(s, SET, TOOLS), true);
		// Collapsed representation: no explicit per-tool or per-set overrides remain.
		assert.strictEqual(s.toolSets.size, 0);
		assert.strictEqual(s.tools.size, 0);
	});

	test('enabling one tool from a fully-disabled set yields mixed', () => {
		let s = setToolSetEnabled(state(), SET, TOOLS, false);
		s = setToolEnabled(s, SET, TOOLS, 't1', true);
		assert.strictEqual(getToolSetTriState(s, SET, TOOLS), 'mixed');
		assert.strictEqual(isToolEnabledInSet(s, SET, 't1'), true);
		assert.strictEqual(isToolEnabledInSet(s, SET, 't2'), false);
	});

	test('enabling all tools individually collapses back to set-on', () => {
		let s = setToolSetEnabled(state(), SET, TOOLS, false);
		s = setToolEnabled(s, SET, TOOLS, 't1', true);
		s = setToolEnabled(s, SET, TOOLS, 't2', true);
		s = setToolEnabled(s, SET, TOOLS, 't3', true);
		assert.strictEqual(getToolSetTriState(s, SET, TOOLS), true);
		assert.strictEqual(s.toolSets.size, 0);
		assert.strictEqual(s.tools.size, 0);
	});

	test('re-enabling the whole set from mixed clears per-tool overrides', () => {
		let s = setToolEnabled(state(), SET, TOOLS, 't2', false);
		s = setToolSetEnabled(s, SET, TOOLS, true);
		assert.strictEqual(getToolSetTriState(s, SET, TOOLS), true);
		assert.strictEqual(s.toolSets.size, 0);
		assert.strictEqual(s.tools.size, 0);
	});

	test('countEnabledTools counts effectively-enabled tools across sets', () => {
		const sets = [
			{ id: SET, toolIds: TOOLS },
			{ id: 'set2', toolIds: ['u1', 'u2'] },
		];
		// All enabled by default: 3 + 2 = 5.
		assert.strictEqual(countEnabledTools(state(), sets), 5);
		// Disable set2 entirely: only set1's 3 remain.
		assert.strictEqual(countEnabledTools(setToolSetEnabled(state(), 'set2', ['u1', 'u2'], false), sets), 3);
		// Mixed set1 (t2 off): 2 + 2 = 4.
		assert.strictEqual(countEnabledTools(setToolEnabled(state(), SET, TOOLS, 't2', false), sets), 4);
	});

	test('countEnabledCustomizationTools filters surfaced sets and counts enabled tools', () => {
		const toolSet = (id: string, toolIds: string[], flags?: { deprecated?: boolean }) => ({
			id,
			deprecated: flags?.deprecated,
			getTools: () => toolIds.map(tid => ({ id: tid })),
		});
		const toolSets = [
			toolSet('shown', ['a1', 'a2']),
			toolSet('deprecated', ['b1'], { deprecated: true }),
			toolSet('empty', []),
		];

		// Only non-deprecated, non-empty sets count: 'shown' → 2.
		assert.strictEqual(countEnabledCustomizationTools(toolSets, state()), 2);
		// Disabling the 'shown' set drops its tools → 0.
		assert.strictEqual(countEnabledCustomizationTools(toolSets, setToolSetEnabled(state(), 'shown', ['a1', 'a2'], false)), 0);
	});
});
