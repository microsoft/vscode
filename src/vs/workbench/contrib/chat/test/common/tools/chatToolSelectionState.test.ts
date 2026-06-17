/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { computeAgentHostToolEnablement, isAgentHostBackendProvidedTool, ToolEnablementStates } from '../../../common/tools/chatToolSelectionState.js';
import { ILanguageModelToolsService, IToolAndToolSetEnablementMap, IToolData, IToolSet, isToolSet, ToolDataSource } from '../../../common/tools/languageModelToolsService.js';

suite('chatToolSelectionState', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	function makeTool(id: string, toolReferenceName: string | undefined, canBeReferencedInPrompt = true): IToolData {
		return { id, toolReferenceName, displayName: id, modelDescription: id, canBeReferencedInPrompt, source: ToolDataSource.Internal };
	}

	function makeToolSet(id: string, tools: readonly IToolData[]): IToolSet {
		return new class extends mock<IToolSet>() {
			override readonly id = id;
			override getTools(): Iterable<IToolData> { return tools; }
		};
	}

	function makeToolsService(toolSets: readonly IToolSet[]): ILanguageModelToolsService {
		return new class extends mock<ILanguageModelToolsService>() {
			override getToolSetsForModel(): Iterable<IToolSet> { return toolSets; }
		};
	}

	function emptyState(): ToolEnablementStates {
		return { toolSets: new Map(), tools: new Map() };
	}

	/** Renders the enablement map as a stable `{ id -> enabled }` object (tool sets prefixed with `set:`). */
	function byId(map: IToolAndToolSetEnablementMap): Record<string, boolean> {
		const out: Record<string, boolean> = {};
		for (const [item, enabled] of map) {
			out[isToolSet(item) ? `set:${item.id}` : item.id] = enabled;
		}
		return out;
	}

	suite('ToolEnablementStates serialization', () => {

		test('round-trips through storage', () => {
			const state: ToolEnablementStates = { toolSets: new Map([['s1', true], ['s2', false]]), tools: new Map([['t1', true]]) };
			const restored = ToolEnablementStates.fromStorage(ToolEnablementStates.toStorage(state));
			assert.deepStrictEqual([[...restored.toolSets], [...restored.tools]], [[['s1', true], ['s2', false]], [['t1', true]]]);
		});

		test('migrates legacy V1 disabled lists to false entries', () => {
			const v1 = JSON.stringify({ disabledTools: ['t1'], disabledToolSets: ['s1'] });
			const restored = ToolEnablementStates.fromStorage(v1);
			assert.deepStrictEqual([[...restored.toolSets], [...restored.tools]], [[['s1', false]], [['t1', false]]]);
		});

		test('returns empty state for invalid data', () => {
			const restored = ToolEnablementStates.fromStorage('not json');
			assert.deepStrictEqual([[...restored.toolSets], [...restored.tools]], [[], []]);
		});
	});

	suite('isAgentHostBackendProvidedTool', () => {

		test('matches backend reference names only', () => {
			assert.strictEqual(isAgentHostBackendProvidedTool(makeTool('x', 'readFile')), true);
			assert.strictEqual(isAgentHostBackendProvidedTool(makeTool('x', 'runSubagent')), true);
			assert.strictEqual(isAgentHostBackendProvidedTool(makeTool('x', 'codebase')), false);
			assert.strictEqual(isAgentHostBackendProvidedTool(makeTool('x', undefined)), false);
		});
	});

	suite('computeAgentHostToolEnablement', () => {

		test('hides backend-provided standalone tools and defaults the rest on', () => {
			const tools = [makeTool('t.read', 'readFile'), makeTool('t.normal', 'normal')];
			const result = computeAgentHostToolEnablement(makeToolsService([]), emptyState(), tools, undefined, undefined);
			assert.deepStrictEqual(byId(result), { 't.normal': true });
		});

		test('honors explicit per-tool selection but never revives backend tools', () => {
			const tools = [makeTool('t.read', 'readFile'), makeTool('t.a', 'a'), makeTool('t.b', 'b')];
			const state: ToolEnablementStates = { toolSets: new Map(), tools: new Map([['t.read', true], ['t.a', false]]) };
			const result = computeAgentHostToolEnablement(makeToolsService([]), state, tools, undefined, undefined);
			assert.deepStrictEqual(byId(result), { 't.a': false, 't.b': true });
		});

		test('hides backend tool-set members and omits all-backend tool sets', () => {
			const read = makeTool('t.read', 'readFile');
			const edit = makeTool('t.edit', 'editFiles');
			const rename = makeTool('t.rename', 'rename');
			const mixed = makeToolSet('set.mixed', [read, rename]);
			const allBackend = makeToolSet('set.allBackend', [read, edit]);
			const result = computeAgentHostToolEnablement(makeToolsService([mixed, allBackend]), emptyState(), [], undefined, undefined);
			assert.deepStrictEqual(byId(result), { 't.rename': true, 'set:set.mixed': true });
		});

		test('a disabled tool set hides its members unless individually opted in', () => {
			const a = makeTool('t.a', 'a');
			const b = makeTool('t.b', 'b');
			const set = makeToolSet('set.s', [a, b]);
			const state: ToolEnablementStates = { toolSets: new Map([['set.s', false]]), tools: new Map([['t.a', true]]) };
			const result = computeAgentHostToolEnablement(makeToolsService([set]), state, [], undefined, undefined);
			assert.deepStrictEqual(byId(result), { 't.a': true, 't.b': false, 'set:set.s': false });
		});
	});
});
